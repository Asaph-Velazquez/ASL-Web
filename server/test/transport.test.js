import test from 'node:test';
import assert from 'node:assert/strict';
import { persistTransportOperation, handleTransportMessage, validateTaxiSchedule } from '../services/transport.js';
import { persistNewRequest, persistRequestUpdate, persistRequestCancellation, mergeRequestDetails } from '../services/requestPersistence.js';
import { sanitizeWSMessage, schemas } from '../middleware/security.js';
import { Request } from '../models/index.js';
import { EventEmitter } from 'node:events';
import { initializeSocket, sendRequestMessage } from '../services/socketInitialization.js';
import { broadcastRequest, publicRequest } from '../services/requestBroadcast.js';

const staff = { isStaff: true, username: 'Reception' };
const guest = { isStaff: false, stayId: 'stay-1', guestName: 'Guest' };
const option = { id: 'car-1', vehicleType: 'car', vehicleCount: 2, totalCapacity: 8, priceCents: 12345 };
const vehicles = [{ vehiclePlate: 'AAA-1', vehicleModel: 'Sedan', vehicleColor: 'Blue' },
  { vehiclePlate: 'AAA-2', vehicleModel: 'Sedan' }];
const initial = () => ({ _id: 'mongo-id', requestId: 'taxi-1', stayId: guest.stayId,
  status: 'pending', mutationVersion: 0, history: [],
  details: { serviceType: 'taxi', passengerCount: 6, timeMode: 'now', destinationLabel: 'Airport' } });

// Executes the actual query predicates and modifiers in memory, including CAS conflicts.
function repository(seed = initial()) {
  let state = structuredClone(seed);
  const matches = filter => state && Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object') {
      if ('$exists' in value) return Object.hasOwn(state, key) === value.$exists;
      if ('$in' in value) return value.$in.includes(state[key]);
    }
    return state[key] === value;
  });
  return {
    get state() { return structuredClone(state); },
    writes: 0,
    beforeWrite: null,
    findOne(filter) { return { lean: async () => matches(filter) ? structuredClone(state) : null }; },
    findOneAndUpdate(filter, update) {
      return { lean: async () => {
        if (this.beforeWrite) {
          const hook = this.beforeWrite;
          this.beforeWrite = null;
          await hook();
        }
        if (!matches(filter)) return null;
        Object.assign(state, structuredClone(update.$set || {}));
        for (const [key, increment] of Object.entries(update.$inc || {})) state[key] = (state[key] || 0) + increment;
        for (const [key, entry] of Object.entries(update.$push || {})) (state[key] ||= []).push(structuredClone(entry));
        this.writes += 1;
        return structuredClone(state);
      } };
    },
    async create(document) {
      if (state?.requestId === document.requestId) {
        const error = new Error('Duplicate request ID');
        error.code = 11000;
        throw error;
      }
      state = structuredClone(document);
      return { toObject: () => structuredClone(state) };
    },
  };
}
const publish = (db, options = [option], actor = staff) => persistTransportOperation('PUBLISH_TRANSPORT_OPTIONS', { id: 'taxi-1', options }, actor, db);
const accept = (db, revision = 1, optionId = option.id, actor = guest) => persistTransportOperation('ACCEPT_TRANSPORT_OPTION', { id: 'taxi-1', revision, optionId }, actor, db);
const assign = (db, revision = 1, assigned = vehicles, actor = staff) => persistTransportOperation('ASSIGN_TRANSPORT_VEHICLES', { id: 'taxi-1', revision, vehicles: assigned }, actor, db);

