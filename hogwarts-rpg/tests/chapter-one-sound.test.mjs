import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Run the real synthesiser and scheduler. Only Web Audio, DOM events and the
// clocks are fake; scheduled notes, envelopes, routing and cleanup remain real.
const source = (await readFile(new URL('../chapter-one/client/sound.mjs', import.meta.url), 'utf8'))
  .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '');
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const plain = value => JSON.parse(JSON.stringify(value));
function harness({ unsupported = false, resumeFailure = false, deferredResume = false, deferredSuspend = false, muted = false, mix } = {}) {
  let wallNow = 0, timerId = 0, nodeId = 0, timeoutCalls = 0, maxIntervals = 0;
  const timers = new Map(), contexts = [], nodes = [], statuses = [], pendingResumes = [], pendingSuspends = [];
  class Events {
    listeners = new Map();
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatch(type) { for (const fn of [...this.listeners.get(type) ?? []]) fn({ type, target: this }); }
    get listenerCount() { return [...this.listeners.values()].reduce((sum, values) => sum + values.size, 0); }
  }
  class Param {
    events = [];
    constructor(context, value = 0) { this.context = context; this.initial = value; }
    valueAt(time) { return this.events.filter(event => event.time <= time && event.value !== undefined).at(-1)?.value ?? this.initial; }
    get value() { return this.valueAt(this.context.currentTime); }
    set value(value) { this.record('value', value, this.context.currentTime); this.initial = value; }
    record(type, value, time, extra = {}) { assert(Number.isFinite(value), `${type} received non-finite AudioParam value`); assert(Number.isFinite(time), `${type} received non-finite audio time`); this.events.push({ type, value, time, ...extra }); return this; }
    setValueAtTime(value, time) { return this.record('set', value, time); }
    linearRampToValueAtTime(value, time) { return this.record('linear', value, time); }
    exponentialRampToValueAtTime(value, time) { assert(value > 0, 'exponential envelope requires a positive target'); return this.record('exponential', value, time); }
    setTargetAtTime(value, time, constant) { assert(constant > 0); return this.record('target', value, time, { constant }); }
    cancelScheduledValues(time) { this.events.push({ type: 'cancel', time }); return this; }
    cancelAndHoldAtTime(time) { this.events.push({ type: 'hold', time }); return this; }
  }
  class Node extends Events {
    connections = new Set(); disconnected = false; disconnectCalls = 0;
    constructor(context, kind) { super(); this.context = context; this.kind = kind; this.id = ++nodeId; this.createdAt = context.currentTime; nodes.push(this); }
    connect(target) { assert(target, 'audio nodes require a real destination boundary'); this.connections.add(target); this.disconnected = false; return target; }
    disconnect() { this.connections.clear(); this.disconnected = true; this.disconnectCalls++; }
  }
  class Source extends Node {
    stopCalls = []; ended = false;
    constructor(context, kind) { super(context, kind); this.frequency = new Param(context, 440); this.detune = new Param(context); this.playbackRate = new Param(context, 1); this.loop = false; }
    start(at = this.context.currentTime) { assert(this.startAt === undefined, 'a source can only start once'); assert(Number.isFinite(at) && at >= 0); this.startAt = at; this.scheduledAt = this.context.currentTime; this.audibleAtStart = audibleRoute(this, at + .01); }
    stop(at = this.context.currentTime) { assert(Number.isFinite(at) && at >= 0); this.stopAt = at; this.stopCalls.push(at); }
    setPeriodicWave(value) { this.wave = value; }
    finishWhenDue() {
      if (this.ended || this.startAt === undefined) return;
      const end = this.stopAt ?? (!this.loop && this.buffer ? this.startAt + this.buffer.duration : Infinity);
      if (end <= this.context.currentTime + 1e-9) { this.ended = true; this.onended?.(); this.dispatch('ended'); }
    }
  }
  function audibleRoute(node, time, visited = new Set()) {
    if (visited.has(node)) return false; visited.add(node);
    if (node.kind === 'destination') return true;
    if (node.gain instanceof Param && node.gain.valueAt(time) <= 1e-8) return false;
    return [...node.connections].some(next => audibleRoute(next, time, new Set(visited)));
  }
  class Context extends Events {
    state = 'suspended'; audioNow = 0; sampleRate = 24000; resumeCalls = 0; suspendCalls = 0; closeCalls = 0;
    constructor() { super(); contexts.push(this); this.destination = new Node(this, 'destination'); }
    get currentTime() { return this.audioNow; }
    createGain() { const node = new Node(this, 'gain'); node.gain = new Param(this, 1); return node; }
    createOscillator() { return new Source(this, 'oscillator'); }
    createBufferSource() { return new Source(this, 'buffer'); }
    createBiquadFilter() { const node = new Node(this, 'filter'); for (const [key, value] of Object.entries({ frequency: 350, Q: 1, gain: 0, detune: 0 })) node[key] = new Param(this, value); return node; }
    createStereoPanner() { const node = new Node(this, 'panner'); node.pan = new Param(this); return node; }
    createDynamicsCompressor() { const node = new Node(this, 'compressor'); for (const [key, value] of Object.entries({ threshold: -24, knee: 30, ratio: 12, attack: .003, release: .25 })) node[key] = new Param(this, value); return node; }
    createDelay() { const node = new Node(this, 'delay'); node.delayTime = new Param(this); return node; }
    createPeriodicWave(real, imaginary) { return { real, imaginary }; }
    createBuffer(channels, length, rate) { assert(Number.isSafeInteger(length) && length > 0); const data = Array.from({ length: channels }, () => new Float32Array(length)); return { duration: length / rate, length, sampleRate: rate, numberOfChannels: channels, getChannelData: channel => data[channel] }; }
    change(state) { this.state = state; this.onstatechange?.(); this.dispatch('statechange'); }
    async resume() {
      this.resumeCalls++;
      if (resumeFailure) throw new Error('Audio device resume rejected');
      if (deferredResume) await new Promise(resolve => pendingResumes.push(resolve));
      if (this.state === 'closed') throw new Error('Audio context already closed');
      this.change('running');
    }
    async suspend() { this.suspendCalls++; if (deferredSuspend) await new Promise(resolve => pendingSuspends.push(resolve)); if (this.state !== 'closed') this.change('suspended'); }
    async close() { this.closeCalls++; this.change('closed'); }
  }
  const document = new Events(), window = new Events(); document.hidden = false;
  Object.defineProperty(document, 'visibilityState', { get: () => document.hidden ? 'hidden' : 'visible' });
  if (!unsupported) window.AudioContext = Context;
  const schedule = (fn, delay, interval) => {
    assert(typeof fn === 'function'); const id = ++timerId, milliseconds = Math.max(1, Number(delay) || 1);
    timers.set(id, { fn, at: wallNow + milliseconds, interval: interval ? milliseconds : 0 });
    if (!interval) timeoutCalls++;
    maxIntervals = Math.max(maxIntervals, [...timers.values()].filter(timer => timer.interval).length); return id;
  };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [1700000000000 + wallNow])); } static now() { return 1700000000000 + wallNow; } }
  const context = vm.createContext({ window, document, Date: ClockDate, performance: { now: () => wallNow }, console, Math, Float32Array, setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id), setTimeout: (fn, delay) => schedule(fn, delay, false), clearTimeout: id => timers.delete(id) });
  vm.runInContext(source + '\nglobalThis.__createSound=createSound;', context);
  const sound = context.__createSound({ muted, mix, onStatusChange: value => statuses.push(plain(value)) });
  function shiftTime(to) { const seconds = (to - wallNow) / 1000; for (const audio of contexts) if (audio.state === 'running') audio.audioNow += seconds; wallNow = to; for (const node of [...nodes]) if (node instanceof Source) node.finishWhenDue(); }
  async function advance(milliseconds) {
    const target = wallNow + milliseconds; let ticks = 0;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      assert(ticks++ < 5000, 'scheduler cannot spin indefinitely');
      const [id, timer] = due; shiftTime(timer.at);
      if (timer.interval) timer.at += timer.interval; else timers.delete(id);
      timer.fn(); await flush();
    }
    shiftTime(target); await flush();
  }
  return { sound, contexts, nodes, document, window, statuses, timers, advance,
    state: () => sound.getStatus().state,
    sources: () => nodes.filter(node => node instanceof Source && node.startAt !== undefined),
    audibleSources: () => nodes.filter(node => node instanceof Source && node.startAt !== undefined && node.audibleAtStart),
    parameters: () => nodes.flatMap(node => Object.values(node).filter(value => value instanceof Param)),
    async visible(value) { document.hidden = !value; document.dispatch('visibilitychange'); await flush(); },
    async resolveResumes() { for (const resolve of pendingResumes.splice(0)) resolve(); await flush(); },
    async resolveSuspends() { for (const resolve of pendingSuspends.splice(0)) resolve(); await flush(); },
    get timeoutCalls() { return timeoutCalls; }, get maxIntervals() { return maxIntervals; },
  };
}
const scene = (sceneId = 'SC01', combat = null, selection = false) => ({ sceneId, combat, selection });

