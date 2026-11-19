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


/**
 * A process CPU baseline belongs to a specific PID lifetime, not just its PID.
 * Linux can reuse a PID; startTimeTicks prevents deltas from crossing identities.
 */
export function createProcessSamplingState() {
  return {
    phase: 'uninitialized',
    startTimeTicks: null,
    utime: null,
    stime: null,
    sampledAt: null,
  };
}

export function advanceProcessSampling(state, sample, sampledAt = Date.now(), ticksPerSecond = 100) {
  const identityKnown = sample?.startTimeTicks !== null &&
    sample?.startTimeTicks !== undefined &&
    Number.isSafeInteger(Number(sample.startTimeTicks)) &&
    Number(sample.startTimeTicks) >= 0;
  const countersKnown = sample?.utime !== null && sample?.utime !== undefined &&
    sample?.stime !== null && sample?.stime !== undefined &&
    Number.isFinite(Number(sample.utime)) && Number.isFinite(Number(sample.stime));
  const startTimeTicks = identityKnown ? Number(sample.startTimeTicks) : null;
  const utime = countersKnown ? Number(sample.utime) : null;
  const stime = countersKnown ? Number(sample.stime) : null;
  const previousCountersKnown = Number.isFinite(state?.utime) && Number.isFinite(state?.stime);
  const sameProcess = state?.phase === 'ready' &&
    identityKnown && previousCountersKnown &&
    Number.isSafeInteger(state.startTimeTicks) &&
    state.startTimeTicks === startTimeTicks;
  const elapsedMs = sameProcess && Number.isFinite(state.sampledAt)
    ? sampledAt - state.sampledAt
    : null;
  const elapsedSeconds = Number.isFinite(elapsedMs) && elapsedMs > 0
    ? elapsedMs / 1000
    : null;
  const tickDelta = sameProcess
    ? (utime + stime) - (state.utime + state.stime)
    : null;
  const valid = countersKnown && sameProcess && elapsedSeconds != null &&
    Number.isFinite(tickDelta) && tickDelta >= 0 &&
    Number.isFinite(ticksPerSecond) && ticksPerSecond > 0;

  return {
    state: {
      phase: 'ready',
      startTimeTicks: identityKnown ? startTimeTicks : null,
      utime: Number.isFinite(utime) ? utime : null,
      stime: Number.isFinite(stime) ? stime : null,
      sampledAt,
    },
    cpuPercent: valid ? ((tickDelta / ticksPerSecond) / elapsedSeconds) * 100 : null,
    reset: state?.phase === 'ready' && !valid,
  };
}
