import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditReducer,
  createAuditState,
  createNavigationState,
  createProcessDialogState,
  createRedactionState,
  createTelemetryState,
  navigationReducer,
  processDialogReducer,
  redactionReducer,
  routeFromHash,
  telemetryReducer,
} from './stateMachines.js';

test('navigation resolves only known routes and closes the drawer on navigation', () => {
  assert.equal(routeFromHash('#/processes'), 'processes');
  assert.equal(routeFromHash('#cpu'), 'cpu');
  assert.equal(routeFromHash('#/missing'), 'overview');

  let state = createNavigationState('#/overview');
  state = navigationReducer(state, { type: 'OPEN_DRAWER' });
  assert.equal(state.drawer, 'open');
  state = navigationReducer(state, { type: 'NAVIGATE', route: 'processes' });
  assert.deepEqual(state, { route: 'processes', drawer: 'closed' });

  const unchanged = navigationReducer(state, { type: 'NAVIGATE', route: 'unknown' });
  assert.equal(unchanged, state);
});

test('Escape and browser location changes are explicit navigation events', () => {
  let state = createNavigationState('#/audit');
  state = navigationReducer(state, { type: 'OPEN_DRAWER' });
  state = navigationReducer(state, { type: 'ESCAPE' });
  assert.equal(state.drawer, 'closed');
  state = navigationReducer(state, { type: 'LOCATION_CHANGED', hash: '#/battery' });
  assert.equal(state.route, 'battery');
});

test('telemetry connection and snapshot freshness transition independently', () => {
  let state = createTelemetryState();
  state = telemetryReducer(state, { type: 'START' });
  assert.equal(state.connection, 'connecting');

  state = telemetryReducer(state, { type: 'SOCKET_OPEN' });
  assert.equal(state.connection, 'streaming');

  state = telemetryReducer(state, {
    type: 'SNAPSHOT_RECEIVED',
    source: 'stream',
    timestamp: 100,
  });
  assert.equal(state.snapshot, 'fresh');
  assert.equal(state.lastUpdatedAt, 100);

  state = telemetryReducer(state, { type: 'SOCKET_CLOSED' });
  assert.equal(state.connection, 'retrying');

  state = telemetryReducer(state, {
    type: 'SNAPSHOT_RECEIVED',
    source: 'http',
    timestamp: 200,
  });
  assert.equal(state.connection, 'polling');
  assert.equal(state.snapshot, 'fresh');
});

test('telemetry pause rejects late socket and HTTP state changes', () => {
  let state = telemetryReducer(createTelemetryState(), { type: 'START' });
  state = telemetryReducer(state, { type: 'PAUSE' });
  const paused = state;

  state = telemetryReducer(state, { type: 'SOCKET_CLOSED' });
  state = telemetryReducer(state, {
    type: 'SNAPSHOT_RECEIVED',
    source: 'http',
    timestamp: 500,
  });

  assert.equal(state, paused);
  assert.equal(state.connection, 'paused');
});

test('unsupported WebSocket remains explicitly identified while polling succeeds', () => {
  let state = telemetryReducer(createTelemetryState(), { type: 'START' });
  state = telemetryReducer(state, { type: 'SOCKET_UNSUPPORTED', message: 'unsupported' });
  state = telemetryReducer(state, {
    type: 'SNAPSHOT_RECEIVED',
    source: 'http',
    timestamp: 300,
  });
  assert.equal(state.connection, 'unsupported');
  assert.equal(state.snapshot, 'fresh');
  assert.equal(state.error, 'unsupported');
});

test('audit requests end in a ready or error state without contradictory flags', () => {
  let state = createAuditState();
  assert.equal(state.phase, 'loading');
  state = auditReducer(state, { type: 'SUCCESS', audit: { score: 80 } });
  assert.equal(state.phase, 'ready');
  assert.equal(state.audit.score, 80);

  state = auditReducer(state, { type: 'REQUEST' });
  state = auditReducer(state, { type: 'FAILURE', message: 'offline' });
  assert.equal(state.phase, 'error');
  assert.equal(state.audit.score, 80);
  assert.equal(state.error, 'offline');
});

test('process termination enforces ordered, guarded transitions', () => {
  const process = { pid: 412, name: 'worker', privilegeClass: 'user-space' };
  let state = createProcessDialogState();
  state = processDialogReducer(state, { type: 'OPEN', process });
  assert.equal(state.phase, 'inspecting');

  state = processDialogReducer(state, { type: 'REQUEST_CONFIRMATION' });
  assert.equal(state.phase, 'confirming');

  state = processDialogReducer(state, { type: 'SET_SIGNAL', signal: 'SIGKILL' });
  assert.equal(state.signal, 'SIGKILL');

  state = processDialogReducer(state, { type: 'TERMINATION_STARTED' });
  assert.equal(state.phase, 'terminating');

  state = processDialogReducer(state, {
    type: 'TERMINATION_SUCCEEDED',
    status: { ok: true, message: 'terminated' },
  });
  assert.equal(state.phase, 'succeeded');
  assert.equal(state.status.ok, true);
});

