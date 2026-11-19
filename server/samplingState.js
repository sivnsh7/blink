/**
 * A sampling baseline has two explicit phases:
 * uninitialized (first observation cannot produce a rate) and ready
 * (the previous value and timestamp can be used to calculate a delta).
 *
 * A non-positive clock delta resets the baseline and deliberately suppresses
 * the rate for that sample instead of inventing an interval.
 */
export function createSamplingBaseline() {
  return { phase: 'uninitialized', value: null, sampledAt: null };
}

export function advanceSamplingBaseline(state, value, sampledAt = Date.now()) {
  const wasReady = state?.phase === 'ready' && Number.isFinite(state.sampledAt);
  const elapsedMs = wasReady ? sampledAt - state.sampledAt : null;
  const validInterval = Number.isFinite(elapsedMs) && elapsedMs > 0;

  return {
    state: { phase: 'ready', value, sampledAt },
    previous: validInterval ? state.value : null,
    elapsedSeconds: validInterval ? elapsedMs / 1000 : null,
    reset: wasReady && !validInterval,
  };
}
