import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentAcceptance, formatTransportPrice, parseTransportPrice, transportAcceptanceStatus, transportResult, validOptions, validVehicles } from './transport.ts';

const option = { id: 'one', vehicleType: 'van', vehicleCount: 1, totalCapacity: 6, priceCents: 12345 };

test('options cover groups of 1-6 with positive safe integer values', () => {
  for (let passengers = 1; passengers <= 6; passengers++) assert.equal(validOptions([option], passengers), true);
  for (const passengers of [0, 7, 1.5, undefined, '2']) assert.equal(validOptions([option], passengers), false);
  assert.equal(validOptions([], 2), false);
  for (const invalid of [
    { totalCapacity: 1 }, { totalCapacity: 2.5 }, { vehicleCount: 0 }, { vehicleCount: 1.5 },
    { vehicleCount: 101 }, { vehicleCount: 7, totalCapacity: 6 }, { totalCapacity: 10001 },
    { priceCents: -1 }, { priceCents: 1.2 }, { priceCents: Number.MAX_SAFE_INTEGER + 1 }, { vehicleType: 'taxi' },
  ]) assert.equal(validOptions([{ ...option, ...invalid }], 2), false);
  assert.equal(validOptions([{ ...option, priceCents: 0 }], 2), true);
  assert.equal(validOptions(Array(21).fill(option), 2), false);
  assert.equal(validOptions(Array(20).fill(option), 2), true);
});

test('MXN prices are explicit exact cents, not seeded or rounded from excess decimals', () => {
  assert.equal(parseTransportPrice('123.45'), 12345);
  assert.equal(parseTransportPrice('0.01'), 1);
  assert.equal(parseTransportPrice('10.1'), 1010);
  assert.equal(parseTransportPrice('0'), 0);
  assert.equal(parseTransportPrice('90071992547409.91'), Number.MAX_SAFE_INTEGER);
  assert.match(formatTransportPrice(Number.MAX_SAFE_INTEGER), /\.91 MXN$/);
  assert.match(formatTransportPrice(0), /0\.00 MXN$/);
  for (const price of ['', '-1', '12.345', '1e2', 'NaN', '1,000', '9007199254740992']) {
    assert.equal(Number.isNaN(parseTransportPrice(price)), true);
  }
});

test('optional guest descriptions allow readable details and reject invalid content', () => {
  assert.equal(validOptions([option, { ...option, description: 'Van, room for six suitcases' }], 6), true);
  assert.equal(validOptions([{ ...option, description: 'x'.repeat(240) }], 6), true);
  for (const description of ['', ' ', 'x'.repeat(241), '<script>', 'line\nbreak', 123, null]) {
    assert.equal(validOptions([{ ...option, description }], 6), false);
  }
});

test('assignment requires a selection in the current published revision', () => {
  const details = {
    transportProposals: { revision: 2, options: [option] },
    transportAcceptance: { revision: 1, optionId: 'one', option },
  };
  assert.equal(currentAcceptance(details), null);
  details.transportAcceptance.revision = 2;
  assert.equal(currentAcceptance(details), details.transportAcceptance);
  details.transportAcceptance.optionId = 'removed';
  assert.equal(currentAcceptance(details), null);
  assert.equal(currentAcceptance({}), null);
});

test('vehicles match exact count, have plate/model, and cannot repeat plates', () => {
  const vehicle = { vehiclePlate: 'ABC-123', vehicleModel: 'Van' };
  assert.equal(validVehicles([vehicle], 1), true);
  assert.equal(validVehicles([vehicle], 2), false);
  assert.equal(validVehicles([], 0), false);
  assert.equal(validVehicles([{ ...vehicle, vehicleModel: ' ' }], 1), false);
  assert.equal(validVehicles([vehicle, { ...vehicle, vehiclePlate: ' abc-123 ' }], 2), false);
  assert.equal(validVehicles([vehicle, { ...vehicle, vehiclePlate: 'XYZ-456', vehicleColor: 'Blue' }], 2), true);
  for (const invalid of ['<script>', 'a\nb', 'x'.repeat(101)]) {
    assert.equal(validVehicles([{ ...vehicle, vehicleModel: invalid }], 1), false);
    assert.equal(validVehicles([{ ...vehicle, vehicleColor: invalid }], 1), false);
  }
  assert.equal(validVehicles([{ ...vehicle, vehicleColor: ' ' }], 1), true);
});

test('canonical republishing clears assignment and still displays reacceptance', () => {
  let details = {
    transportProposals: { revision: 1, options: [option] },
    transportAcceptance: { revision: 1, optionId: option.id, option },
    transportResponse: { vehicles: [{ vehiclePlate: 'A', vehicleModel: 'Van' }] },
  };
  assert.equal(transportAcceptanceStatus(details), 'Guest selection accepted');
  // UPDATE_REQUEST carries replacement details, not a merge with the previous revision.
  details = { transportProposals: { revision: 2, options: [{ ...option, id: 'two' }] } };
  assert.equal(currentAcceptance(details), null);
  assert.equal(details.transportResponse, undefined);
  assert.equal(transportAcceptanceStatus(details), 'New revision: pending guest reacceptance');
  assert.equal(transportAcceptanceStatus({ transportProposals: { revision: 1, options: [option] } }), 'Pending guest acceptance');
});

test('only the matching boolean TRANSPORT_RESULT confirms the operation', () => {
  const operationId = 'operation-123';
  assert.deepEqual(transportResult({ type: 'TRANSPORT_RESULT', payload: { operationId, ok: true } }, operationId), { ok: true, error: undefined });
  assert.deepEqual(transportResult({ type: 'TRANSPORT_RESULT', payload: { operationId, ok: false, error: 'Stale transport revision' } }, operationId), { ok: false, error: 'Stale transport revision' });
  for (const message of [
    { type: 'UPDATE_REQUEST', payload: { operationId, ok: true } },
    { type: 'TRANSPORT_RESULT', payload: { operationId: 'other', ok: true } },
    { type: 'TRANSPORT_RESULT', payload: { operationId, ok: 'true' } },
    { type: 'TRANSPORT_RESULT' },
  ]) assert.equal(transportResult(message, operationId), null);
});
