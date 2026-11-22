import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, ENCOUNTER_REWARDS, COURSES, createEncounter, joinEncounter, leaveEncounter, advanceEncounter, actEncounter, levelFromXp, getSagaCue, getSagaCombatHint } from '../js/magic/adventure-rules.mjs';
import { SAGA } from '../js/magic/saga.mjs';

const all = Object.keys(HEROES);
function add(state, hero, skills = ['light', 'levitate', 'special'], now = 1000) {
  return joinEncounter(state, { id: hero, name: hero, hero, skills, level: 1 }, now);
}

test('five distinct roles have five signatures and talents; first-book XP caps at level five', () => {
  assert.equal(all.length, 5);
  assert.equal(new Set(Object.values(HEROES).map(x => x.active.id)).size, 5);
  assert.equal(new Set(Object.values(HEROES).map(x => x.passive.id)).size, 5);
  assert.deepEqual([0, 99, 100, 390, 400, 3500].map(x => levelFromXp(x)), [1,1,2,4,5,5]);
  assert.deepEqual(['normal','elite','troll'].map(k=>ENCOUNTER_REWARDS[k].xp), [20, 40, 80]);
  assert.deepEqual([COURSES.light.xp, COURSES.levitate.xp], [40, 40]);
});

test('reserve distinct seats, preserve role on reconnect, keep idle lobby safe, isolate separate runs', () => {
  let state = createEncounter('troll', 1000);
  for (const hero of all.slice(0,4)) state = add(state, hero);
  assert.throws(() => add(state, 'george'), /已满/);
  assert.throws(() => joinEncounter(add(createEncounter('normal',1000), 'ron'), { id: 'another', hero: 'ron' }, 1000), /队友选中/);
  assert.equal(joinEncounter(state, { id: 'ron', hero: 'harry' }, 80000).players.ron.hero, 'ron');
  assert.equal(advanceEncounter(state, 80000).players.harry.hp, 100);
  const a = actEncounter(state, 'harry', 'attack', 1000);
  assert.equal(state.enemy.hp, 150);
  assert.equal(a.enemy.hp, 148);
  assert.equal(createEncounter('troll', 1000).enemy.hp, 150);
  assert.throws(() => joinEncounter(createEncounter('elite',1000), {id:'__proto__',hero:'ron'},1000), /身份/);
});

test('all ten distinct pairs can win by switching between bait, levitation and focus fire', () => {
  for (let i = 0; i < all.length; ++i) {
    for (const partner of all.slice(i + 1)) {
      const leader = all[i];
      let s = add(add(createEncounter('troll', 1000), leader), partner);
      let now = 1000;
      for (let cycle = 0; cycle < 5 && s.status === 'active'; cycle++) {
        s = actEncounter(s, leader, 'bait', now);
        assert.equal(s.phase, 'opening');
        s = actEncounter(s, partner, 'levitate', now + 1);
        assert.equal(s.phase, 'vulnerable');
        const end = s.phaseUntil;
        for (let cue = now + 800; cue < end && s.status === 'active'; cue += 800) {
          s = actEncounter(s, leader, 'attack', cue);
          if (s.status === 'active') s = actEncounter(s, partner, 'attack', cue);
        }
        now = end + 800;
      }
      assert.equal(s.status, 'won');
      assert.ok(Object.values(s.players).every(x => x.contribution > 0));
      assert.deepEqual(advanceEncounter(s, now + 60000), s);
    }
  }
});

test('solo can win with precise timing; idle and repeated unguarded attacks are dangerous', () => {
  let s = add(createEncounter('troll', 1000), 'neville');
  let now = 1000;
  for (let i = 0; i < 5 && s.status === 'active'; i++) {
    s = actEncounter(s, 'neville', 'bait', now);
    assert.throws(() => actEncounter(s, 'neville', 'levitate', now + 900), /稳住脚步/);
    const castAt = s.phaseUntil - 1400;
    s = actEncounter(s, 'neville', 'levitate', castAt);
    const end = s.phaseUntil;
    for (let t = castAt + 760; t < end && s.status === 'active'; t += 760) s = actEncounter(s, 'neville', 'attack', t);
    now = end + 800;
  }
  assert.equal(s.status, 'won');
  let careless = actEncounter(add(createEncounter('troll',1000),'harry'),'harry','attack',1000);
  for (let i = 0; i < 3; i++) careless = advanceEncounter(careless, careless.phaseUntil);
  assert.equal(careless.status, 'lost');
  assert.equal(careless.players.harry.hp, 0);
  assert.throws(() => actEncounter(careless, 'harry', 'attack', 30000), /结束/);
});

