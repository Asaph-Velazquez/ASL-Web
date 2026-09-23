import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import mongoose from 'mongoose';
import WebSocket from 'ws';

const uri = process.env.TEST_MONGODB_URI;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function poll(fn, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await delay(40);
  }
  throw new Error('Timed out waiting for test condition');
}

test('isolated HTTP, MongoDB and WebSocket integration', { skip: !uri, timeout: 90000 }, async t => {
  // Never load .env or connect this opt-in suite to a nonlocal/database URI.
  const target = new URL(uri);
  assert.equal(target.protocol, 'mongodb:');
  assert.equal(target.hostname, '127.0.0.1');
  assert.match(target.pathname, /^\/asl_qa_[a-zA-Z0-9_-]+$/);
  assert.equal(process.env.TEST_ALLOW_EPHEMERAL_DB, '1');
  target.pathname += `_${randomUUID().replaceAll('-', '')}`;
  const runDirectory = mkdtempSync(path.join(tmpdir(), 'asl-web-qa-'));
  const connection = await mongoose.createConnection(target.toString(), { serverSelectionTimeoutMS: 5000 }).asPromise();
  const requests = connection.collection('requests');
  const sockets = [];
  let child;
  let output;
  t.after(async () => {
    for (const socket of sockets) socket.ws.terminate();
    if (child && child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    if (output) await new Promise(resolve => output.end(resolve));
    await connection.close();
  });
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const secret = randomUUID() + randomUUID();
  const entry = fileURLToPath(new URL('../index.js', import.meta.url));
  child = spawn(process.execPath, [entry], {
    cwd: runDirectory,
    windowsHide: true,
    env: { ...process.env, PORT: String(port), USE_HTTPS: 'false', NODE_ENV: 'test',
      MONGODB_URI: target.toString(), JWT_SECRET: secret, CALL_JWT_SECRET: secret,
      CALL_INTERNAL_TOKEN: randomUUID(), HOTEL_WS_PATH: '/ws/hotel',
      ENABLE_LEGACY_ROOT_WS: 'false', ALLOWED_ORIGINS: 'http://localhost:5173',
      CALL_PROXY_TARGET: 'http://127.0.0.1:1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  output = createWriteStream(path.join(process.env.QA_EVIDENCE_DIR || runDirectory, 'integration-server.log'));
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  child.on('error', error => t.diagnostic(`Server spawn error: ${error.message}`));
  await poll(async () => {
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  });

  async function api(method, route, token, body, extraHeaders = {}) {
    const started = performance.now();
    const response = await fetch(`${base}${route}`, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, data, headers: response.headers, ms: performance.now() - started };
  }
  async function connect(token) {
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/ws/hotel?token=${encodeURIComponent(token)}`);
    const peer = { ws, messages: [] };
    sockets.push(peer);
    ws.on('message', message => peer.messages.push(JSON.parse(message.toString())));
    await once(ws, 'open');
    await poll(() => peer.messages.find(message => message.type === 'INIT_REQUESTS'));
    return peer;
  }
  async function operation(peer, type, payload) {
    const operationId = randomUUID();
    peer.ws.send(JSON.stringify({ type, payload, operationId }));
    return poll(() => peer.messages.find(message => message.type === 'TRANSPORT_RESULT'
      && message.payload.operationId === operationId)?.payload);
  }
  const password = `Qa-${randomUUID()}`;
  assert.equal((await api('POST', '/api/staff/register', null,
    { username: 'qa-admin', password, fullName: 'QA Admin', role: 'admin' })).status, 201);
  const login = await api('POST', '/api/staff/login', null, { username: 'qa-admin', password });
  assert.equal(login.status, 200);
  const admin = login.data.token;
  assert.equal((await api('POST', '/api/staff/register', admin,
    { username: 'qa-staff', password, fullName: 'QA Staff', role: 'staff' })).status, 201);
  const staffLogin = await api('POST', '/api/staff/login', null, { username: 'qa-staff', password });
  assert.equal(staffLogin.status, 200);
  const staff = staffLogin.data.token;
  const stayInput = roomNumber => ({ roomNumber, guestName: `QA ${roomNumber}`,
    checkIn: new Date(Date.now() - 3600000).toISOString(),
    checkOut: new Date(Date.now() + 7 * 86400000).toISOString() });
  const a = await api('POST', '/api/stays', admin, stayInput('QA-A'));
  const b = await api('POST', '/api/stays', admin, stayInput('QA-B'));
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const guestA = a.data.qrToken;
  const guestB = b.data.qrToken;

  await t.test('API-01 health and security response headers', async () => {
    const response = await api('GET', '/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'ok');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('content-security-policy'));
  });
  await t.test('API-02 authentication and admin roles on real routes', async () => {
    assert.equal((await api('GET', '/api/stays')).status, 401);
    assert.equal((await api('GET', '/api/stays', 'invalid-token')).status, 401);
    assert.equal((await api('GET', '/api/stays', guestA)).status, 403);
    assert.equal((await api('GET', '/api/staff/list', staff)).status, 403);
    assert.equal((await api('GET', '/api/staff/list', admin)).status, 200);
    assert.equal((await api('GET', '/api/logs/stays', staff)).status, 403);
  });
  await t.test('API-03 valid guest session and invalid session', async () => {
    assert.equal((await api('POST', '/api/auth/validate', guestA)).data.valid, true);
    assert.equal((await api('POST', '/api/auth/validate', 'invalid')).status, 401);
  });
  await t.test('API-04 stay conflicts, dates and payload validation', async () => {
    assert.equal((await api('POST', '/api/stays', staff, stayInput('QA-A'))).status, 409);
    assert.equal((await api('POST', '/api/stays', staff, { ...stayInput('QA-C'), checkOut: '2020-01-01' })).status, 400);
    assert.equal((await api('POST', '/api/stays', staff, { ...stayInput('QA-C'), roomNumber: { $ne: '' } })).status, 400);
    assert.equal((await api('PATCH', `/api/stays/${b.data.stayId}`, staff, { roomNumber: 'QA-A' })).status, 409);
  });
  await t.test('API-05 CORS allowlist rejects foreign origin', async () => {
    const allowed = await api('GET', '/api/health', null, null, { Origin: 'http://localhost:5173' });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal((await api('GET', '/api/health', null, null, { Origin: 'https://qa.invalid' })).status, 403);
  });
  await t.test('API-06 protected registration rejects invalid JWT with 401', async () => {
    const response = await api('POST', '/api/staff/register', 'invalid', { username: 'unauthorized', password, fullName: 'QA' });
    assert.equal(response.status, 401);
  });
  await t.test('API-07 oversized JSON body is rejected', async () => {
    assert.equal((await api('POST', '/api/stays', staff, { oversized: 'x'.repeat(11000) })).status, 413);
  });
  await t.test('API-08 password excluded from staff list and statistics accessible', async () => {
    const users = (await api('GET', '/api/staff/list', admin)).data.users;
    assert.ok(users.length >= 2);
    assert.ok(users.every(user => !Object.hasOwn(user, 'password')));
    assert.equal((await api('GET', '/api/stats/ratings', staff)).status, 200);
    assert.equal((await api('GET', '/api/calls/interpreter-reports', staff)).status, 200);
  });

  const operator = await connect(staff);
  const owner = await connect(guestA);
  const other = await connect(guestB);
  const taxiId = 'qa-taxi';
  const taxi = { id: taxiId, type: 'services', message: 'QA taxi', priority: 'medium',
    details: { serviceType: 'taxi', sourceMode: 'ASL', destinationId: 'qa-destination',
      destinationLabel: 'QA destination', destinationCategory: 'tourist',
      destinationCoords: { latitude: 19.4326, longitude: -99.1332 },
      timeMode: 'scheduled', scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(), passengerCount: 6, hasLuggage: true } };
  const options = [
    { id: 'cars', vehicleType: 'car', vehicleCount: 2, totalCapacity: 8, priceCents: 12345, description: 'QA two cars' },
    { id: 'van', vehicleType: 'van', vehicleCount: 1, totalCapacity: 6, priceCents: 18000 },
  ];
  await t.test('INT-01 NEW_REQUEST persists before ACK and reaches owning stay/staff only', async () => {
    assert.equal((await operation(owner, 'NEW_REQUEST', taxi)).ok, true);
    const document = await requests.findOne({ requestId: taxiId });
    assert.equal(document.stayId, a.data.stayId);
    assert.equal(document.details.sourceMode, 'ASL');
    await poll(() => operator.messages.find(m => m.type === 'NEW_REQUEST' && m.payload.id === taxiId));
    await delay(120);
    assert.ok(!other.messages.some(m => m.payload?.id === taxiId));
  });
  await t.test('INT-02 repeated creation is idempotent in MongoDB', async () => {
    assert.equal((await operation(owner, 'NEW_REQUEST', taxi)).ok, true);
    assert.equal(await requests.countDocuments({ requestId: taxiId }), 1);
  });
  await t.test('INT-03 taxi less than 24 hours is rejected without insert', async () => {
    assert.equal((await operation(owner, 'NEW_REQUEST', { ...taxi, id: 'too-soon', details: { ...taxi.details, scheduledAt: new Date(Date.now() + 3600000).toISOString() } })).ok, false);
    assert.equal(await requests.countDocuments({ requestId: 'too-soon' }), 0);
  });
  await t.test('INT-04 staff publishes alternatives, guest cannot publish or accept another stay', async () => {
    assert.equal((await operation(owner, 'PUBLISH_TRANSPORT_OPTIONS', { id: taxiId, options })).ok, false);
    assert.equal((await operation(operator, 'PUBLISH_TRANSPORT_OPTIONS', { id: taxiId, options })).ok, true);
    assert.equal((await operation(other, 'ACCEPT_TRANSPORT_OPTION', { id: taxiId, revision: 1, optionId: 'cars' })).ok, false);
  });
  await t.test('INT-05 concurrent identical acceptance has one audit event', async () => {
    const payload = { id: taxiId, revision: 1, optionId: 'cars' };
    const second = await connect(guestA);
    const results = await Promise.all([operation(owner, 'ACCEPT_TRANSPORT_OPTION', payload), operation(second, 'ACCEPT_TRANSPORT_OPTION', payload)]);
    assert.ok(results.every(result => result.ok));
    const doc = await requests.findOne({ requestId: taxiId });
    assert.equal(doc.details.transportAcceptance.option.priceCents, 12345);
    assert.equal(doc.history.filter(h => h.eventType === 'ACCEPT_TRANSPORT_OPTION').length, 1);
  });
  await t.test('INT-06 exact vehicle count and accepted price persisted', async () => {
    const vehicles = [{ vehiclePlate: 'QA-A', vehicleModel: 'Sedan' }, { vehiclePlate: 'QA-B', vehicleModel: 'Sedan', vehicleColor: 'Blue' }];
    assert.equal((await operation(operator, 'ASSIGN_TRANSPORT_VEHICLES', { id: taxiId, revision: 1, vehicles: vehicles.slice(0, 1) })).ok, false);
    assert.equal((await operation(operator, 'ASSIGN_TRANSPORT_VEHICLES', { id: taxiId, revision: 1, vehicles })).ok, true);
    const doc = await requests.findOne({ requestId: taxiId });
    assert.equal(doc.details.transportResponse.vehicles.length, 2);
    assert.equal(doc.details.transportResponse.transportCost, '123.45');
  });
  await t.test('INT-07 generic status update preserves assignment', async () => {
    operator.ws.send(JSON.stringify({ type: 'UPDATE_REQUEST', payload: { id: taxiId, status: 'in-progress' } }));
    const doc = await poll(async () => { const d = await requests.findOne({ requestId: taxiId }); return d.status === 'in-progress' && d; });
    assert.equal(doc.details.transportResponse.vehicles.length, 2);
  });
  await t.test('INT-08 new revision archives acceptance and rejects stale choice', async () => {
    assert.equal((await operation(operator, 'PUBLISH_TRANSPORT_OPTIONS', { id: taxiId, options })).ok, true);
    assert.equal((await operation(owner, 'ACCEPT_TRANSPORT_OPTION', { id: taxiId, revision: 1, optionId: 'cars' })).ok, false);
    const doc = await requests.findOne({ requestId: taxiId });
    assert.equal(doc.details.transportProposals.revision, 2);
    assert.ok(!doc.details.transportAcceptance);
    assert.ok(!doc.details.transportResponse);
    assert.equal(doc.details.transportArchive.length, 1);
  });
  await t.test('INT-09 reconnect reloads canonical persisted history', async () => {
    const fresh = await connect(guestA);
    const doc = fresh.messages.find(m => m.type === 'INIT_REQUESTS').payload.requests.find(r => r.id === taxiId);
    assert.equal(doc.details.transportProposals.revision, 2);
  });
  await t.test('INT-10 cancellation blocks subsequent proposals', async () => {
    owner.ws.send(JSON.stringify({ type: 'CANCEL_REQUEST', payload: { id: taxiId } }));
    await poll(async () => (await requests.findOne({ requestId: taxiId }))?.status === 'cancelled');
    assert.equal((await operation(operator, 'PUBLISH_TRANSPORT_OPTIONS', { id: taxiId, options })).ok, false);
  });
  await t.test('INT-11 valet manual response survives completion without taxi cost', async () => {
    owner.ws.send(JSON.stringify({ type: 'NEW_REQUEST', payload: { id: 'qa-valet', type: 'services', message: 'VALET', details: { serviceType: 'valet' } } }));
    await poll(() => requests.findOne({ requestId: 'qa-valet' }));
    operator.ws.send(JSON.stringify({ type: 'UPDATE_REQUEST', payload: { id: 'qa-valet', status: 'completed', details: { transportResponse: { vehiclePlate: 'QA-V', vehicleModel: 'Sedan' } } } }));
    const doc = await poll(async () => { const d = await requests.findOne({ requestId: 'qa-valet' }); return d.status === 'completed' && d; });
    assert.equal(doc.details.transportResponse.vehiclePlate, 'QA-V');
    assert.ok(!doc.details.transportResponse.transportCost);
  });
  await t.test('SEG-01 other stay cannot rate an owned request', async () => {
    other.ws.send(JSON.stringify({ type: 'RATE_REQUEST', payload: { id: 'qa-valet', rating: 4 } }));
    await poll(() => other.messages.find(m => m.error) || operator.messages.find(m => m.type === 'RATE_REQUEST' && m.payload.id === 'qa-valet'));
    const doc = await requests.findOne({ requestId: 'qa-valet' });
    assert.equal(doc.rating ?? null, null, 'Other stay must not change rating');
  });
  await t.test('SEG-02 ratings outside 1-5 must not persist', async () => {
    owner.ws.send(JSON.stringify({ type: 'RATE_REQUEST', payload: { id: 'qa-valet', rating: 99 } }));
    await poll(() => owner.messages.find(m => m.error) || operator.messages.find(m => m.type === 'RATE_REQUEST' && m.payload.rating === 99));
    const doc = await requests.findOne({ requestId: 'qa-valet' });
    assert.ok(doc.rating === null || (doc.rating >= 1 && doc.rating <= 5), 'Out-of-range rating persisted');
  });
  async function ratingAttempt(peer, id, rating) {
    const before = peer.messages.length;
    peer.ws.send(JSON.stringify({ type: 'RATE_REQUEST', payload: { id, rating } }));
    return poll(() => peer.messages.slice(before).find(m => m.error || (m.type === 'RATE_REQUEST' && m.payload.id === id)));
  }
  await t.test('SEG-04 staff and non-completed requests cannot be rated', async () => {
    const before = await requests.findOne({ requestId: 'qa-valet' });
    assert.ok((await ratingAttempt(operator, 'qa-valet', 3)).error);
    const after = await requests.findOne({ requestId: 'qa-valet' });
    assert.equal(after.mutationVersion, before.mutationVersion);
    assert.ok((await ratingAttempt(owner, taxiId, 3)).error);
    assert.equal((await requests.findOne({ requestId: taxiId })).rating ?? null, null);
  });
  await t.test('SEG-05 owning guest can rate boundaries; invalid values preserve stored rating', async () => {
    for (const rating of [1, 5]) {
      assert.equal((await ratingAttempt(owner, 'qa-valet', rating)).type, 'RATE_REQUEST');
      assert.equal((await requests.findOne({ requestId: 'qa-valet' })).rating, rating);
    }
    const before = await requests.findOne({ requestId: 'qa-valet' });
    for (const rating of [0, -1, 6, 1.5, '5', null]) {
      assert.ok((await ratingAttempt(owner, 'qa-valet', rating)).error);
      const after = await requests.findOne({ requestId: 'qa-valet' });
      assert.equal(after.rating, 5);
      assert.equal(after.mutationVersion, before.mutationVersion);
      assert.equal(after.history.length, before.history.length);
    }
  });
  await t.test('REN-01 descriptive local health latency sample, not a load benchmark', async () => {
    const timings = [];
    for (let i = 0; i < 10; i++) {
      const response = await api('GET', '/api/health');
      assert.equal(response.status, 200);
      timings.push(response.ms);
    }
    timings.sort((a, b) => a - b);
    t.diagnostic(`health sample n=10 concurrency=1 p50_ms=${timings[4].toFixed(2)} p95_ms=${timings[9].toFixed(2)}; no performance SLO asserted`);
  });
  await t.test('SEG-03 invalid login attempts are rate limited', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/api/staff/login', null, { username: 'not-found', password })).status, 401);
    assert.equal((await api('POST', '/api/staff/login', null, { username: 'not-found', password })).status, 429);
  });
});
