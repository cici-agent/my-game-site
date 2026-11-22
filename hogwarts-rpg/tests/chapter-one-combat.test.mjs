import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncounter, advanceEncounter, applyCombatIntent, moveCombatPlayer, rewardEligibility, getEncounterView, calculateDamage } from '../chapter-one/combat/engine.mjs';
import { contentData } from '../chapter-one/data/index.mjs';
import { sweep } from '../chapter-one/combat/geometry.mjs';

const all = hero => contentData.skills.filter(s => s.role === 'all' || s.role === hero).map(s => s.id);
const player = (id = 'p', heroId = 'harry', level = 18, extra = {}) => ({ id, heroId, level, skills: all(heroId), ...extra });
const emptyArena = { bounds: { minX: -14, maxX: 14, minZ: -14, maxZ: 14 }, obstacles: [] };
const start = options => createEncounter({ id: 'test', kind: 'trainer', players: [player()], arena: emptyArena, ...options });
const action = (state, skillId, rest = {}) => { const target=state.enemies['enemy-0'],self=state.players.p;return applyCombatIntent(state, { playerId: 'p', actionId: `${skillId}:${state.now}`, skillId, aim: { x: target.position.x-self.position.x, y: target.position.y+target.collisionBase+target.collisionHeight*.5-self.position.y-1.2, z: target.position.z-self.position.z }, now: state.now, ...rest }); };

test('fixed normal health, exact frozen boss rosters and no client level overwrite', () => {
  for (let size = 1; size <= 5; size++) {
    const players = Array.from({ length: size }, (_, i) => player(`p${i}`));
    for (const [kind, template] of [['troll', 'B1-E07'], ['stone', 'B1-E15']]) {
      const state = start({ kind, players });
      assert.equal(state.enemies['enemy-0'].maxHp, contentData.bosses.find(e => e.id === template).hpByPlayers[size]);
      assert.equal(state.rescueBudget, size - 1);
    }
    const normal = start({ kind: 'monster', enemyId: 'ROOT-ELITE-L22', players });
    assert.equal(normal.enemies['enemy-0'].hp, 2704);
    assert.equal(normal.enemies['enemy-0'].level, 22);
  }
  assert.throws(() => start({ players: [] }), /PARTY_SIZE/);
  assert.throws(() => start({ players: Array.from({ length: 6 }, (_, i) => player(String(i))) }), /PARTY_SIZE/);
  assert.throws(() => start({ enemyId: 'invented' }), /UNKNOWN_ENEMY/);
});

test('actual aimed projectile hits once and a missed cast never damages an enemy', () => {
  let state = start(); const original = structuredClone(state);
  const result = action(state, 'bolt', { actionId: 'one' });
  assert.equal(result.result.code, 'ACCEPTED');
  state = advanceEncounter(result.state, 500);
  assert.equal(state.events.filter(e => e.type === 'enemy_damaged').length, 1);
  assert.deepEqual(original, start(), 'input snapshot is never mutated');
  const hp = state.enemies['enemy-0'].hp;
  state = action(advanceEncounter(state, 900), 'bolt', { actionId: 'miss', aim: { x: 1, z: 0 } }).state;
  state = advanceEncounter(state, 1600);
  assert.equal(state.enemies['enemy-0'].hp, hp);
  assert.ok(state.events.some(e => e.type === 'spell_missed'));
  assert.equal(rewardEligibility(state).length, 0, 'damage is insufficient until victory');
});

test('trusted initial resources persist between fights and invalid values cannot enter snapshots', () => {
  const state = start({ players: [player('p', 'harry', 18, { hp: 123, focus: 17 })] });
  assert.equal(state.players.p.hp, 123);
  assert.equal(state.players.p.focus, 17);
  assert.ok(state.players.p.maxHp > 123);
  assert.ok(start().players.p.hp === start().players.p.maxHp, 'omitting trusted resource values initializes a full new attempt');
  for (const extra of [{ hp: -1 }, { hp: Infinity }, { hp: 1e6 }, { focus: -1 }, { focus: NaN }, { focus: 1e6 }]) assert.throws(() => start({ players: [player('p', 'harry', 18, extra)] }), /INVALID_INITIAL/);
});