test('protected processes cannot enter the termination workflow', () => {
  for (const process of [
    { pid: 1 },
    { pid: 0 },
    { pid: 2, isKernel: true },
    { pid: 3, privilegeClass: 'kernel-task' },
  ]) {
    let state = processDialogReducer(createProcessDialogState(), { type: 'OPEN', process });
    state = processDialogReducer(state, { type: 'REQUEST_CONFIRMATION' });
    assert.equal(state.phase, 'inspecting');
    state = processDialogReducer(state, { type: 'TERMINATION_STARTED' });
    assert.equal(state.phase, 'inspecting');
  }
});

test('failed process termination can be retried or cancelled', () => {
  const process = { pid: 510, name: 'worker' };
  let state = processDialogReducer(createProcessDialogState(), { type: 'OPEN', process });
  state = processDialogReducer(state, { type: 'REQUEST_CONFIRMATION' });
  state = processDialogReducer(state, { type: 'TERMINATION_STARTED' });
  state = processDialogReducer(state, {
    type: 'TERMINATION_FAILED',
    status: { ok: false, message: 'permission denied' },
  });
  assert.equal(state.phase, 'failed');

  state = processDialogReducer(state, { type: 'TERMINATION_STARTED' });
  assert.equal(state.phase, 'terminating');
  state = processDialogReducer(state, { type: 'TERMINATION_FAILED', status: { ok: false } });
  state = processDialogReducer(state, { type: 'CANCEL_CONFIRMATION' });
  assert.equal(state.phase, 'inspecting');
});

test('global masking clears local reveals and reveals are rejected while unmasked', () => {
  let state = createRedactionState();
  state = redactionReducer(state, { type: 'TOGGLE_REVEAL', key: 'pid:412' });
  assert.equal(state.revealedKeys.has('pid:412'), true);

  state = redactionReducer(state, { type: 'TOGGLE_GLOBAL' });
  assert.equal(state.mode, 'unmasked');
  state = redactionReducer(state, { type: 'TOGGLE_REVEAL', key: 'pid:510' });
  assert.equal(state.revealedKeys.has('pid:510'), false);

  state = redactionReducer(state, { type: 'TOGGLE_GLOBAL' });
  assert.equal(state.mode, 'masked');
  assert.equal(state.revealedKeys.size, 0);
});


test('headline glitch follows idle, scramble, hold and idle transitions', async () => {
  const { createGlitchState, glitchReducer } = await import('./stateMachines.js');
  let state = createGlitchState();
  state = glitchReducer(state, { type: 'START_STRIKE', idx: 4, originalChar: 'K' });
  assert.equal(state.phase, 'scrambling');
  assert.equal(state.idx, 4);

  state = glitchReducer(state, { type: 'SCRAMBLE_TICK', char: 'ア' });
  assert.equal(state.char, 'ア');

  state = glitchReducer(state, { type: 'SCRAMBLE_COMPLETE' });
  assert.equal(state.phase, 'holding');
  assert.equal(state.char, 'K');

  const held = state;
  state = glitchReducer(state, { type: 'SCRAMBLE_TICK', char: 'X' });
  assert.equal(state, held);

  state = glitchReducer(state, { type: 'HOLD_COMPLETE' });
  assert.deepEqual(state, createGlitchState());
});

test('headline glitch cancellation invalidates scheduled animation events', async () => {
  const { createGlitchState, glitchReducer } = await import('./stateMachines.js');
  let state = glitchReducer(createGlitchState(), {
    type: 'START_STRIKE',
    idx: 2,
    originalChar: 'I',
  });
  state = glitchReducer(state, { type: 'CANCEL' });
  const idle = state;

  state = glitchReducer(state, { type: 'SCRAMBLE_TICK', char: 'Z' });
  state = glitchReducer(state, { type: 'SCRAMBLE_COMPLETE' });
  assert.equal(state, idle);
});


test('browser location changes close an open responsive drawer', () => {
  let state = createNavigationState('#/overview');
  state = navigationReducer(state, { type: 'OPEN_DRAWER' });
  state = navigationReducer(state, { type: 'LOCATION_CHANGED', hash: '#/processes' });
  assert.deepEqual(state, { route: 'processes', drawer: 'closed' });
});

test('processes with missing or invalid PIDs are protected', async () => {
  const { isProtectedProcess } = await import('./stateMachines.js');
  assert.equal(isProtectedProcess({ name: 'missing-pid' }), true);
  assert.equal(isProtectedProcess({ pid: '1.5' }), true);
  assert.equal(isProtectedProcess({ pid: Number.MAX_SAFE_INTEGER + 1 }), true);
});


test('a stale headline hold completion cannot cancel a later scramble', async () => {
  const { createGlitchState, glitchReducer } = await import('./stateMachines.js');
  let state = glitchReducer(createGlitchState(), {
    type: 'START_STRIKE',
    idx: 0,
    originalChar: 'B',
  });
  state = glitchReducer(state, { type: 'CANCEL' });
  state = glitchReducer(state, {
    type: 'START_STRIKE',
    idx: 3,
    originalChar: 'K',
  });
  const active = state;
  state = glitchReducer(state, { type: 'HOLD_COMPLETE' });
  assert.equal(state, active);
  assert.equal(state.phase, 'scrambling');
});