test('sound remains locked without a gesture and concurrent unlock creates one audio context', async t => {
  const h = harness(); t.after(() => h.sound.dispose());
  assert.equal(h.state(), 'locked'); assert.deepEqual(plain(h.sound.status), plain(h.sound.getStatus()));
  assert.deepEqual(plain(h.sound.mix), { master: .65, music: .45, ambience: .5, effects: .75 });
  h.sound.setScene(scene()); h.sound.updateMotion({ x: 0, y: 0, z: 0, grounded: true }); h.sound.cue('reward');
  h.sound.setMix({ effects: .4 }); h.sound.setMuted(false); await h.visible(false); await h.visible(true); await h.advance(500);
  assert.equal(h.contexts.length, 0, 'settings and visibility must not create a context before unlock');
  await Promise.all([h.sound.unlock(), h.sound.unlock(), h.sound.unlock()]);
  assert.equal(h.contexts.length, 1); assert.equal(h.state(), 'running'); assert(h.statuses.some(status => status.state === 'running'));
  const initiallyMuted = harness({ muted: true }); t.after(() => initiallyMuted.sound.dispose());
  initiallyMuted.sound.setMuted(false);
  const firstGesture = await initiallyMuted.sound.unlock();
  assert.equal(initiallyMuted.contexts.length, 1, 'the first unmute-and-unlock gesture creates its context');
  assert.equal(initiallyMuted.state(), 'running'); assert.equal(initiallyMuted.contexts[0].state, 'running');
  assert.equal(firstGesture.state, 'running', 'unlock resolves only after the same-tick unmute has reached running');
});

