import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSamplingBaseline,
  createSamplingBaseline,
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
