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
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

const uri = process.env.TEST_GLOSS_MONGODB_URI;
const translator = process.env.TEST_GLOSS_TRANSLATOR_URL;
const translatorEngine = process.env.TEST_GLOSS_TRANSLATOR_ENGINE || 'asl-translator-fp32';
async function poll(fn, timeout = 18000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('Timed out waiting for isolated gloss integration');
}

test('real ONNX translation reaches reception through authenticated WebSocket and MongoDB', {
  skip: !uri || !translator, timeout: 90000,
}, async t => {
  const expectedVariants = {
    'asl-translator-fp32': 'fp32',
    'asl-translator-int8-dynamic': 'int8-dynamic',
  };
  assert.ok(Object.hasOwn(expectedVariants, translatorEngine), 'Unsupported test translator engine');
  const target = new URL(uri);
  assert.equal(target.protocol, 'mongodb:');
  assert.equal(target.hostname, '127.0.0.1');
  assert.match(target.pathname, /^\/qa_gloss_[a-zA-Z0-9_-]+$/);
  assert.equal(process.env.TEST_ALLOW_EPHEMERAL_DB, '1');
  const service = new URL(translator);
  assert.equal(service.protocol, 'http:');
  assert.ok(['127.0.0.1', 'localhost'].includes(service.hostname));
  assert.equal(service.username, '');
  assert.equal(service.password, '');
  target.pathname += `_${randomUUID().replaceAll('-', '')}`;
  assert.ok(Buffer.byteLength(target.pathname.slice(1)) <= 63,
    'Use a shorter qa_gloss_ database name so the isolated UUID suffix fits MongoDB limits');
  const connection = await mongoose.createConnection(target.toString(), { serverSelectionTimeoutMS: 5000 }).asPromise();
  const sockets = [];
  const directory = mkdtempSync(path.join(tmpdir(), 'qa-gloss-'));
  let child;
  let output;
  t.after(async () => {
    for (const peer of sockets) peer.ws.terminate();
    if (child && child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    if (output) await new Promise(resolve => output.end(resolve));
    assert.equal(connection.name, target.pathname.slice(1));
    assert.match(connection.name, /^qa_gloss_[a-zA-Z0-9_-]+_[a-f0-9]{32}$/);
    await connection.dropDatabase();
    await connection.close();
  });
  const health = await fetch(new URL('/health', translator), { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: 'ok', model: 'asl_gloss_to_english', variant: expectedVariants[translatorEngine],
  });
  const secret = randomUUID() + randomUUID();
  const staffId = new mongoose.Types.ObjectId();
  await connection.collection('staffusers').insertOne({ _id: staffId, username: 'qa-gloss-staff',
    fullName: 'QA Gloss Staff', role: 'staff' });
  const stayId = `qa-gloss-${randomUUID()}`;
  const anotherStayId = `qa-gloss-${randomUUID()}`;
  await connection.collection('stays').insertMany([stayId, anotherStayId].map(id => ({
    stayId: id, roomNumber: 'QA-GLOSS', guestName: 'QA Gloss Guest', active: true, status: 'active',
    checkIn: new Date(Date.now() - 3600000), checkOut: new Date(Date.now() + 86400000),
  })));
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [fileURLToPath(new URL('../index.js', import.meta.url))], {
    cwd: directory, windowsHide: true,
    env: { ...process.env, PORT: String(port), USE_HTTPS: 'false', NODE_ENV: 'test',
      MONGODB_URI: target.toString(), JWT_SECRET: secret, CALL_JWT_SECRET: secret,
      CALL_INTERNAL_TOKEN: randomUUID(), HOTEL_WS_PATH: '/ws/hotel',
      ENABLE_LEGACY_ROOT_WS: 'false', ALLOWED_ORIGINS: 'http://localhost:5173',
      CALL_PROXY_TARGET: 'http://127.0.0.1:1', GLOSS_TRANSLATOR_URL: translator,
      GLOSS_TRANSLATOR_TIMEOUT_MS: '10000', GLOSS_TRANSLATOR_ENGINE: translatorEngine },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  output = createWriteStream(path.join(directory, 'server.log'));
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  await poll(async () => {
    if (child.exitCode !== null) throw new Error('Isolated Web server exited before ready');
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  });
  async function connect(claims) {
    const token = jwt.sign(claims, secret, { expiresIn: '5m' });
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/ws/hotel?token=${encodeURIComponent(token)}`);
    const peer = { ws, messages: [] };
    sockets.push(peer);
    ws.on('message', data => peer.messages.push(JSON.parse(data.toString())));
    await once(ws, 'open');
    await poll(() => peer.messages.find(message => message.type === 'INIT_REQUESTS'));
    return peer;
  }
  const staff = await connect({ userId: String(staffId), role: 'staff', username: 'qa-gloss-staff' });
  const guest = await connect({ stayId, roomNumber: 'QA-GLOSS', guestName: 'QA Gloss Guest' });
  const other = await connect({ stayId: anotherStayId, roomNumber: 'QA-GLOSS', guestName: 'QA Other Guest' });
  async function send(payload) {
    const operationId = randomUUID();
    guest.ws.send(JSON.stringify({ type: 'NEW_REQUEST', operationId, payload }));
    return poll(() => guest.messages.find(message => message.type === 'TRANSPORT_RESULT'
      && message.payload.operationId === operationId)?.payload);
  }
  const input = { id: `qa-gloss-request-${randomUUID()}`, type: 'room-service',
    message: 'Room Service: I_ME NEED WATER', priority: 'medium',
    details: { sourceMode: 'asl', generatedFromSignCapture: true },
    translation: { original: 'forged', english: 'forged' } };
  await t.test('English is persisted and broadcast only to reception and owning stay', async () => {
    assert.equal((await send(input)).ok, true);
    const reception = await poll(() => staff.messages.find(message => message.type === 'NEW_REQUEST'
      && message.payload.id === input.id));
    assert.notEqual(reception.payload.message, input.message);
    assert.match(reception.payload.message, /water/i);
    assert.ok(reception.payload.message.startsWith('Room Service: '));
    assert.equal(reception.payload.translation.glossInput, 'I_ME NEED WATER');
    assert.equal(reception.payload.translation.original, input.message);
    assert.equal(reception.payload.translation.english, reception.payload.message);
    assert.equal(reception.payload.translation.engine, translatorEngine);
    assert.equal(reception.payload.creationFingerprint, undefined);
    await poll(() => guest.messages.find(message => message.type === 'NEW_REQUEST' && message.payload.id === input.id));
    assert.ok(!other.messages.some(message => message.type === 'NEW_REQUEST' && message.payload.id === input.id));
    const stored = await connection.collection('requests').findOne({ requestId: input.id });
    assert.equal(stored.message, reception.payload.message);
    assert.equal(stored.translation.original, input.message);
    assert.equal(stored.history[0].note, stored.message);
    assert.equal(stored.stayId, stayId);
  });
  await t.test('retry original remains idempotent and altered original is rejected', async () => {
    const before = await connection.collection('requests').findOne({ requestId: input.id });
    assert.equal((await send(input)).ok, true);
    assert.equal(await connection.collection('requests').countDocuments({ requestId: input.id }), 1);
    const after = await connection.collection('requests').findOne({ requestId: input.id });
    assert.equal(String(after.translation.translatedAt), String(before.translation.translatedAt));
    assert.equal((await send({ ...input, message: 'I_ME NEED TOWEL' })).ok, false);
  });
  await t.test('manual English remains unchanged and cannot forge translation metadata', async () => {
    const manual = { ...input, id: `qa-manual-${randomUUID()}`, message: 'I need more towels.',
      details: { sourceMode: 'text' }, translation: { original: 'forged' } };
    assert.equal((await send(manual)).ok, true);
    const stored = await connection.collection('requests').findOne({ requestId: manual.id });
    assert.equal(stored.message, manual.message);
    assert.equal(stored.translation.original, manual.message);
    assert.equal(stored.translation.inputType, 'english');
  });
  await t.test('gloss typed in text mode is translated and broadcast to reception', async () => {
    const manual = { ...input, id: `qa-text-gloss-${randomUUID()}`, message: 'I WATER NEED',
      details: { sourceMode: 'text' } };
    assert.equal((await send(manual)).ok, true);
    const stored = await connection.collection('requests').findOne({ requestId: manual.id });
    assert.equal(stored.translation.original, manual.message);
    assert.equal(stored.translation.inputType, 'gloss');
    assert.match(stored.message, /need water/i);
    const reception = await poll(() => staff.messages.find(message => message.type === 'NEW_REQUEST'
      && message.payload.id === manual.id));
    assert.equal(reception.payload.message, stored.message);
    assert.equal((await send(manual)).ok, true);
    assert.equal(await connection.collection('requests').countDocuments({ requestId: manual.id }), 1);
  });
  await t.test('camera draft edited to natural English keeps its exact text and category', async () => {
    const edited = { ...input, id: `qa-edited-${randomUUID()}`, message: 'FOOD: I need more towels.' };
    assert.equal((await send(edited)).ok, true);
    const stored = await connection.collection('requests').findOne({ requestId: edited.id });
    assert.equal(stored.message, edited.message);
    assert.equal(stored.translation.original, edited.message);
    assert.equal(stored.translation.glossInput, 'I need more towels.');
    assert.equal(stored.translation.inputType, 'english');
    const reception = await poll(() => staff.messages.find(message => message.type === 'NEW_REQUEST'
      && message.payload.id === edited.id));
    assert.equal(reception.payload.message, edited.message);
  });
  await t.test('oversized gloss fails explicitly without persisting or broadcasting a partial request', async () => {
    const invalid = { ...input, id: `qa-invalid-${randomUUID()}`, message: 'WATER '.repeat(600) };
    const failure = await send(invalid);
    assert.equal(failure.ok, false);
    assert.equal(failure.code, 'GLOSS_TRANSLATION_INVALID_INPUT');
    assert.equal(failure.retryable, false);
    assert.equal(await connection.collection('requests').countDocuments({ requestId: invalid.id }), 0);
    assert.ok(!staff.messages.some(message => message.type === 'NEW_REQUEST' && message.payload.id === invalid.id));
  });
});