test('mix updates merge channels and mute restores the chosen master gain', async t => {
  const h = harness(); t.after(() => h.sound.dispose()); await h.sound.unlock();
  h.sound.setMix({ master: .31, music: .2 });
  assert.deepEqual(plain(h.sound.mix), { master: .31, music: .2, ambience: .5, effects: .75 });
  const changed = h.parameters().find(param => param.events.some(event => Math.abs((event.value ?? -1) - .31) < 1e-9));
  assert(changed, 'mix must reach the actual audio graph');
  h.sound.setMuted(true); await flush(); assert.equal(h.sound.muted, true); assert.equal(h.state(), 'muted');
  assert(changed.events.some(event => event.value === 0), 'mute silences the master bus');
  h.sound.setMuted(false); await flush(); assert.equal(h.sound.muted, false);
  assert.equal(changed.events.filter(event => event.value !== undefined).at(-1).value, .31, 'unmute restores the user-selected volume');
  h.sound.setMix({ master: NaN, effects: Infinity });
  assert(Number.isFinite(h.sound.mix.master) && Number.isFinite(h.sound.mix.effects), 'invalid settings cannot poison live AudioParams');
});

test('real music schedules overlapping future voices and envelopes with one bounded scheduler', async t => {
  const h = harness(); t.after(() => h.sound.dispose()); h.sound.setScene(scene('SC00', null, true)); await h.sound.unlock();
  for (let i = 0; i < 10; i++) h.sound.setScene(scene('SC00', null, true));
  await h.advance(30000);
  const voices = h.sources(); assert(voices.length > 1, 'a sustained scene must schedule more than one voice');
  assert(voices.some(voice => voice.startAt > voice.scheduledAt + .001), 'notes must be scheduled ahead in audio time');
  assert(voices.some((voice, index) => voices.slice(index + 1).some(other => other.startAt < (voice.stopAt ?? Infinity) && other.startAt >= voice.startAt)), 'the arrangement supports overlapping voices');
  assert(h.parameters().some(param => param.events.some(event => ['linear', 'exponential', 'target'].includes(event.type) && event.time > 0)), 'notes have real gain or frequency envelopes');
  assert(voices.some(voice => voice.ended && voice.disconnected), 'finished voices release their graph connections');
  assert(voices.filter(voice => !voice.ended).length < 256, 'the scheduler does not retain every old note');
  assert.equal(h.maxIntervals, 1); assert.equal(h.timeoutCalls, 0, 'musical timing uses AudioContext time rather than JS timeout notes');
});

