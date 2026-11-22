import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionTimeline } from '../chapter-one/presentation/action-layer.mjs';
const preview = { actionId: 'cast-identity-1', skillId: 'bolt', startAtMs: 1000, releaseAtMs: 1120, endAtMs: 1500, nowMs: 1000, preview: true };

test('preview promotion preserves monotonic pose phase while authoritative release fires once', () => {
  const clock = createActionTimeline(); clock.play(preview); clock.advance(.15);
  const phase = clock.pose.sampleProgress;
  const confirmed = { ...preview, preview: false, confirmPreview: true, startAtMs: 1100, releaseAtMs: 1220, endAtMs: 1600, nowMs: 1150 };
  assert.equal(clock.play(confirmed).reconciled, true); assert.equal(clock.pose.sampleProgress, phase);
  clock.advance(.03); assert(clock.pose.sampleProgress >= phase); assert.equal(clock.consumeEvents().length, 0);
  clock.advance(.06); assert.equal(clock.consumeEvents().filter(event => event.type === 'release').length, 1);
  assert.equal(clock.play(confirmed).reason, 'DUPLICATE_ACTION'); clock.advance(.05); assert.equal(clock.consumeEvents().length, 0);
});

test('late confirmation emits one authoritative release without repeating the windup', () => {
  const clock = createActionTimeline(); clock.play(preview); clock.advance(.10);
  assert.equal(clock.play({ ...preview, preview: false, confirmPreview: true, nowMs: 1300 }).reconciled, true);
  assert(clock.pose.sampleProgress > 1); assert.equal(clock.consumeEvents().filter(event => event.type === 'release').length, 1);
  clock.advance(.05); assert.equal(clock.consumeEvents().length, 0);
});

test('cancelled or expired previews cannot be resurrected by delayed confirmations', () => {
  for (const cancel of [true, false]) {
    const clock = createActionTimeline(); clock.play(preview);
    if (cancel) clock.cancel(preview.actionId); else clock.advance(1);
    assert.equal(clock.play({ ...preview, preview: false, confirmPreview: true, nowMs: 1200 }).reason, 'DUPLICATE_ACTION');
    assert.equal(clock.current, null); assert.equal(clock.consumeEvents().length, 0);
  }
});

test('channel confirmation extends holding without reversing an already sampled pose', () => {
  const clock = createActionTimeline(); clock.play({ ...preview, skillId: 'levitate', releaseAtMs: 1800, holdUntilMs: 3800, endAtMs: 4180 }); clock.advance(.9);
  const before = clock.pose.sampleProgress;
  clock.play({ ...preview, skillId: 'levitate', preview: false, confirmPreview: true, startAtMs: 1200, releaseAtMs: 2000, holdUntilMs: 4000, endAtMs: 4380, nowMs: 1900 });
  assert.equal(clock.pose.sampleProgress, before); clock.advance(1); assert.equal(clock.debug().phase, 'channel');
  clock.cancel(preview.actionId, 'movement'); clock.advance(.13); assert.equal(clock.pose, null);
});