test('successful physical dodge exposes the club; another player’s short dodge cannot shield the target', () => {
  let s = add(add(createEncounter('troll',1000),'ron'),'hermione');
  s = actEncounter(s,'ron','attack',1000);
  const due = s.phaseUntil;
  const wrongTarget = advanceEncounter(actEncounter(s, 'hermione', 'dodge', due - 700), due);
  assert.equal(wrongTarget.players.ron.hp,75);
  s = actEncounter(s,'ron','dodge',due - 700);
  s = advanceEncounter(s, due);
  assert.equal(s.phase, 'opening');
  assert.equal(s.opener,'ron');
  assert.equal(s.players.ron.hp, 110);
  assert.ok(s.players.ron.contribution >= 2);
});

test('teaching is required; rejected signature keeps focus and cooldown; Hermione extends control', () => {
  let s = add(add(createEncounter('troll',1000),'ron'), 'hermione', []);
  s = actEncounter(s,'ron','bait',1000);
  assert.throws(() => actEncounter(s,'hermione','levitate',1001),/课程/);
  assert.throws(() => actEncounter(s,'hermione','special',1001),/训练/);
  s = add(add(createEncounter('troll',1000),'ron'), 'hermione', ['S02','S01','M1']);
  s = actEncounter(s,'ron','bait',1000);
  assert.throws(() => actEncounter(s,'hermione','special',1001),/举起/);
  assert.equal(s.players.hermione.focus,110);
  s = actEncounter(s,'hermione','levitate',1001);
  assert.equal(s.phaseUntil,5001);
  s = actEncounter(s,'hermione','special',1801);
  assert.equal(s.phaseUntil,7001);
  assert.equal(s.players.hermione.focus,75);
  assert.throws(() => actEncounter(s,'hermione','special',2601),/冷却/);
  assert.equal(advanceEncounter(s,4801).players.hermione.focus,83);
});

test('all non-troll signatures execute their role, time gates and first aid', () => {
  let s = add(createEncounter('elite', 1000), 'harry');
  s = actEncounter(s, 'harry', 'attack', 1000);
  const kickAt = s.phaseUntil - 525;
  s = actEncounter(s, 'harry', 'special', kickAt);
  assert.equal(s.phaseUntil, kickAt + 3500);
  let team = add(add(createEncounter('elite',1000),'harry'),'ron');
  team = actEncounter(team,'harry','attack',1000);
  const firstDue = team.phaseUntil;
  team = actEncounter(team,'ron','special',1100);
  assert.equal(team.target,'ron');
  assert.equal(team.phaseUntil,firstDue + 2500);
  team = advanceEncounter(team,team.phaseUntil);
  assert.equal(team.players.ron.hp, 110-12);

  let ambush = add(createEncounter('normal',1000),'george');
  ambush = actEncounter(ambush,'george','attack',1000);
  assert.throws(() => actEncounter(ambush,'george','special',2000), /两米/);
  ambush = actEncounter(ambush,'george','special',ambush.phaseUntil-1900);
  ambush = advanceEncounter(ambush,ambush.phaseUntil);
  assert.equal(ambush.players.george.hp,95);

  let herbs = actEncounter(add(createEncounter('normal',1000),'neville'),'neville','attack',1000);
  herbs = advanceEncounter(herbs,herbs.phaseUntil);
  const injured = herbs.players.neville.hp;
  herbs = actEncounter(herbs,'neville','special',herbs.updatedAt);
  herbs = advanceEncounter(herbs,herbs.updatedAt+2000);
  assert.equal(herbs.players.neville.hp,injured+10);
});

test('rescue and illumination track real effects, spectators cannot claim credit for shining light', () => {
  let s = add(add(add(createEncounter('troll',1000),'ron'),'neville'), 'harry');
  s = actEncounter(s,'ron','attack',1000);
  s = actEncounter(s,'harry','light',1000);
  assert.equal(s.players.harry.contribution,0);
  assert.ok(s.players.harry.lightUntil > s.updatedAt);
  s.players.ron.hp = 0;
  s = actEncounter(s,'neville',{type:'rescue',target:'ron'},1000);
  assert.equal(s.players.ron.hp,0);
  s = advanceEncounter(s,2999);
  assert.equal(s.players.ron.hp,0);
  s = advanceEncounter(s,3000);
  assert.ok(s.players.ron.hp>0);
  assert.equal(s.players.neville.contribution,1);
  assert.throws(() => actEncounter(s, 'otherAccount', 'attack', 4000), /先进入/);
});