test('changing scene or battle replaces the musical state without multiplying schedulers', async t => {
  const h = harness(); t.after(() => h.sound.dispose()); h.sound.setScene(scene()); await h.sound.unlock(); await h.advance(500);
  const initial = h.sound.getStatus().scene;
  h.sound.setScene(scene('SC13', { id: 'battle', status: 'active' })); await h.advance(1500);
  assert.equal(h.sound.getStatus().scene, 'combat');
  h.sound.setScene(scene('SC03')); await h.advance(1500);
  assert.notEqual(h.sound.getStatus().scene, initial); assert.equal(h.sound.getStatus().scene, 'lake');
  assert(h.parameters().some(param => param.events.some(event => event.type === 'linear' || event.type === 'target')), 'scene transitions use gain automation');
  assert.equal(h.maxIntervals, 1); assert([...h.timers.values()].filter(timer => timer.interval).length <= 1);
});

test('confirmed event and explicit cue IDs deduplicate while old history and unrelated hurt stay silent', async t => {
  const h = harness({ mix: { music: 0, ambience: 0 } }); t.after(() => h.sound.dispose()); await h.sound.unlock();
  h.sound.cue('cast', 'bolt', { actionId: 'spell-one' }); const once = h.sources().length; assert(once > 0);
  h.sound.cue('cast', 'bolt', { actionId: 'spell-one' }); assert.equal(h.sources().length, once);
  h.sound.cue('impact', 'bolt', { actionId: 'spell-one' }); assert(h.sources().length > once, 'another cue kind for the same action is distinct');
  const baseline = h.sources().length, battle = { id: 'events', events: [
    { seq: 1, at: 497999, type: 'action_released', skillId: 'bolt', actionId: 'old' },
    { seq: 2, at: 500000, type: 'player_damaged', playerId: 'other' },
  ] };
  h.sound.consume(battle, 'self', 500000); assert.equal(h.sources().length, baseline, 'the explicit server clock governs the two-second history cutoff');
  battle.events.push({ seq: 3, at: 500000, type: 'player_damaged', playerId: 'self', actionId: 'hit-self' });
  h.sound.consume(battle, 'self', 500000); const confirmed = h.sources().length; assert(confirmed > baseline);
  h.sound.consume(battle, 'self', 500000); assert.equal(h.sources().length, confirmed);
  const locked = harness(); t.after(() => locked.sound.dispose()); locked.sound.consume(battle, 'self', 500000); await locked.sound.unlock();
  const unlockedBaseline = locked.sources().length; locked.sound.consume(battle, 'self', 500000); assert.equal(locked.sources().length, unlockedBaseline, 'unlock never replays history already consumed while locked');
});