test('ray visual endpoints distinguish aimed misses and walls from selected candidates', () => {
  const targetId = 'enemy-0';
  const interruptible = options => { const state = start(options); state.enemies[targetId].attack = { id: 'enemy-cast', interruptible: true, releaseAt: 1000, origin: { x: 0, z: -1 }, aim: { x: 0, z: 5 }, direction: { x: 0, z: 1 }, shape: 'line', range: 8, radius: .2, rawDamage: 0, damageType: 'physical' }; return state; };
  let miss = action(interruptible(), 'H1', { targetId, aim: { x: 1, z: 0 } }).state;
  miss = advanceEncounter(miss, 200);
  const release = miss.events.find(event => event.type === 'action_released');
  assert.equal(release.collision, 'miss');
  assert.ok(release.endPosition.x > 10);
  assert.ok(Math.abs(release.endPosition.z - 5) < .01);
  const obstacles = [{ id: 'ray-wall', shape: 'box', minX: 2, maxX: 2.1, minZ: 4, maxZ: 6 }];
  let wall = action(interruptible({ arena: { ...emptyArena, obstacles } }), 'H1', { targetId, aim: { x: 1, z: 0 } }).state;
  wall = advanceEncounter(wall, 200);
  const blocked = wall.events.find(event => event.type === 'action_released');
  assert.equal(blocked.collision, 'wall');
  assert.ok(blocked.endPosition.x >= 2 && blocked.endPosition.x < 2.2);
  assert.equal(new Set(wall.events.map(event => event.id)).size, wall.events.length);
});

test('continuous collision catches thin walls and wall ties win before target collision', () => {
  const obstacle = { id: 'thin', shape: 'box', minX: -.1, maxX: .1, minZ: 1.99, maxZ: 2.01 };
  const hit = sweep({ x: 0, z: 5 }, { x: 0, z: -5 }, [], [obstacle], .08);
  assert.equal(hit.kind, 'wall');
  let state = start({ arena: { ...emptyArena, obstacles: [obstacle] } });
  state = advanceEncounter(action(state, 'bolt').state, 500);
  assert.equal(state.enemies['enemy-0'].hp, 240);
  assert.ok(state.events.some(e => e.type === 'wall_hit'));
  const tie = sweep({ x: 0, z: 1 }, { x: 0, z: -1 }, [{ id: 'enemy', position: { x: 0, z: 0 }, radius: .2 }], [{ id: 'wall', shape: 'circle', x: 0, z: 0, radius: .2 }]);
  assert.equal(tie.kind, 'wall');
});

test('same action retries once, changed payload fails, GCD and role qualification are authoritative', () => {
  const accepted = action(start(), 'bolt', { actionId: 'same' });
  const repeated = action(accepted.state, 'bolt', { actionId: 'same' });
  assert.deepEqual(repeated.result, accepted.result);
  assert.equal(repeated.state.events.filter(e => e.type === 'action_started').length, 1);
  assert.throws(() => action(accepted.state, 'bolt', { actionId: 'same', aim: { x: 1, z: 0 } }), /ACTION_ID_CONFLICT/);
  assert.equal(action(accepted.state, 'bolt', { actionId: 'other' }).result.code, 'GLOBAL_COOLDOWN');
  assert.equal(action(start(), 'N1').result.code, 'SKILL_NOT_LEARNED');
  assert.equal(action(start(), 'broom').result.code, 'FLIGHT_NOT_AUTHORIZED_IN_COMBAT');
  assert.equal(action(start({ players: [player('p', 'harry', 1, { skills: ['dodge'] })] }), 'bolt').result.code, 'SKILL_NOT_LEARNED');
});

