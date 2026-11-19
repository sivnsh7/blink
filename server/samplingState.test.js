import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSamplingBaseline,
  createSamplingBaseline,
  advanceProcessSampling,
  createProcessSamplingState,
} from './samplingState.js';

test('first observation initializes a baseline without reporting a delta', () => {
  const step = advanceSamplingBaseline(createSamplingBaseline(), { cpu: 10 }, 1000);
  assert.equal(step.state.phase, 'ready');
  assert.equal(step.previous, null);
  assert.equal(step.elapsedSeconds, null);
  assert.equal(step.reset, false);
});

test('subsequent observations expose the previous sample and measured interval', () => {
  const first = advanceSamplingBaseline(createSamplingBaseline(), 100, 1000);
  const second = advanceSamplingBaseline(first.state, 160, 2500);
  assert.equal(second.previous, 100);
  assert.equal(second.elapsedSeconds, 1.5);
  assert.equal(second.reset, false);
});

test('clock rollback or zero interval resets baseline and suppresses a rate', () => {
  const first = advanceSamplingBaseline(createSamplingBaseline(), 100, 1000);
  const rollback = advanceSamplingBaseline(first.state, 80, 900);
  assert.equal(rollback.previous, null);
  assert.equal(rollback.elapsedSeconds, null);
  assert.equal(rollback.reset, true);
  assert.equal(rollback.state.value, 80);
});


test('process CPU baseline has no fabricated first-sample percentage', () => {
  const first = advanceProcessSampling(
    createProcessSamplingState(),
    { startTimeTicks: 100, utime: 20, stime: 10 },
    1000,
    100
  );
  assert.equal(first.state.phase, 'ready');
  assert.equal(first.cpuPercent, null);
  assert.equal(first.reset, false);
});

test('process CPU baseline calculates only within the same process lifetime', () => {
  const first = advanceProcessSampling(
    createProcessSamplingState(),
    { startTimeTicks: 100, utime: 20, stime: 10 },
    1000,
    100
  );
  const second = advanceProcessSampling(
    first.state,
    { startTimeTicks: 100, utime: 30, stime: 10 },
    2000,
    100
  );
  assert.equal(second.cpuPercent, 10);
  assert.equal(second.reset, false);

  const reusedPid = advanceProcessSampling(
    second.state,
    { startTimeTicks: 200, utime: 40, stime: 10 },
    3000,
    100
  );
  assert.equal(reusedPid.cpuPercent, null);
  assert.equal(reusedPid.reset, true);
  assert.equal(reusedPid.state.startTimeTicks, 200);
});

test('process counter rollback and invalid intervals suppress the rate', () => {
  const first = advanceProcessSampling(
    createProcessSamplingState(),
    { startTimeTicks: 100, utime: 20, stime: 10 },
    1000,
    100
  );
  const rollback = advanceProcessSampling(
    first.state,
    { startTimeTicks: 100, utime: 10, stime: 10 },
    2000,
    100
  );
  assert.equal(rollback.cpuPercent, null);
  assert.equal(rollback.reset, true);

  const zeroInterval = advanceProcessSampling(
    rollback.state,
    { startTimeTicks: 100, utime: 15, stime: 10 },
    2000,
    100
  );
  assert.equal(zeroInterval.cpuPercent, null);
  assert.equal(zeroInterval.reset, true);
});


test('missing process counters never become a measured zero-percent sample', () => {
  const first = advanceProcessSampling(
    createProcessSamplingState(),
    { startTimeTicks: 100, utime: null, stime: null },
    1000,
    100
  );
  assert.equal(first.cpuPercent, null);
  const second = advanceProcessSampling(
    first.state,
    { startTimeTicks: 100, utime: 20, stime: 10 },
    2000,
    100
  );
  assert.equal(second.cpuPercent, null);
  const third = advanceProcessSampling(
    second.state,
    { startTimeTicks: 100, utime: 30, stime: 10 },
    3000,
    100
  );
  assert.equal(third.cpuPercent, 10);
});