test('publication, immutable acceptance, assignment, archive and reacceptance lifecycle', async () => {
  const db = repository();
  const published = await publish(db);
  assert.equal(published.details.transportProposals.publishedBy, staff.username);
  assert.ok(published.details.transportProposals.publishedAt);
  await assert.rejects(assign(db), /must be accepted/);
  const accepted = await accept(db);
  assert.deepEqual(accepted.details.transportAcceptance.option, option);
  const writes = db.writes;
  assert.deepEqual(await accept(db), accepted);
  assert.equal(db.writes, writes);
  const assigned = await assign(db);
  assert.deepEqual(assigned.details.transportResponse.vehicles, vehicles);
  assert.equal(assigned.details.transportResponse.vehiclePlate, vehicles[0].vehiclePlate);
  assert.equal(assigned.details.transportResponse.vehicleModel, vehicles[0].vehicleModel);
  assert.equal(assigned.details.transportResponse.transportCost, '123.45');
  assert.equal(assigned.details.transportResponse.updatedBy, staff.username);
  const revised = await publish(db, [{ ...option, priceCents: 0 }]);
  assert.equal(revised.details.transportProposals.revision, 2);
  assert.equal(revised.details.transportAcceptance, undefined);
  assert.equal(revised.details.transportResponse, undefined);
  assert.deepEqual(revised.details.transportArchive[0].transportProposals, published.details.transportProposals);
  assert.deepEqual(revised.details.transportArchive[0].transportAcceptance, accepted.details.transportAcceptance);
  assert.deepEqual(revised.details.transportArchive[0].transportResponse, assigned.details.transportResponse);
  await assert.rejects(accept(db), /Stale/);
  await assert.rejects(assign(db), /Stale/);
  await assert.rejects(assign(db, 2), /must be accepted/);
  await accept(db, 2);
  assert.equal((await assign(db, 2)).details.transportResponse.transportCost, '0.00');
});

test('staff-only publishing/assignment and owner-guest-only acceptance', async () => {
  const db = repository();
  await assert.rejects(publish(db, [option], guest), /Unauthorized/);
  await publish(db);
  for (const actor of [staff, {}, { ...guest, stayId: 'other-stay' }]) {
    await assert.rejects(accept(db, 1, option.id, actor), /Unauthorized/);
  }
  await accept(db);
  await assert.rejects(assign(db, 1, vehicles, guest), /Unauthorized/);
});

test('guest chooses among distinct proposals and accepted details persist across revisions', async () => {
  const db = repository();
  const alternatives = [
    { ...option, description: 'Two sedans, one suitcase per vehicle' },
    { id: 'van-2', vehicleType: 'van', vehicleCount: 1, totalCapacity: 6, priceCents: 18000, description: '  Van with space for six suitcases  ' },
  ];
  const published = await publish(db, alternatives);
  assert.equal(published.details.transportProposals.options.length, 2);
  const expected = { ...alternatives[1], description: alternatives[1].description.trim() };
  assert.deepEqual(published.details.transportProposals.options[1], expected);
  const accepted = await accept(db, 1, 'van-2');
  assert.deepEqual(accepted.details.transportAcceptance.option, expected);
  const assigned = await assign(db, 1, [vehicles[0]]);
  assert.equal(assigned.details.transportResponse.transportCost, '180.00');
  const revised = await publish(db, [{ ...expected, priceCents: 19000, description: 'Updated offer' }]);
  assert.deepEqual(revised.details.transportArchive[0].transportAcceptance.option, expected);
  assert.equal(revised.details.transportAcceptance, undefined);
  await assert.rejects(accept(db, 1, 'van-2'), /Stale/);
  assert.equal((await accept(db, 2, 'van-2')).details.transportAcceptance.option.priceCents, 19000);
});

test('proposal descriptions are optional, bounded plain text', async () => {
  for (const description of ['', '  ', 'x'.repeat(241), '<script>', 'line\nbreak', 123, null]) {
    const db = repository();
    await assert.rejects(publish(db, [{ ...option, description }]));
    assert.equal(db.writes, 0);
  }
  assert.equal((await publish(repository(), [{ ...option, description: 'x'.repeat(240) }])).details.transportProposals.options[0].description.length, 240);
});

test('only active taxi requests allow transport operations', async () => {
  for (const status of ['completed', 'cancelled']) {
    const db = repository({ ...initial(), status });
    await assert.rejects(publish(db), /not active/);
    await assert.rejects(accept(db), /not active/);
    await assert.rejects(assign(db), /not active/);
    assert.equal(db.writes, 0);
  }
  await assert.rejects(publish(repository({ ...initial(), details: { serviceType: 'laundry' } })), /not a taxi/);
});

