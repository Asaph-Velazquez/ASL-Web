import test from 'node:test';
import assert from 'node:assert/strict';
import { searchStays } from './staySearch.ts';

const stays = Object.freeze([
  Object.freeze({ stayId: 'room-10', roomNumber: '10', guestName: 'Asaph', additionalGuests: ['José García'] }),
  Object.freeze({ stayId: 'room-7', roomNumber: '7', guestName: 'María López' }),
  Object.freeze({ stayId: 'room-200', roomNumber: '200', guestName: null }),
]);

test('CPM_STF_002: one and two digit room numbers filter immediately', () => {
  assert.deepEqual(searchStays(stays, '10').map(stay => stay.stayId), ['room-10']);
  assert.deepEqual(searchStays(stays, '7').map(stay => stay.stayId), ['room-7']);
  assert.deepEqual(searchStays(stays, ' 10 ').map(stay => stay.stayId), ['room-10']);
});

test('CPM_STF_002: complete and partial guest names match without a minimum length', () => {
  for (const query of ['Asaph', 'As', 'aSAPH']) {
    assert.deepEqual(searchStays(stays, query).map(stay => stay.stayId), ['room-10']);
  }
  assert.deepEqual(searchStays(stays, 'm').map(stay => stay.stayId), ['room-7']);
});

test('CPM_STF_002: accents, whitespace and additional guests retain readable matching', () => {
  assert.deepEqual(searchStays(stays, 'JOSE GARCIA').map(stay => stay.stayId), ['room-10']);
  assert.deepEqual(searchStays(stays, ' maria   lopez ').map(stay => stay.stayId), ['room-7']);
});

test('CPM_STF_002: clearing search restores the existing room filter without mutating its data', () => {
  const roomFilter = stays.filter(stay => stay.roomNumber === '10');
  assert.deepEqual(searchStays(roomFilter, '7'), []);
  assert.deepEqual(searchStays(roomFilter, ''), roomFilter);
  assert.deepEqual(searchStays(stays, '   '), stays);
  assert.deepEqual(searchStays(stays, 'missing'), []);
  assert.equal(stays.length, 3);
  assert.equal(stays[0].guestName, 'Asaph');
});
