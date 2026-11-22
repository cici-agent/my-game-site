import test from 'node:test';
import assert from 'node:assert/strict';
import { TALENTS, validTalent } from '../js/magic/adventure-talents.mjs';
import { HEROES, actEncounter, advanceEncounter, createEncounter, joinEncounter } from '../js/magic/adventure-rules.mjs';

function party(kind, hero, talent) {
  let s = createEncounter(kind, 1000);
  const friend = hero === 'ron' ? 'harry' : 'ron';
  const skills = ['levitate','light','special'];
  s = joinEncounter(s,{id:'friend',hero:friend,skills},1000);
  return joinEncounter(s,{id:'wizard',hero,talent,skills},1000);
}

test('rank one offers two exclusive choices per hero and never borrows another role’s talent', () => {
  for (const hero of Object.keys(HEROES)) {
    assert.equal(TALENTS[hero].length,2);
    for (const {id} of TALENTS[hero]) assert.equal(validTalent(hero,id),true);
  }
  assert.equal(Object.values(TALENTS).flat().length,10);
  assert.equal(party('troll','ron','early-interrupt').players.wizard.talent,null);
  assert.equal(party('troll','hermione','steady-lift').players.wizard.talent,'steady-lift');
});

test('Harry can widen the exact interrupt or strengthen one shot each vulnerability', () => {
  for (const [talent,duration] of [['early-interrupt',3500],['pursuit',2500]]) {
    let s = actEncounter(party('elite','harry',talent),'friend','attack',1000);
    const cast = s.phaseUntil - 620;
    s = actEncounter(s,'wizard','special',cast);
    assert.equal(s.phaseUntil,cast+duration);
    const hp = s.enemy.hp;
    s = actEncounter(s,'wizard','attack',cast+800);
    assert.equal(hp-s.enemy.hp,talent === 'pursuit' ? 26 : 22);
    const remaining = s.enemy.hp;
    s = actEncounter(s,'wizard','attack',cast+1600);
    assert.equal(remaining-s.enemy.hp,22);
  }
});

test('Ron decides between a longer distraction and a stronger guard', () => {
  for (const [talent,delay,damage] of [['long-feint',3000,12],['steady-guard',2500,9]]) {
    let s = actEncounter(party('elite','ron',talent),'friend','attack',1000);
    const original = s.phaseUntil;
    s = actEncounter(s,'wizard','special',1100);
    assert.equal(s.phaseUntil-original,delay);
    s = advanceEncounter(s,s.phaseUntil);
    assert.equal(s.players.wizard.maxHp-s.players.wizard.hp,damage);
  }
});

test('Hermione can extend the fundamental lift or reduce the signature focus cost', () => {
  for (const [talent,window,paid] of [['steady-lift',4500,35],['efficient-control',4000,30]]) {
    let s = actEncounter(party('troll','hermione',talent),'friend','bait',1000);
    s = actEncounter(s,'wizard','levitate',1100);
    assert.equal(s.phaseUntil-1100,window);
    s = actEncounter(s,'wizard','special',2000);
    assert.equal(s.players.wizard.maxFocus-s.players.wizard.focus,paid);
  }
});

test('Neville can specialize in supplies or in bringing downed friends back', () => {
  for (const [talent,hp,bonus] of [['potent-herbs',22,0],['recovery',20,3]]) {
    let s = actEncounter(party('normal','neville',talent),'wizard','attack',1000);
    s.players.friend.hp=50;
    s = actEncounter(s,'wizard',{type:'special',target:'friend'},1900);
    s = advanceEncounter(s,5900);
    assert.equal(s.players.friend.hp-50,hp);
    s.players.friend.hp=0;
    s = actEncounter(s,'wizard','rescue',5901);
    s = advanceEncounter(s,7901);
    assert.equal(s.players.friend.hp,Math.ceil(s.players.friend.maxHp*.35)+bonus);
  }
});

test('George can extend a successful distraction or regain focus for covering a friend', () => {
  for (const [talent,delay,focus] of [['long-decoy',500,95],['refund-decoy',0,103]]) {
    let s = actEncounter(party('elite','george',talent),'friend','attack',1000);
    const strike = s.phaseUntil;
    s = actEncounter(s,'wizard','special',strike-1500);
    s = advanceEncounter(s,strike);
    assert.equal(s.players.friend.hp,s.players.friend.maxHp);
    assert.equal(s.phaseUntil-strike,3400+delay);
    assert.equal(s.players.wizard.focus,focus);
  }
});