test('missing a troll opening has a cost; a pause never simulates an unattended series of hostile blows', () => {
  let s = add(createEncounter('troll',1000),'ron');
  s = actEncounter(s,'ron','bait',1000);
  const expired = advanceEncounter(s,s.phaseUntil);
  assert.equal(expired.players.ron.hp,95);
  assert.equal(expired.phase,'windup');
  const wake = advanceEncounter(expired, 3600000);
  assert.equal(wake.players.ron.hp,60);
  assert.equal(wake.status,'active');
});

test('a rescue completed before an overdue strike is honored even between polls', () => {
  let s = add(add(createEncounter('troll',1000),'ron'),'neville');
  s = actEncounter(s,'ron','attack',1000);
  s.players.ron.hp = 0;
  s.target = 'neville';
  s.players.neville.hp = 20;
  s = actEncounter(s,'neville','rescue',1100);
  s = advanceEncounter(s,6000);
  assert.equal(s.status,'active');
  assert.ok(s.players.ron.hp > 0);
  assert.equal(s.players.neville.hp,0);
});

test('explicit leave releases a slot, drops unsettled participation, redirects enemy and closes empty run', () => {
  let s = add(add(createEncounter('normal',1000),'harry'),'ron');
  s = actEncounter(s,'harry','attack',1000);
  const remainingHp = s.enemy.hp;
  s = leaveEncounter(s,'harry',1900);
  assert.equal(s.enemy.hp,remainingHp);
  assert.equal(s.target,'ron');
  assert.equal(s.players.harry,undefined);
  assert.throws(() => actEncounter(s,'harry','attack',2500), /先进入/);
  s = add(s,'harry',[],2000);
  assert.equal(s.players.harry.contribution,0);
  s = leaveEncounter(s,'harry',2001);
  s = leaveEncounter(s,'ron',2002);
  assert.equal(s.status,'lost');
  assert.throws(() => add(s,'ron'),/已经结束/);
});

test('stage spawn seats stay put on departures, and legacy fighters are placed around reserved seats', () => {
  let s = add(add(add(createEncounter('troll',1000),'ron'),'harry'),'george');
  assert.deepEqual(Object.values(s.players).map(p=>p.seat), [0,1,2]);
  s = leaveEncounter(s,'ron',1001);
  s = add(s,'neville',[],1002);
  assert.equal(s.players.neville.seat,0);
  assert.equal(s.players.george.seat,2);
  delete s.players.harry.seat;
  s = add(s,'hermione',[],1003);
  assert.deepEqual(Object.values(s.players).map(p=>p.seat),[1,2,0,3]);
});

function sagaParty(book, count, level=book.book*3) {
  let state = createEncounter(book.kind,1000);
  for (const hero of all.slice(0,count)) {
    state=joinEncounter(state,{id:hero,hero,level,skills:['special','light','levitate',book.spell.id]},1000);
  }
  return state;
}

// Play using only legal controls, the same timing hints visible in the client, and the server clock.
function finishBook(book, count) {
  let state=sagaParty(book,count),now=1000,turn=0;
  const bands=new Set(),members=Object.keys(state.players);
  for (let n=0;n<200 && state.status==='active';n++) {
    bands.add(state.mechanic.band);
    const id=members[turn++%count], p=state.players[id];
    now=Math.max(now,p.nextActionAt);
    state=advanceEncounter(state,now);
    if (state.status!=='active') break;
    const cue=getSagaCue(state);
    if (cue && state.started) {
      if (cue.late) now=Math.max(now,state.phaseUntil-2700);
      if (cue.relay && state.mechanic.actor===id) now=Math.max(now,state.mechanic.at+1801);
      if (cue.action==='counter') now=Math.max(now,p.cooldowns[book.spell.id]||0);
      if (cue.action==='light' || cue.action==='levitate') now=Math.max(now,p.cooldowns[cue.action]||0);
    }
    if (state.started && now>=state.phaseUntil) {state=advanceEncounter(state,now);continue;}
    state=actEncounter(state,id,cue?.action||'attack',now);
    now+=count===1?760:450;
  }
  return {state,bands};
}

