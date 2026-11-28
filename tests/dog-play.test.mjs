import test from 'node:test';
import assert from 'node:assert/strict';
import { commands, commandPose, neutralDogPose, practice, MASTERY, launchDisc, discAt } from '../js/h/dog-play.js';

test('each command is learned independently; a mastered command always works', () => {
  const skills = {};
  for (const command of Object.keys(commands)) {
    assert.equal(practice(skills, command, () => .7), false);
    for (let n = 1; n < MASTERY; n++) practice(skills, command);
    assert.equal(practice(skills, command, () => .9999), true);
    assert.equal(skills[command], MASTERY);
  }
});
test('practice improves retrieving while leaving a small chance of a lost disc', () => {
  const skills = {};
  assert.equal(practice(skills, 'fetch', () => .75), false);
  for (let n = 1; n < MASTERY; n++) practice(skills, 'fetch');
  assert.equal(practice(skills, 'fetch', () => .75), true);
  assert.equal(practice(skills, 'fetch', () => .99), false);
});
test('banked throws glide farther with a run-up and bend late in flight', () => {
  const throws = [0, 7.5, 12].map(z => launchDisc({ x:0, y:0, z:0 }, 0, { x:0, z }, () => .6));
  assert.deepEqual(throws.map(flight => Math.round(flight.distance)), [57, 74, 84]);
  for (const f of throws) {
    const mid = discAt(f,f.duration/2), end = discAt(f,f.duration);
    assert.ok(mid.y > f.y && end.y < .1);
    assert.ok(Math.abs(discAt(f, 0).bank) < .08);
    assert.ok(Math.abs(end.x - mid.x) > 2 && Math.abs(end.bank) < .18);
  }
});

test('stand lifts the front paws and handshake raises only one', () => {
  const sit = commandPose('sit', .8);
  assert.deepEqual(commandPose('sit', 0), neutralDogPose);
  assert.ok(sit.height < 0);
  assert.deepEqual(commandPose('stand', 0, sit), sit);
  const stand = commandPose('stand', .8, sit);
  assert.ok(stand.height > .35 && stand.pitch < -1);
  assert.ok(stand.legs[0] === stand.legs[1] && stand.legs[2] === -stand.pitch);
  assert.equal(commandPose('paw', .2).legs[0], 0);
  const paw = commandPose('paw', .8);
  assert.ok(paw.legs[0] < -1.4 && paw.legs[1] === -paw.pitch);
  assert.ok(paw.legs[2] === paw.legs[3]);
});