test('movement credits prevent zero-time teleport spam, walls stop movement, dodge has no immunity', () => {
  let state = start();
  state = moveCombatPlayer(state, { playerId: 'p', position: { x: .04, z: 5 }, now: 0 });
  state = moveCombatPlayer(state, { playerId: 'p', position: { x: .08, z: 5 }, now: 0 });
  assert.throws(() => moveCombatPlayer(state, { playerId: 'p', position: { x: .12, z: 5 }, now: 0 }), /MOVEMENT_TOO_FAST/);
  state = start();
  const enemy = state.enemies['enemy-0'];
  enemy.attack = { id: 'circle', origin: { x: 0, z: 0 }, aim: { x: 0, z: 5 }, shape: 'circle', radius: 10, targetId: 'p', rawDamage: 50, damageType: 'physical', releaseAt: 300, heavy: false };
  const hp = state.players.p.hp;
  state = action(state, 'dodge', { aim: { x: 1, z: 0 } }).state;
  state = advanceEncounter(state, 500);
  assert.equal(state.players.p.position.x, 1.8);
  assert.ok(state.players.p.hp < hp, 'a dodge still inside the damage circle is hit');
});

test('target invalidation before release refunds focus and charge but retains started GCD', () => {
  let state = start({ players: [player('p', 'neville')] });
  const before = state.players.p.focus;
  state = action(state, 'N1').state;
  state = moveCombatPlayer(state, { playerId: 'p', position: { x: .2, z: 5 }, now: 200 });
  assert.equal(state.players.p.action, null);
  assert.equal(state.players.p.focus, before);
  assert.equal(state.players.p.herbCharges, 3);
  assert.equal(state.players.p.cooldowns.N1, undefined);
  assert.ok(state.players.p.gcdUntil > state.now);
});

test('interrupt has a ray, elite shared immunity, bosses reject without resource costs', () => {
  let state = start({ kind: 'monster', enemyId: 'ROOT-ELITE-L22' });
  const enemy = state.enemies['enemy-0'];
  enemy.attack = { id: 'test', interruptible: true, releaseAt: 1000, origin: { x: 0, z: -1 }, aim: { x: 0, z: 5 }, direction: { x: 0, z: 1 }, shape: 'line', range: 8, radius: .2, rawDamage: 0, damageType: 'physical' };
  state = advanceEncounter(action(state, 'H1', { targetId: enemy.id }).state, 200);
  assert.equal(state.enemies[enemy.id].controlledUntil, 1150);
  assert.equal(state.enemies[enemy.id].controlImmuneUntil, 9150);
  assert.equal(state.players.p.focus, state.players.p.maxFocus - 12);
  const boss = start({ kind: 'troll' });
  const rejected = action(boss, 'H1', { targetId: 'enemy-0' });
  assert.equal(rejected.result.code, 'CONTROL_IMMUNE');
  assert.equal(rejected.state.players.p.focus, boss.players.p.focus);
});

test('rescue consumes one shared charge after a continuous cast, disconnect state is preserved', () => {
  let state = start({ players: [player('p', 'neville'), player('friend', 'ron', 18, { position: { x: 1, z: 5 } })] });
  state.players.friend.hp = 0; state.players.friend.downedUntil = 30000;
  state = action(state, 'rescue', { targetId: 'friend' }).state;
  assert.equal(state.rescueBudget, 1);
  state = advanceEncounter(JSON.parse(JSON.stringify(state)), 2050);
  assert.equal(state.rescueBudget, 0);
  assert.equal(state.players.friend.hp, Math.round(state.players.friend.maxHp * .35 * 100) / 100);
  assert.equal(state.players.friend.rescued, true);
  assert.ok(state.players.friend.protectedUntil > state.now);
  state.players.friend.hp = 0;
  assert.equal(action(state, 'rescue', { actionId: 'again', targetId: 'friend' }).result.code, 'TARGET_NOT_RESCUABLE');
});

test('herb healing is four bounded ticks, no overheal contribution and no automatic resurrection', () => {
  let state = start({ players: [player('p', 'neville')] });
  state.players.p.hp -= 100;
  state = action(state, 'N1').state;
  state = advanceEncounter(state, 1000);
  assert.equal(state.players.p.herbCharges, 2);
  assert.equal(state.effects.length, 1);
  state.enemies['enemy-0'].nextAttackAt = 100000;
  state = advanceEncounter(state, 5000);
  assert.equal(state.players.p.contribution.effectiveHealing, 100);
  assert.equal(state.effects.length, 0);
  assert.equal(state.players.p.hp, state.players.p.maxHp);
});

