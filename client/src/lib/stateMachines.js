export const ROUTES = Object.freeze([
  'overview',
  'audit',
  'processes',
  'cpu',
  'memory',
  'storage',
  'network',
  'graphics',
  'sensors',
  'battery',
]);

const routeSet = new Set(ROUTES);

export function routeFromHash(hash = '') {
  const key = String(hash).replace(/^#\/?/, '').split('?')[0];
  return routeSet.has(key) ? key : 'overview';
}

export function createNavigationState(hash = '') {
  return { route: routeFromHash(hash), drawer: 'closed' };
}

export function navigationReducer(state, event) {
  switch (event.type) {
    case 'NAVIGATE':
      if (!routeSet.has(event.route)) return state;
      return { ...state, route: event.route, drawer: 'closed' };
    case 'LOCATION_CHANGED':
      return { ...state, route: routeFromHash(event.hash), drawer: 'closed' };
    case 'OPEN_DRAWER':
      return state.drawer === 'open' ? state : { ...state, drawer: 'open' };
    case 'CLOSE_DRAWER':
    case 'ESCAPE':
      return state.drawer === 'closed' ? state : { ...state, drawer: 'closed' };
    default:
      return state;
  }
}

/**
 * Transport and sample freshness are separate dimensions:
 * a live socket can coexist with a failed one-off HTTP refresh, and polling
 * can provide fresh data while the socket is retrying.
 */
export function createTelemetryState() {
  return {
    connection: 'stopped',
    snapshot: 'empty',
    error: null,
    lastUpdatedAt: null,
  };
}

export function telemetryReducer(state, event) {
  switch (event.type) {
    case 'START':
    case 'RECONNECT':
      return { ...state, connection: 'connecting', error: null };
    case 'SOCKET_OPEN':
      return { ...state, connection: 'streaming', error: null };
    case 'SOCKET_CLOSED':
      if (state.connection === 'paused' || state.connection === 'stopped') return state;
      return { ...state, connection: 'retrying' };
    case 'RETRY':
      if (state.connection === 'paused' || state.connection === 'stopped') return state;
      return { ...state, connection: 'connecting' };
    case 'SOCKET_UNSUPPORTED':
      return {
        ...state,
        connection: 'unsupported',
        error: event.message || 'WebSocket is unavailable; using HTTP polling.',
      };
    case 'SOCKET_ERROR':
      return { ...state, error: event.message || 'The telemetry stream failed.' };
    case 'SNAPSHOT_RECEIVED': {
      if (state.connection === 'paused' || state.connection === 'stopped') return state;
      const connection =
        event.source === 'http' &&
        !['streaming', 'unsupported'].includes(state.connection)
          ? 'polling'
          : state.connection;
      return {
        ...state,
        connection,
        snapshot: 'fresh',
        lastUpdatedAt: event.timestamp ?? state.lastUpdatedAt,
        error: state.connection === 'unsupported' && event.source === 'http' ? state.error : null,
      };
    }
    case 'SNAPSHOT_FAILED':
      if (state.connection === 'paused' || state.connection === 'stopped') return state;
      if (state.connection === 'streaming') return state;
      return {
        ...state,
        snapshot: state.snapshot === 'fresh' ? 'stale' : 'unavailable',
        error: event.message || 'Could not reach the local agent.',
      };
    case 'STREAM_ERROR':
      return { ...state, error: event.message || 'Received an unreadable telemetry update.' };
    case 'PAUSE':
      return { ...state, connection: 'paused', error: null };
    case 'STOP':
      return { ...state, connection: 'stopped', error: null };
    default:
      return state;
  }
}

export function createAuditState() {
  return { phase: 'loading', audit: null, error: null };
}

export function auditReducer(state, event) {
  switch (event.type) {
    case 'REQUEST':
      return { ...state, phase: 'loading', error: null };
    case 'SUCCESS':
      return { phase: 'ready', audit: event.audit ?? null, error: null };
    case 'FAILURE':
      return { ...state, phase: 'error', error: event.message || 'Audit data is unavailable.' };
    default:
      return state;
  }
}

export function isProtectedProcess(proc) {
  return Boolean(
    !proc ||
    !Number.isSafeInteger(Number(proc.pid)) ||
    Number(proc.pid) <= 1 ||
    proc.isKernel ||
    proc.privilegeClass === 'kernel-task'
  );
}

export function createProcessDialogState() {
  return {
    phase: 'closed',
    process: null,
    signal: 'SIGTERM',
    status: null,
  };
}

/**
 * Process dossier lifecycle:
 * closed -> inspecting -> confirming -> terminating -> succeeded|failed.
 * A failed request can be retried or cancelled. Protected tasks never enter
 * the confirmation state.
 */
export function processDialogReducer(state, event) {
  switch (event.type) {
    case 'OPEN':
      if (!event.process) return state;
      return {
        phase: 'inspecting',
        process: event.process,
        signal: 'SIGTERM',
        status: null,
      };
    case 'CLOSE':
      return createProcessDialogState();
    case 'REQUEST_CONFIRMATION':
      if (state.phase !== 'inspecting' || isProtectedProcess(state.process)) return state;
      return { ...state, phase: 'confirming', status: null };
    case 'CANCEL_CONFIRMATION':
      if (!['confirming', 'failed'].includes(state.phase)) return state;
      return { ...state, phase: 'inspecting', status: null };
    case 'SET_SIGNAL':
      if (
        !['confirming', 'failed'].includes(state.phase) ||
        !['SIGTERM', 'SIGKILL'].includes(event.signal)
      ) {
        return state;
      }
      return { ...state, signal: event.signal };
    case 'TERMINATION_STARTED':
      if (!['confirming', 'failed'].includes(state.phase) || isProtectedProcess(state.process)) {
        return state;
      }
      return { ...state, phase: 'terminating', status: null };
    case 'TERMINATION_SUCCEEDED':
      if (state.phase !== 'terminating') return state;
      return { ...state, phase: 'succeeded', status: event.status };
    case 'TERMINATION_FAILED':
      if (state.phase !== 'terminating') return state;
      return { ...state, phase: 'failed', status: event.status };
    default:
      return state;
  }
}

export function createRedactionState() {
  return { mode: 'masked', revealedKeys: new Set() };
}

export function redactionReducer(state, event) {
  switch (event.type) {
    case 'TOGGLE_GLOBAL': {
      const mode = state.mode === 'masked' ? 'unmasked' : 'masked';
      return {
        mode,
        // Re-masking is a privacy boundary: discard all local exceptions.
        revealedKeys: mode === 'masked' ? new Set() : state.revealedKeys,
      };
    }
    case 'TOGGLE_REVEAL': {
      if (state.mode !== 'masked' || !event.key) return state;
      const revealedKeys = new Set(state.revealedKeys);
      if (revealedKeys.has(event.key)) revealedKeys.delete(event.key);
      else revealedKeys.add(event.key);
      return { ...state, revealedKeys };
    }
    default:
      return state;
  }
}


/**
 * Ambient headline animation:
 * idle -> scrambling -> holding -> idle.
 * CANCEL makes text changes/unmounts invalidate all scheduled transitions.
 */
export function createGlitchState() {
  return { phase: 'idle', idx: -1, char: '', originalChar: '' };
}

export function glitchReducer(state, event) {
  switch (event.type) {
    case 'START_STRIKE':
      if (state.phase !== 'idle' || !Number.isInteger(event.idx) || event.idx < 0) return state;
      if (typeof event.originalChar !== 'string' || !event.originalChar) return state;
      return {
        phase: 'scrambling',
        idx: event.idx,
        char: event.originalChar,
        originalChar: event.originalChar,
      };
    case 'SCRAMBLE_TICK':
      return state.phase === 'scrambling' && typeof event.char === 'string'
        ? { ...state, char: event.char }
        : state;
    case 'SCRAMBLE_COMPLETE':
      return state.phase === 'scrambling'
        ? { ...state, phase: 'holding', char: state.originalChar }
        : state;
    case 'HOLD_COMPLETE':
      return state.phase === 'holding' ? createGlitchState() : state;
    case 'CANCEL':
      return createGlitchState();
    default:
      return state;
  }
}