test('motion produces ground footsteps and excludes stillness, airborne flight and riding', async t => {
  const h = harness({ mix: { music: 0, ambience: 0 } }); t.after(() => h.sound.dispose()); await h.sound.unlock();
  let x = 0; h.sound.updateMotion({ x, y: 0, z: 0, grounded: true }); const before = h.audibleSources().length;
  for (let i = 0; i < 20; i++) { await h.advance(100); x += .18; h.sound.updateMotion({ x, y: 0, z: 0, grounded: true, flying: false, riding: false }); }
  assert(h.audibleSources().length > before, 'normal walking produces distance-paced footsteps');
  const walking = h.audibleSources().length;
  for (let i = 0; i < 10; i++) { await h.advance(100); h.sound.updateMotion({ x, y: 0, z: 0, grounded: true }); }
  assert.equal(h.audibleSources().length, walking, 'standing still produces no step sounds');
  for (const flags of [{ grounded: false, flying: false, riding: false }, { grounded: false, flying: true, riding: false }, { grounded: true, flying: false, riding: true }]) {
    // An entry/landing cue is allowed; sustained movement in that state must
    // not emit ground steps. This does not prescribe a particular sound design.
    h.sound.updateMotion({ x, y: flags.grounded ? 0 : 1, z: 0, ...flags });
    const quiet = h.audibleSources().length;
    for (let i = 0; i < 10; i++) { await h.advance(100); x += .2; h.sound.updateMotion({ x, y: flags.grounded ? 0 : 1, z: 0, ...flags }); }
    assert.equal(h.audibleSources().length, quiet, `no ground footsteps during ${JSON.stringify(flags)}`);
  }
});

test('visibility suspends audio time and resumes only an unlocked unmuted session', async t => {
  const h = harness(); t.after(() => h.sound.dispose()); await h.sound.unlock(); await h.advance(300); const audio = h.contexts[0];
  for (let iteration = 0; iteration < 3; iteration++) {
    await h.visible(false); assert.equal(audio.state, 'suspended'); assert.equal(h.state(), 'hidden'); const paused = audio.currentTime;
    await h.advance(1000); assert.equal(audio.currentTime, paused);
    await h.visible(true); assert.equal(audio.state, 'running'); await h.advance(100);
  }
  await h.visible(false); h.sound.setMuted(true); await flush(); await h.visible(true); assert.equal(h.state(), 'muted');
  assert.notEqual(audio.state, 'running', 'visibility cannot resume a muted hidden session');
  h.sound.setMuted(false); await flush(); assert.equal(h.state(), 'running'); assert.equal(h.contexts.length, 1); assert.equal(h.maxIntervals, 1);
  const delayed = harness({ deferredSuspend: true }); t.after(() => delayed.sound.dispose()); await delayed.sound.unlock();
  delayed.sound.setMuted(true); delayed.sound.setMuted(false); await flush();
  await delayed.resolveSuspends(); await flush();
  assert.equal(delayed.state(), 'running', 'a late suspend completion cannot silence a subsequently unmuted session');
  const settled = harness(); t.after(() => settled.sound.dispose()); await settled.sound.unlock();
  const redundantUnlock = settled.sound.unlock(); await settled.visible(false); await redundantUnlock;
  assert.equal(settled.contexts[0].state, 'suspended', 'a hide arriving before a settled playback task clears still reaches the audio context');
});

test('dispose clears pending musical voices, timers and listeners without resurrection', async () => {
  const h = harness(); h.sound.setScene(scene()); await h.sound.unlock(); h.sound.cue('reward', null, { actionId: 'reward' });
  await h.advance(100); const audio = h.contexts[0]; assert(h.sources().length > 0);
  await h.sound.dispose(); await flush();
  assert.equal(h.state(), 'disposed'); assert.equal(audio.closeCalls, 1); assert.equal(h.timers.size, 0); assert.equal(h.document.listenerCount + h.window.listenerCount, 0);
  assert(h.sources().every(voice => voice.ended || voice.stopCalls.length > 0), 'active and future voices are stopped');
  const sources = h.sources().length; await h.advance(10000); await h.sound.dispose(); await h.sound.unlock(); h.sound.cue('reward'); await h.visible(false); await h.visible(true);
  assert.equal(h.contexts.length, 1); assert.equal(audio.closeCalls, 1); assert.equal(h.sources().length, sources); assert.equal(h.timers.size, 0); assert.equal(h.state(), 'disposed');
});