for (const book of SAGA) {
  test(book.title+' boss requires its own course and has both solo and cooperative solutions',()=>{
    const protectedBoss=sagaParty(book,2);
    const harry=Object.keys(protectedBoss.players)[0];
    const first=actEncounter(protectedBoss,harry,'attack',1000);
    for(let time=1800;time<6000;time+=800) {
      const hit=actEncounter(first,harry,'attack',time);
      assert.equal(hit.enemy.hp,first.enemy.maxHp,'wand spam cannot penetrate the opening shield');
    }
    const untrained=sagaParty(book,1);
    untrained.players.harry.skills=['light','levitate'];
    let sequence=actEncounter(untrained,'harry','attack',1000),t=1800;
    while(getSagaCue(sequence)?.action!=='counter') {
      sequence=actEncounter(sequence,'harry',getSagaCue(sequence).action,t);
      t+=2000;
    }
    t=Math.max(t,sequence.phaseUntil-2100);
    assert.throws(()=>actEncounter(sequence,'harry','counter',t),/本卷课程/);
    const hint=getSagaCombatHint(sequence,'harry',t);
    assert.ok(hint && hint.includes('秒'));
    assert.ok(ENCOUNTER_REWARDS[book.kind].skillPoints>0);
    for (const count of [1,2]) {
      const {state,bands}=finishBook(book,count);
      assert.equal(state.status,'won',book.kind+' party '+count);
      assert.ok(Object.values(state.players).every(p=>p.contribution>0));
      if(book.kind==='voldemort') assert.deepEqual([...bands],[0,1,2]);
    }
  });
}

test('dementor relay accepts a friend immediately and a solo channel only after settling',()=>{
  const book=SAGA.find(b=>b.kind==='dementor');
  const start=actEncounter(sagaParty(book,2),'harry','counter',1000);
  assert.throws(()=>actEncounter(start,'harry','counter',2000),/接力/);
  assert.equal(actEncounter(start,'ron','counter',1001).phase,'vulnerable');
  assert.equal(actEncounter(start,'harry','counter',2801).phase,'vulnerable');
  const missed=advanceEncounter(start,start.phaseUntil);
  assert.equal(missed.mechanic.step,0);
  assert.ok(missed.players.ron.focus<missed.players.ron.maxFocus);
});

test('late interrupt, mirrored shield and levitated prophecy have distinct failure costs',()=>{
  const tower=SAGA.find(b=>b.kind==='tower');
  const start=actEncounter(sagaParty(tower,1),'harry','counter',1000);
  assert.ok(start.started,'using the first displayed ability starts even a delayed opportunity');
  assert.throws(()=>actEncounter(start,'harry','counter',2000),/过早/);
  const struck=actEncounter(start,'harry','counter',start.phaseUntil-2500);
  assert.equal(getSagaCue(struck).action,'attack');
  const prophecy=SAGA.find(b=>b.kind==='prophecy');
  const sphere=actEncounter(sagaParty(prophecy,2),'harry','levitate',1000);
  sphere.enemy.hp-=25;
  const dropped=advanceEncounter(sphere,sphere.phaseUntil);
  assert.equal(dropped.enemy.hp,sphere.enemy.hp+18);
  const mirror=SAGA.find(b=>b.kind==='quirrell');
  const waiting=actEncounter(sagaParty(mirror,1),'harry','attack',1000);
  assert.throws(()=>actEncounter(waiting,'harry','counter',2000),/荧光/);
});

test('fighting inherits the player’s growth and every final-duel seal limits burst damage',()=>{
  let s=createEncounter('voldemort',1000);
  s=joinEncounter(s,{id:'a',hero:'harry',level:35,growth:{vitality:2,focus:3},skills:['light','expelliarmus']},1000);
  assert.deepEqual([s.players.a.hp,s.players.a.maxFocus],[180,115]);
  s=actEncounter(s,'a','bait',1000);s=actEncounter(s,'a','counter',2900);
  s=actEncounter(s,'a','attack',3700);s=actEncounter(s,'a','attack',4500);
  assert.equal(s.mechanic.band,1);assert.equal(s.enemy.hp,480);
  assert.equal(actEncounter(s,'a','attack',5300).enemy.hp,480);
});

test('an advanced mentor keeps their own progress and scales to the earlier book in the instance',()=>{
  const mentor={id:'h',hero:'harry',level:35,growth:{vitality:12,focus:9},skills:['light','levitate']};
  const party=joinEncounter(createEncounter('quirrell',1000),mentor,1000);
  const scaled=party.players.h;
  assert.equal(scaled.level,5);
  assert.equal(scaled.maxHp,100+8+5*6);
  assert.equal(scaled.maxFocus,100+5*5);
  assert.equal(mentor.level,35);assert.equal(mentor.growth.vitality,12);
});
