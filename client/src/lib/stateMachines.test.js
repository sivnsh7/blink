import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditReducer,
  createAuditState,
  createNavigationState,
  createProcessDialogState,
  createTelemetryState,
  navigationReducer,
  processDialogReducer,
  routeFromHash,
  telemetryReducer,
  telemetryStatusView,
} from './stateMachines.js';

test('navigation resolves only known routes and closes the drawer on navigation', () => {
  assert.equal(routeFromHash('#/processes'), 'processes');
  assert.equal(routeFromHash('#cpu'), 'performance');
  assert.equal(routeFromHash('#/battery'), 'hardware');
  assert.equal(routeFromHash('#/audit'), 'diagnostics');
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
  let state = createNavigationState('#/diagnostics');
  state = navigationReducer(state, { type: 'OPEN_DRAWER' });
  state = navigationReducer(state, { type: 'ESCAPE' });
  assert.equal(state.drawer, 'closed');
  state = navigationReducer(state, { type: 'LOCATION_CHANGED', hash: '#/battery' });
  assert.equal(state.route, 'hardware');
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

  state = telemetryReducer(state, { type: 'SNAPSHOT_EXPIRED' });
  assert.equal(state.snapshot, 'stale');
  state = telemetryReducer(state, { type: 'SNAPSHOT_RECEIVED', source: 'stream', timestamp: 110 });
  assert.equal(state.snapshot, 'fresh');

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


test('legacy page routes consolidate without breaking saved bookmarks', () => {
  assert.equal(routeFromHash('#/cpu?view=cores'), 'performance');
  assert.equal(routeFromHash('#/memory'), 'performance');
  assert.equal(routeFromHash('#/graphics'), 'hardware');
  assert.equal(routeFromHash('#/sensors'), 'hardware');
  assert.equal(routeFromHash('#/audit'), 'diagnostics');
});

test('snapshot expiry cannot downgrade a paused telemetry session', () => {
  let state = telemetryReducer(createTelemetryState(), { type: 'START' });
  state = telemetryReducer(state, { type: 'SNAPSHOT_RECEIVED', source: 'http', timestamp: 1 });
  state = telemetryReducer(state, { type: 'PAUSE' });
  const paused = state;
  assert.equal(telemetryReducer(state, { type: 'SNAPSHOT_EXPIRED' }), paused);
});


test('telemetry presentation distinguishes stale streams, paused sessions and HTTP fallback', () => {
  assert.deepEqual(telemetryStatusView('streaming', 'fresh'), {
    label: 'Live stream',
    tone: 'live',
  });
  assert.deepEqual(telemetryStatusView('streaming', 'stale'), {
    label: 'Stream connected · data stale',
    tone: 'warning',
  });
  assert.deepEqual(telemetryStatusView('paused', 'fresh'), {
    label: 'Telemetry paused',
    tone: 'idle',
  });
  assert.deepEqual(telemetryStatusView('polling', 'fresh'), {
    label: 'HTTP polling',
    tone: 'live',
  });
  assert.deepEqual(telemetryStatusView('unsupported', 'fresh'), {
    label: 'HTTP polling · WebSocket unavailable',
    tone: 'live',
  });
  assert.deepEqual(telemetryStatusView('retrying', 'stale'), {
    label: 'Reconnecting · data stale',
    tone: 'warning',
  });
});