test('strict option validation, IDs, capacity and vehicle validation', async () => {
  for (const invalid of [{ vehicleType: 'truck' }, { vehicleCount: 0 }, { vehicleCount: 1.5 },
    { totalCapacity: 0 }, { priceCents: -1 }, { priceCents: 0.5 }, { priceCents: Infinity },
    { priceCents: Number.MAX_SAFE_INTEGER + 1 }, { id: '<bad>' }, { extra: true }]) {
    await assert.rejects(publish(repository(), [{ ...option, ...invalid }]));
  }
  await assert.rejects(publish(repository(), []));
  await assert.rejects(publish(repository(), [option, option]), /Duplicate/);
  await assert.rejects(publish(repository(), [{ ...option, totalCapacity: 3 }]), /capacity/);
  const db = repository();
  const generated = await publish(db, [{ ...option, id: undefined }]);
  assert.ok(generated.details.transportProposals.options[0].id);
  await publish(db);
  await assert.rejects(accept(db, 2, 'missing'), /Unknown/);
  await accept(db, 2);
  await assert.rejects(assign(db, 2, [vehicles[0]]), /count/);
  await assert.rejects(assign(db, 2, [vehicles[0], vehicles[0]]), /Duplicate/);
  await assert.rejects(assign(db, 2, [{ ...vehicles[0], vehicleModel: '<script>' }, vehicles[1]]));
});

test('a different option cannot replace an accepted option in the same revision', async () => {
  const db = repository();
  await publish(db, [option, { ...option, id: 'other' }]);
  await accept(db);
  await assert.rejects(accept(db, 1, 'other'), /already accepted/);
});