test('boss phase gates require real HP and sequential solo mechanisms, zero HP ends attacks', () => {
  let state = start({ kind: 'troll', players: [player('p', 'harry', 18, { position: { x: 0, z: 2 } })] });
  let enemy = state.enemies['enemy-0'];
  enemy.hp = enemy.maxHp * .7 + 1;
  state = advanceEncounter(action(state, 'bolt').state, 500);
  enemy = state.enemies['enemy-0'];
  assert.equal(enemy.hp, enemy.maxHp * .7); assert.equal(enemy.phase, 1); assert.equal(enemy.phaseLocked, true);
  state.mechanics.dodged = true;
  state = advanceEncounter(action(advanceEncounter(state, 900), 'bolt', { actionId: 'phase2' }).state, 1300);
  enemy = state.enemies['enemy-0']; assert.equal(enemy.phase, 2);
  // Authoritative scenario fixture at the next damage boundary: mechanism cannot skip HP.
  enemy.hp = enemy.maxHp * .35; enemy.windowUntil = 10000; enemy.nextAttackAt = 10000;
  state.players.p.position = { x: 3, y: 0, z: 1 };
  state = action(state, 'interact', { actionId: 'rescue-npc', targetId: 'rescue-point' }).state;
  state = advanceEncounter(state, 3400);
  assert.equal(state.mechanics.rescue, true); assert.equal(state.enemies['enemy-0'].phase, 3);
  assert.equal(state.enemies['enemy-0'].hp, enemy.maxHp * .35, 'interactions do not damage boss');
  state = action(state, 'levitate', { actionId: 'club', targetId: 'club' }).state;
  state = advanceEncounter(state, 6300); assert.equal(state.mechanics.levitated, true);
  state.enemies['enemy-0'].hp = 1;
  const e = state.enemies['enemy-0'], p = state.players.p;
  state = action(state, 'bolt', { actionId: 'last', aim: { x: e.position.x - p.position.x, z: e.position.z - p.position.z } }).state;
  state = advanceEncounter(state, 7000);
  assert.equal(state.status, 'won'); assert.deepEqual(rewardEligibility(state), ['p']);
  const hp = state.players.p.hp; state = advanceEncounter(state, 100000); assert.equal(state.players.p.hp, hp);
});

test('solo ordinary training can be played to victory; bystanders receive no retrospective reward', () => {
  let state = start({ players: [player('p', 'harry', 1), player('idle', 'ron', 1, { position: { x: 12, z: 12 } })] });
  for (let now = 0; now < 30000 && state.status === 'active'; now += 850) {
    const enemy = state.enemies['enemy-0'], p = state.players.p;
    state = applyCombatIntent(state, { playerId: 'p', actionId: `shot${now}`, skillId: 'bolt', aim: { x: enemy.position.x - p.position.x, y: enemy.position.y+enemy.collisionBase+enemy.collisionHeight*.5-p.position.y-1.2, z: enemy.position.z - p.position.z }, now }).state;
    state = advanceEncounter(state, now + 800);
  }
  assert.equal(state.status, 'won'); assert.deepEqual(rewardEligibility(state), ['p']);
  const view = getEncounterView(state, 'p');
  assert.equal(view.selfId, 'p'); assert.equal(view.actionReceipts, undefined); assert.equal(view.randomState, undefined);
});

test('defense formula caps reduction at 70 percent with no enemy random critical hits', () => {
  assert.equal(calculateDamage(100, 100, 1), 50);
  assert.equal(calculateDamage(100, 1e9, 1), 30);
  assert.equal(calculateDamage(100, -100, 1), 100);
});

