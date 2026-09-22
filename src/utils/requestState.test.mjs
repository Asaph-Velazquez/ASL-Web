import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceRequestMessage } from './requestState.ts';

test('idempotent creation rebroadcast upserts one staff card using canonical request ID', () => {
  let state = reduceRequestMessage([], { type: 'NEW_REQUEST', payload: { id: 'taxi-1', status: 'pending', mutationVersion: 0 } });
  state = reduceRequestMessage(state, { type: 'NEW_REQUEST', payload: { requestId: 'taxi-1', status: 'in-progress', mutationVersion: 2 } });
  assert.equal(state.length, 1);
  assert.equal(state[0].status, 'in-progress');
});

test('delayed update cannot replace the accepted revision and new revision removes acceptance', () => {
  let state = reduceRequestMessage([], { type: 'NEW_REQUEST', payload: { id: 'taxi-1', mutationVersion: 3, details: { transportAcceptance: { revision: 1 } } } });
  state = reduceRequestMessage(state, { type: 'UPDATE_REQUEST', payload: { id: 'taxi-1', mutationVersion: 2, details: {} } });
  assert.equal(state[0].details.transportAcceptance.revision, 1);
  state = reduceRequestMessage(state, { type: 'UPDATE_REQUEST', payload: { id: 'taxi-1', mutationVersion: 4, details: { transportProposals: { revision: 2 } } } });
  assert.equal(state[0].details.transportAcceptance, undefined);
  assert.equal(state[0].details.transportProposals.revision, 2);
});

test('history arriving after live updates preserves newer records and adds missing requests', () => {
  const current = [{ id: 'taxi-1', mutationVersion: 3, status: 'in-progress' }];
  const state = reduceRequestMessage(current, { type: 'INIT_REQUESTS', payload: { requests: [
    { requestId: 'taxi-1', mutationVersion: 1, status: 'pending' },
    { requestId: 'taxi-2', mutationVersion: 0, status: 'pending' },
  ] } });
  assert.equal(state.length, 2);
  assert.equal(state.find(item => item.id === 'taxi-1').status, 'in-progress');
});
