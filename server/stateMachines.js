export function createServerLifecycleState() {
  return { phase: 'starting', exitCode: null };
}

export function serverLifecycleReducer(state, event) {
  switch (event.type) {
    case 'LISTENING':
      return state.phase === 'starting'
        ? { phase: 'running', exitCode: null }
        : state;
    case 'STOP':
      return ['starting', 'running'].includes(state.phase)
        ? { phase: 'stopping', exitCode: event.code ?? 0 }
        : state;
    case 'CLOSED':
      return state.phase === 'stopping'
        ? { phase: 'stopped', exitCode: state.exitCode ?? 0 }
        : state;
    case 'FAIL':
      return ['starting', 'running'].includes(state.phase)
        ? { phase: 'failed', exitCode: event.code ?? 1 }
        : state;
    default:
      return state;
  }
}

export function socketLivenessReducer(state, event) {
  if (state === 'closed') return 'closed';

  switch (event.type) {
    case 'PING_SENT':
      // A second heartbeat without a pong means the peer is half-open.
      return state === 'awaiting-pong' ? 'closed' : 'awaiting-pong';
    case 'PONG':
      return 'alive';
    case 'CLOSE':
    case 'ERROR':
      return 'closed';
    default:
      return state;
  }
}