test('levitation commits once after windup and a cancelled channel retains its started cooldown', () => {
  let state = start({ kind: 'troll', players: [player('p', 'harry', 18, { position: { x: 0, z: 2 } })] });
  const enemy = state.enemies['enemy-0']; enemy.phase = 3; enemy.windowUntil = 6000; enemy.nextAttackAt = 6000;
  state = action(state, 'levitate', { actionId: 'lift', targetId: 'club' }).state;
  assert.equal(state.players.p.action.releaseAt, 800);
  assert.equal(state.players.p.action.completeAt, 2800);
  state = advanceEncounter(state, 800);
  assert.equal(state.players.p.cooldowns.levitate, 2800);
  assert.equal(state.mechanics.levitated, false);
  state = moveCombatPlayer(state, { playerId: 'p', position: { x: .1, z: 2 }, now: 900 });
  assert.equal(state.players.p.action, null);
  assert.equal(state.players.p.cooldowns.levitate, 2800);
  assert.equal(state.players.p.focusResumeAt, 0, 'zero-cost spell does not pause focus regeneration');
  assert.equal(state.events.filter(e => e.type === 'action_released' && e.actionId === 'lift').length, 1);
  assert.equal(state.mechanics.levitated, false);
});

test('explicit three-dimensional aim points resolve from the authoritative chest despite stale aim direction, with walls still blocking',()=>{
 for(const skillId of ['bolt','H1']){
  const prepare=arena=>{
   const state=start({arena});
   state.enemies['enemy-0'].attack={id:'test-cast',interruptible:true,releaseAt:2000,origin:{x:0,z:-1},aim:{x:0,z:5},direction:{x:0,z:1},shape:'line',range:8,radius:.2,rawDamage:0,damageType:'physical'};
   return state;
  };
  let state=prepare(emptyArena),enemy=state.enemies['enemy-0'];
  const aimPoint={x:enemy.position.x,y:enemy.position.y+enemy.collisionBase+enemy.collisionHeight*.5,z:enemy.position.z};
  state=advanceEncounter(action(state,skillId,{targetId:enemy.id,aim:{x:1,y:1,z:0},aimPoint}).state,600);
  if(skillId==='bolt')assert.ok(state.events.some(e=>e.type==='enemy_damaged'));
  else assert.ok(state.events.some(e=>e.type==='action_released'&&e.collision==='target'));
  const obstacles=[{id:'aim-wall',shape:'box',minX:-2,maxX:2,minZ:1.99,maxZ:2.01,height:3}];
  const blockedCast=action(prepare({...emptyArena,obstacles}),skillId,{targetId:enemy.id,aim:{x:1,y:1,z:0},aimPoint});
  const blocked=advanceEncounter(blockedCast.state,600);
  assert.equal(blocked.enemies['enemy-0'].hp,240);
  if(skillId==='bolt')assert.ok(blocked.events.some(e=>e.type==='wall_hit'));
  else assert.equal(blocked.enemies['enemy-0'].attack?.id,'test-cast');
 }
});

test('combat frame routes use the same radius and tangent sliding as local prediction around an arena pillar',async()=>{
 const {DEFAULT_ARENA}=await import('../chapter-one/combat/geometry.mjs');
 const {moveWithCollisions}=await import('../chapter-one/client/scene-geometry.mjs');
 let state=start({arena:DEFAULT_ARENA,players:[player('p','harry',18,{position:{x:-5.1,y:0,z:.9}})]});
 let point={...state.players.p.position};const steps=[];
 for(let frame=0;frame<9;frame++){
  const next=moveWithCollisions(point,{x:point.x+Math.cos(Math.PI/8)*4.3/60,y:0,z:point.z+Math.sin(Math.PI/8)*4.3/60},DEFAULT_ARENA.bounds,DEFAULT_ARENA.obstacles);
  steps.push({dx:next.x-point.x,dy:0,dz:next.z-point.z});point=next;
 }
 state=moveCombatPlayer(state,{playerId:'p',position:point,steps,sprint:true,now:150});
 assert.ok(Math.hypot(point.x-state.players.p.position.x,point.z-state.players.p.position.z)<1e-9);
 assert.ok(point.x> -4.6,'a diagonal route slides along the pillar instead of stopping its entire vector');
 assert.throws(()=>moveCombatPlayer(state,{playerId:'p',position:point,steps:[{dx:3,dy:0,dz:0},{dx:-3,dy:0,dz:0}],sprint:true,now:151}),/MOVEMENT_TOO_FAST/);
});