test('concurrent publications do not lose history; legacy documents get a version', async () => {
  const seed = initial();
  delete seed.mutationVersion;
  const db = repository(seed);
  const results = await Promise.allSettled([publish(db), publish(db)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const conflict = results.find(result => result.status === 'rejected').reason;
  assert.equal(conflict.current.mutationVersion, 1);
  await publish(db);
  assert.equal(db.state.details.transportArchive.length, 1);
});

test('simultaneous identical acceptances are idempotent', async () => {
  const db = repository();
  await publish(db);
  const results = await Promise.all([accept(db), accept(db)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(db.writes, 2);
});

test('generic updates preserve protected state and retry a race without losing transport or other details', async () => {
  const db = repository();
  await publish(db);
  await accept(db);
  db.beforeWrite = () => assign(db);
  const updated = await persistRequestUpdate({ id: 'taxi-1', status: 'in-progress', details: {
    staffNote: 'Meet in lobby', transportProposals: null, transportAcceptance: null,
    transportArchive: [], transportResponse: { transportCost: '0.01' }, transportCost: '0.01',
  } }, staff, db);
  assert.equal(updated.status, 'in-progress');
  assert.equal(updated.details.staffNote, 'Meet in lobby');
  assert.equal(updated.details.destinationLabel, 'Airport');
  assert.equal(updated.details.transportResponse.transportCost, '123.45');
  assert.deepEqual(updated.details.transportAcceptance.option, option);
  assert.equal(updated.details.transportCost, undefined);
  assert.equal(updated.details.transportProposals.revision, 1);
  assert.equal(updated.details.transportArchive, undefined);
  assert.deepEqual(mergeRequestDetails(updated.details, null), updated.details);
  assert.equal(mergeRequestDetails(null, { transportAcceptance: {}, transportResponse: {} }), null);
  await assert.rejects(persistRequestUpdate({ id: 'taxi-1' }, guest, db), /Unauthorized/);
});

test('cancellation enforces owner and terminal states and prevents racing acceptance', async () => {
  const db = repository();
  await publish(db);
  await assert.rejects(persistRequestCancellation({ id: 'taxi-1' }, { ...guest, stayId: 'other' }, db));
  db.beforeWrite = () => persistRequestCancellation({ id: 'taxi-1', cancelledBy: 'staff' }, guest, db);
  await assert.rejects(accept(db), error => error.current?.status === 'cancelled');
  assert.equal(db.state.cancelledBy, 'guest');
  assert.equal(db.state.details.transportAcceptance, undefined);
  assert.equal((await persistRequestCancellation({ id: 'taxi-1' }, guest, db)).status, 'cancelled');
  await assert.rejects(persistRequestUpdate({ id: 'taxi-1', status: 'pending' }, staff, db), /Terminal/);
  const completed = repository({ ...initial(), status: 'completed' });
  await assert.rejects(persistRequestCancellation({ id: 'taxi-1' }, staff, completed), error => error.current?.status === 'completed');
});

test('generic completion wins a race with publication', async () => {
  const db = repository();
  db.beforeWrite = () => persistRequestUpdate({ id: 'taxi-1', status: 'completed' }, staff, db);
  await assert.rejects(publish(db), error => error.current?.status === 'completed');
  assert.equal(db.state.details.transportProposals, undefined);
});

test('NEW_REQUEST rejects seeded protected details and cannot overwrite duplicate IDs', async () => {
  for (const field of ['transportProposals', 'transportAcceptance', 'transportResponse', 'transportArchive', 'transportCost']) {
    await assert.rejects(persistNewRequest({ id: 'new', details: { [field]: null } }, guest, repository()), /Transport fields/);
  }
  const db = repository();
  await publish(db);
  const before = db.state;
  await assert.rejects(persistNewRequest({ id: 'taxi-1' }, guest, db), /Duplicate/);
  assert.deepEqual(db.state, before);
  const created = await persistNewRequest({ id: 'new', status: 'completed', details: { serviceType: 'taxi', timeMode: 'scheduled', scheduledAt: new Date(Date.now() + 172800000).toISOString() } }, guest, db);
  assert.equal(created.status, 'pending');
  assert.equal(created.stayId, guest.stayId);
});

test('scheduled taxis require at least 24 hours using server time, including generic edits', async () => {
  const now = Date.now();
  const details = { serviceType: 'taxi', timeMode: 'scheduled' };
  assert.doesNotThrow(() => validateTaxiSchedule({ ...details, scheduledAt: new Date(now + 86400000).toISOString() }, now));
  for (const scheduledAt of [undefined, 'invalid', new Date(now + 86399999).toISOString()]) {
    assert.throws(() => validateTaxiSchedule({ ...details, scheduledAt }, now), /24 hours/);
  }
  await assert.rejects(persistNewRequest({ id: 'new', details }, guest, repository()), /24 hours/);
  await assert.rejects(persistRequestUpdate({ id: 'taxi-1', details }, staff, repository()), /24 hours/);
});

test('wire envelopes correlate validation, authorization and stale failures; persist precedes broadcast', async () => {
  const db = repository();
  const sent = [];
  const broadcasts = [];
  const persist = (operation, payload, actor) => persistTransportOperation(operation, payload, actor, db);
  const handle = message => handleTransportMessage(message, guest, value => sent.push(value), value => {
    assert.ok(db.writes > 0);
    broadcasts.push(value);
  }, persist);
  await publish(db);
  await handle({ type: 'ACCEPT_TRANSPORT_OPTION', operationId: 'op-1', payload: { id: 'taxi-1', revision: 1, optionId: option.id } });
  assert.deepEqual(sent.pop(), { type: 'TRANSPORT_RESULT', payload: { operationId: 'op-1', ok: true } });
  assert.deepEqual(broadcasts[0].payload.details, db.state.details);
  assert.equal(broadcasts[0].payload.id, 'taxi-1');
  await publish(db);
  await handle({ type: 'ACCEPT_TRANSPORT_OPTION', operationId: 'op-2', payload: { id: 'taxi-1', revision: 1, optionId: option.id } });
  assert.equal(sent[0].type, 'UPDATE_REQUEST');
  assert.equal(sent[0].payload.details.transportProposals.revision, 2);
  assert.equal(sent[1].payload.ok, false);
  assert.equal(sent[1].payload.operationId, 'op-2');
  assert.equal(broadcasts.length, 1);
  await handle({ type: 'ACCEPT_TRANSPORT_OPTION', operationId: 'op-3', payload: {} });
  assert.equal(sent.at(-1).payload.operationId, 'op-3');
  assert.equal(sent.at(-1).payload.ok, false);
  await handle({ type: 'PUBLISH_TRANSPORT_OPTIONS', operationId: 'op-4', payload: { id: 'taxi-1', options: [option] } });
  assert.match(sent.at(-1).payload.error, /Unauthorized/);
});

test('sanitizer preserves arrays, numeric fields and correlation, removing unsafe nested keys', () => {
  const raw = JSON.parse('{"type":"PUBLISH_TRANSPORT_OPTIONS","operationId":"op-1","payload":{"id":"taxi-1","options":[{"vehicleCount":2,"priceCents":12345}],"__proto__":{"polluted":true},"nested":{"$set":{},"a.b":1,"text":"<tag>"}}}');
  const sanitized = sanitizeWSMessage(raw);
  assert.ok(Array.isArray(sanitized.payload.options));
  assert.equal(sanitized.payload.options[0].priceCents, 12345);
  assert.equal(sanitized.operationId, 'op-1');
  assert.deepEqual(sanitized.payload.nested, { text: 'tag' });
  assert.equal(Object.hasOwn(sanitized.payload, '__proto__'), false);
  assert.equal(schemas.wsMessage.parse(sanitized).operationId, 'op-1');
});

test('Mongoose accepts transport history event types and mutation version', async () => {
  const document = new Request({ requestId: 'id', roomNumber: '101', guestName: 'Guest', type: 'services', message: 'Taxi',
    history: ['PUBLISH_TRANSPORT_OPTIONS', 'ACCEPT_TRANSPORT_OPTION', 'ASSIGN_TRANSPORT_VEHICLES'].map(eventType => ({ eventType })) });
  await document.validate();
  assert.equal(document.mutationVersion, 0);
});

test('assignment cannot survive a concurrent revised publication', async () => {
  const db = repository();
  await publish(db);
  await accept(db);
  db.beforeWrite = () => publish(db);
  await assert.rejects(assign(db), error => error.current?.details.transportProposals.revision === 2);
  assert.equal(db.state.details.transportResponse, undefined);
  assert.equal(db.state.details.transportAcceptance, undefined);
  assert.equal(db.state.details.transportArchive[0].transportAcceptance.optionId, option.id);
});

test('only one of two simultaneous different acceptances wins', async () => {
  const db = repository();
  await publish(db, [option, { ...option, id: 'other' }]);
  const results = await Promise.allSettled([accept(db), accept(db, 1, 'other')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(db.writes, 2);
});

test('cancellation after acceptance preserves accepted snapshot', async () => {
  const db = repository();
  await publish(db);
  await accept(db);
  const result = await persistRequestCancellation({ requestId: 'taxi-1' }, guest, db);
  assert.equal(result.status, 'cancelled');
  assert.deepEqual(result.details.transportAcceptance.option, option);
  await assert.rejects(assign(db), /not active/);
});

test('failed persistence and missing correlation never broadcast success', async () => {
  const sent = [];
  const broadcast = () => assert.fail('Must not broadcast');
  const message = { type: 'PUBLISH_TRANSPORT_OPTIONS', operationId: 'op-1', payload: { id: 'taxi-1', options: [option] } };
  await handleTransportMessage(message, staff, value => sent.push(value), broadcast,
    async () => { throw new Error('Persistence failed'); });
  assert.deepEqual(sent[0], { type: 'TRANSPORT_RESULT', payload: { operationId: 'op-1', ok: false, error: 'Persistence failed' } });
  await handleTransportMessage({ ...message, operationId: undefined }, staff, value => sent.push(value), broadcast,
    async () => assert.fail('Must validate correlation before persistence'));
  assert.equal(sent[1].payload.ok, false);
});

test('accepted cents retain exact formatting at the safe integer boundary', async () => {
  const db = repository();
  await publish(db, [{ ...option, priceCents: Number.MAX_SAFE_INTEGER }]);
  await accept(db);
  assert.equal((await assign(db)).details.transportResponse.transportCost, '90071992547409.91');
});

const creation = () => ({ id: 'taxi-1', type: 'services', message: 'Taxi to airport', priority: 'medium',
  roomNumber: '101', details: { serviceType: 'taxi', passengerCount: 6, destinationLabel: 'Airport',
    timeMode: 'scheduled', scheduledAt: new Date(Date.now() + 86401000).toISOString() } });

test('own-stay creation retry survives staff changes, timestamp changes, and 24-hour boundary', async t => {
  const db = repository(null);
  const payload = creation();
  const now = Date.now();
  await persistNewRequest(payload, guest, db);
  await publish(db);
  await accept(db);
  await assign(db);
  await persistRequestUpdate({ id: payload.id, status: 'completed', details: { staffNote: 'Done' } }, staff, db);
  const before = db.state;
  t.mock.method(Date, 'now', () => now + 60000);
  const retry = await persistNewRequest({ ...payload, timestamp: new Date().toISOString() }, guest, db);
  assert.deepEqual(retry, before);
  assert.deepEqual(db.state, before);
  assert.equal(retry.status, 'completed');
  assert.equal(publicRequest(retry).creationFingerprint, undefined);
});

test('duplicate creation rejects other stays, anonymous/staff and changed business input', async () => {
  const db = repository(null);
  const payload = creation();
  await persistNewRequest(payload, guest, db);
  const before = db.state;
  for (const actor of [{ ...guest, stayId: 'other' }, {}, staff]) {
    await assert.rejects(persistNewRequest(payload, actor, db), /Duplicate/);
  }
  for (const change of [{ message: 'different' }, { priority: 'high' }, { details: { ...payload.details, passengerCount: 2 } }]) {
    await assert.rejects(persistNewRequest({ ...payload, ...change }, guest, db), /Duplicate/);
  }
  assert.deepEqual(db.state, before);
});

test('simultaneous identical NEW_REQUEST creates only once and both succeed', async () => {
  const db = repository(null);
  const payload = creation();
  const [first, second] = await Promise.all([persistNewRequest(payload, guest, db), persistNewRequest(payload, guest, db)]);
  assert.deepEqual(first, second);
  assert.equal(db.state.history.length, 1);
});

test('new immediate taxis rejected while historical immediate taxis remain usable', async () => {
  const payload = creation();
  payload.details.timeMode = 'now';
  await assert.rejects(persistNewRequest(payload, guest, repository(null)), /24 hours/);
  const db = repository();
  await publish(db);
  await accept(db);
});

test('legacy valet and unquoted taxi responses merge on active/completed but not cancelled requests', async () => {
  for (const serviceType of ['valet', 'taxi']) {
    for (const status of ['pending', 'in-progress', 'completed']) {
      const db = repository({ ...initial(), status, details: { serviceType, timeMode: 'now',
        transportResponse: { vehiclePlate: 'OLD', vehicleModel: 'Sedan', transportCost: '10.00' } } });
      const updated = await persistRequestUpdate({ id: 'taxi-1', details: {
        transportResponse: { vehiclePlate: 'NEW', transportCost: '25.00' },
      } }, staff, db);
      assert.equal(updated.details.transportResponse.vehiclePlate, 'NEW');
      assert.equal(updated.details.transportResponse.vehicleModel, 'Sedan');
      assert.equal(updated.details.transportResponse.transportCost, '25.00');
      assert.equal(updated.status, status);
    }
    const db = repository({ ...initial(), status: 'cancelled', details: { serviceType } });
    await assert.rejects(persistRequestUpdate({ id: 'taxi-1', details: { transportResponse: { vehiclePlate: 'NEW' } } }, staff, db), /Cancelled/);
  }
});

test('generic response cannot bypass quote protection before acceptance or after completion', async () => {
  const db = repository();
  await publish(db);
  const attempted = { id: 'taxi-1', details: { transportProposals: null, transportResponse: { transportCost: '1.00' } } };
  const waiting = await persistRequestUpdate(attempted, staff, db);
  assert.equal(waiting.details.transportResponse, undefined);
  await accept(db);
  await assign(db);
  const completed = await persistRequestUpdate({ ...attempted, status: 'completed' }, staff, db);
  assert.equal(completed.details.transportResponse.transportCost, '123.45');
  assert.equal((await persistRequestUpdate(attempted, staff, db)).details.transportResponse.transportCost, '123.45');
});

test('request/quote broadcasts reach only staff and owning stay; missing stay is staff-only', async () => {
  const actors = [staff, guest, { ...guest, stayId: 'other' }, {}, undefined, { ...guest }];
  const received = actors.map(() => []);
  const sockets = actors.map((_, index) => ({ readyState: index === 5 ? 3 : 1,
    send: value => received[index].push(JSON.parse(value)) }));
  const metadata = new WeakMap(sockets.map((socket, index) => [socket, actors[index]]));
  const db = repository();
  await handleTransportMessage({ type: 'PUBLISH_TRANSPORT_OPTIONS', operationId: 'op-1',
    payload: { id: 'taxi-1', options: [option] } }, staff, () => {},
  (message, request) => broadcastRequest(message, request, sockets, metadata),
  (operation, payload, actor) => persistTransportOperation(operation, payload, actor, db));
  assert.deepEqual(received.map(messages => messages.length), [1, 1, 0, 0, 0, 0]);
  assert.equal(received[1][0].payload.details.transportProposals.options[0].priceCents, option.priceCents);
  broadcastRequest({ type: 'NEW_REQUEST', payload: publicRequest(db.state) }, db.state, sockets, metadata);
  assert.deepEqual(received.map(messages => messages.length), [2, 2, 0, 0, 0, 0]);
  broadcastRequest({ type: 'UPDATE_REQUEST' }, { stayId: null }, sockets, metadata);
  assert.deepEqual(received.map(messages => messages.length), [3, 2, 0, 0, 0, 0]);
});

test('historical text-only taxi and valet requests retain manual response support', async () => {
  for (const message of ['Taxi please', 'Valet parking']) {
    const db = repository({ ...initial(), status: 'completed', message, details: null });
    const updated = await persistRequestUpdate({ id: 'taxi-1', details: {
      transportResponse: { vehiclePlate: 'ABC', vehicleModel: 'Sedan', transportCost: '10.00' },
    } }, staff, db);
    assert.equal(updated.details.transportResponse.vehiclePlate, 'ABC');
  }
});

test('concurrent differing NEW_REQUEST payload never overwrites the winning creation', async () => {
  const db = repository(null);
  const payload = creation();
  const results = await Promise.allSettled([persistNewRequest(payload, guest, db),
    persistNewRequest({ ...payload, message: 'Different destination' }, guest, db)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(db.state.message, payload.message);
  assert.equal(db.state.history.length, 1);
});

test('legacy response edit racing publication cannot reintroduce manual quote cost', async () => {
  const db = repository();
  db.beforeWrite = () => publish(db);
  const result = await persistRequestUpdate({ id: 'taxi-1', details: {
    transportResponse: { vehiclePlate: 'ABC', transportCost: '1.00' },
  } }, staff, db);
  assert.equal(result.details.transportProposals.revision, 1);
  assert.equal(result.details.transportResponse, undefined);
});

test('Home legacy save can label historical TAXI without adding or validating an unchanged schedule', async () => {
  for (const details of [null, { timeMode: 'now' }, { timeMode: 'scheduled', scheduledAt: '2020-01-01T12:00:00Z' }]) {
    const db = repository({ ...initial(), message: 'TAXI please', status: 'completed', details });
    const result = await persistRequestUpdate({ id: 'taxi-1', details: {
      ...details, serviceType: 'taxi', transportResponse: { vehiclePlate: 'ABC', vehicleModel: 'Sedan', transportCost: '50' },
    } }, staff, db);
    assert.equal(result.details.transportResponse.transportCost, '50');
    assert.equal(result.status, 'completed');
    await assert.rejects(persistRequestUpdate({ id: 'taxi-1', details: { scheduledAt: '2021-01-01T12:00:00Z' } }, staff, db), /24 hours/);
  }
});

test('published taxi inputs remain canonical when Home sends stale full details with a status update', async () => {
  const details = { ...initial().details, hasLuggage: true, sourceMode: 'text_guided',
    destinationId: 'airport', destinationCategory: 'travel', destinationCoords: { latitude: 1, longitude: 2 },
    summary: 'Original summary' };
  const db = repository({ ...initial(), details });
  await publish(db);
  await accept(db);
  const result = await persistRequestUpdate({ id: 'taxi-1', status: 'in-progress', details: {
    ...details, passengerCount: 100, hasLuggage: false, sourceMode: 'asl_guided', destinationId: 'other',
    destinationLabel: 'Other', destinationCategory: 'other', destinationCoords: { latitude: 5, longitude: 6 },
    destinationPlaceId: 'new', timeMode: 'scheduled', scheduledAt: '2020-01-01', summary: 'Changed',
    serviceType: 'valet', staffNote: 'Lobby', transportProposals: null,
  } }, staff, db);
  for (const [key, value] of Object.entries(details)) assert.deepEqual(result.details[key], value);
  assert.equal(result.details.scheduledAt, undefined);
  assert.equal(result.details.destinationPlaceId, undefined);
  assert.equal(result.details.staffNote, 'Lobby');
  assert.equal(result.status, 'in-progress');
  assert.deepEqual(result.details.transportAcceptance.option, option);
});

function fakeSocket() {
  const socket = new EventEmitter();
  socket.readyState = 1;
  socket.sent = [];
  socket.send = data => socket.sent.push(JSON.parse(data));
  socket.close = code => { socket.closeCode = code; socket.readyState = 3; socket.emit('close'); };
  return socket;
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('listener captures onopen messages and sends INIT before queued broadcasts and operations', async () => {
  const socket = fakeSocket();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const operations = [];
  const ready = initializeSocket(socket, async () => {
    await gate;
    socket.send(JSON.stringify({ type: 'INIT_REQUESTS', payload: { requests: [{ id: 'taxi-1', mutationVersion: 3 }] } }));
  }, async data => {
    operations.push(data.toString());
    await nextTurn();
    sendRequestMessage(socket, JSON.stringify({ type: 'UPDATE_REQUEST', payload: { mutationVersion: 4 + operations.length } }));
  });
  assert.equal(socket.listenerCount('message'), 1);
  socket.emit('message', Buffer.from('first'));
  socket.emit('message', Buffer.from('second'));
  sendRequestMessage(socket, JSON.stringify({ type: 'UPDATE_REQUEST', payload: { mutationVersion: 2 } }));
  assert.equal(socket.sent.length, 0);
  assert.deepEqual(operations, []);
  release();
  await ready;
  for (let i = 0; i < 6; i += 1) await nextTurn();
  assert.deepEqual(operations, ['first', 'second']);
  assert.deepEqual(socket.sent.map(message => message.type), ['INIT_REQUESTS', 'UPDATE_REQUEST', 'UPDATE_REQUEST', 'UPDATE_REQUEST']);
  assert.equal(socket.sent[1].payload.mutationVersion, 2);
});

test('failed initialization closes explicitly without executing buffered operations', async () => {
  const socket = fakeSocket();
  const errors = [];
  const ready = initializeSocket(socket, async () => { throw new Error('DB unavailable'); },
    () => assert.fail('Must not mutate without initialization'), error => errors.push(error.message));
  socket.emit('message', Buffer.from('new-request'));
  sendRequestMessage(socket, JSON.stringify({ type: 'UPDATE_REQUEST' }));
  await ready;
  await nextTurn();
  assert.deepEqual(errors, ['DB unavailable']);
  assert.equal(socket.closeCode, 1011);
  assert.equal(socket.sent.length, 0);
});

test('queued messages are discarded on disconnect and initialization queue is bounded', async () => {
  const socket = fakeSocket();
  let release;
  const ready = initializeSocket(socket, () => new Promise(resolve => { release = resolve; }),
    () => assert.fail('Closed socket must not mutate'));
  await nextTurn();
  for (let i = 0; i < 101; i += 1) socket.emit('message', Buffer.from('request'));
  assert.equal(socket.closeCode, 1009);
  release();
  await ready;
  await nextTurn();
});