test('unavailable devices and delayed resume cannot leave uncaught errors or revive hidden/disposed sound', async t => {
  const absent = harness({ unsupported: true }); t.after(() => absent.sound.dispose()); await absent.sound.unlock(); assert.equal(absent.state(), 'unavailable'); assert.equal(absent.contexts.length, 0);
  const failed = harness({ resumeFailure: true }); t.after(() => failed.sound.dispose()); await failed.sound.unlock(); assert.notEqual(failed.state(), 'running');
  const hidden = harness({ deferredResume: true }); t.after(() => hidden.sound.dispose()); const unlocking = hidden.sound.unlock(); await flush();
  await hidden.visible(false); await hidden.resolveResumes(); await unlocking; await flush(); assert.equal(hidden.state(), 'hidden'); assert.notEqual(hidden.contexts[0].state, 'running');
  const disposed = harness({ deferredResume: true }); const late = disposed.sound.unlock(); await flush(); await disposed.sound.dispose(); await disposed.resolveResumes(); await late; await flush();
  assert.equal(disposed.state(), 'disposed'); assert.equal(disposed.contexts[0].state, 'closed'); assert.equal(disposed.timers.size, 0);
  const changing = harness({ deferredResume: true, deferredSuspend: true }); t.after(() => changing.sound.dispose());
  const initiallyUnlocking = changing.sound.unlock(); await flush(); await changing.visible(false);
  await changing.resolveResumes(); // Resume resolves while hidden; pause is now in flight.
  await changing.visible(true); await changing.resolveSuspends(); await changing.resolveResumes(); await initiallyUnlocking;
  assert.equal(changing.state(), 'running', 'resume → hidden → pending suspend → visible converges on the latest intent');
  assert.equal(changing.contexts[0].state, 'running'); assert.equal(changing.maxIntervals, 1);
});

test('the final local spell is not replayed by a confirmed victory event after scene music changes', async t => {
  const h = harness({ mix: { music: 0, ambience: 0 } }); t.after(() => h.sound.dispose());
  h.sound.setScene(scene('SC13', { id: 'battle-final', status: 'active' })); await h.sound.unlock();
  h.sound.cue('cast', 'bolt', { actionId: 'action-final' }); const predicted = h.audibleSources().length; assert(predicted > 0);
  h.sound.setScene(scene('SC13', false));
  const won = { id: 'battle-final', status: 'won', events: [{ seq: 1, at: 800000, type: 'action_released', skillId: 'bolt', actionId: 'action-final', playerId: 'self' }] };
  h.sound.consume(won, 'self', 800000);
  assert.equal(h.audibleSources().length, predicted, 'a music transition must not clear the final spell deduplication receipt');
  won.events.push({ seq: 2, at: 800000, type: 'action_released', skillId: 'bolt', actionId: 'remote-distinct-spell', playerId: 'friend' });
  h.sound.consume(won, 'self', 800000);
  assert(h.audibleSources().length > predicted, 'a different confirmed remote action remains audible');
});

test('fifty immediate scene changes retain at most three old layers and one current layer', async t => {
  const h = harness(); t.after(() => h.sound.dispose()); await h.sound.unlock();
  const patterns = [scene('SC01'), scene('SC03'), scene('SC12'), scene('SC13', { id: 'rush', status: 'active' })], groups = [];
  for (let index = 0; index < 50; index++) {
    const before = h.nodes.length; h.sound.setScene(patterns[index % patterns.length]); groups.push(h.nodes.slice(before));
  }
  const connected = group => group.some(node => node.kind !== 'destination' && !node.disconnected);
  assert(groups.filter(connected).length <= 4, 'same-time transitions must bound live graphs, not wait for audio time to advance');
  assert(groups.slice(0, -4).every(group => !connected(group)), 'oldest layers release all graph nodes immediately when the retirement cap is reached');
  await h.advance(2000);
  assert(groups.filter(connected).length <= 1, 'after the fade interval only the current scene layer survives');
  assert.equal(h.maxIntervals, 1); assert.equal(h.timeoutCalls, 0);
});
