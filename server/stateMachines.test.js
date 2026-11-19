import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createServerLifecycleState,
  serverLifecycleReducer,
  socketLivenessReducer,
} from './stateMachines.js';

test('server lifecycle allows one start, one shutdown and a terminal state', () => {
  let state = createServerLifecycleState();
  assert.equal(state.phase, 'starting');
  state = serverLifecycleReducer(state, { type: 'LISTENING' });
  assert.equal(state.phase, 'running');
  state = serverLifecycleReducer(state, { type: 'STOP', code: 0 });
  assert.equal(state.phase, 'stopping');
  state = serverLifecycleReducer(state, { type: 'CLOSED' });
  assert.equal(state.phase, 'stopped');

  assert.equal(serverLifecycleReducer(state, { type: 'LISTENING' }), state);
  assert.equal(serverLifecycleReducer(state, { type: 'STOP' }), state);
});

test('server failure is terminal and cannot be overwritten by shutdown', () => {
  let state = serverLifecycleReducer(createServerLifecycleState(), {
    type: 'FAIL',
    code: 1,
  });
  assert.equal(state.phase, 'failed');
  assert.equal(serverLifecycleReducer(state, { type: 'STOP' }), state);
});

test('WebSocket heartbeat requires a pong before the next heartbeat', () => {
  let state = 'alive';
  state = socketLivenessReducer(state, { type: 'PING_SENT' });
  assert.equal(state, 'awaiting-pong');
  state = socketLivenessReducer(state, { type: 'PONG' });
  assert.equal(state, 'alive');
  state = socketLivenessReducer(state, { type: 'PING_SENT' });
  state = socketLivenessReducer(state, { type: 'PING_SENT' });
  assert.equal(state, 'closed');
  assert.equal(socketLivenessReducer(state, { type: 'PONG' }), 'closed');
});
