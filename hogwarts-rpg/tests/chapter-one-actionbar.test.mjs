import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionBar } from '../chapter-one/client/actionbar.mjs';

// Minimal DOM surface, exercising the production renderer rather than parsing
// its source or copying state logic. No WebGL or external browser is required.
class Element {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.hidden = false; this.disabled = false; this.className = ''; }
  append(...children) { this.children.push(...children); children.forEach(child => { child.parentNode = this; }); }
  replaceChildren(...children) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text || this.children.map(child => child.textContent).join(''); }
}
function harness() {
  const document = { createElement(tag) { return new Element(tag, document); }, createElementNS(namespace, tag) { const element = new Element(tag, document); element.namespaceURI = namespace; return element; } }, container = document.createElement('section'), castContainer = document.createElement('section');
  const bar = createActionBar({ container, castContainer });
  const character = { id: 'c', heroId: 'harry', hp: 100, focus: 100, skills: ['bolt', 'dodge', 'levitate', 'H1'], completedQuestIds: ['M04'], potions: { health: 2, focus: 2 } };
  const combat = { status: 'active', players: { c: { hp: 100, focus: 100, learnedSkillIds: character.skills, potions: { health: 0, focus: 1 }, potionUses: 0, cooldowns: { H1: 6000 }, gcdUntil: 1400, stats: { haste: 0 } } } };
  return { bar, container, castContainer, snapshot: { character, combat, now: 1000 } };
}
function part(root, className) {
  for (const child of root.children) { if (String(child.className).split(/\s+/).includes(className)) return child; const match = part(child, className); if (match) return match; }
  return null;
}
const slot = (container, id) => container.children.find(button => button.dataset.skill === id);
function offset(button, className) {
  const ring = part(button, className); assert(ring, `${className} exists inside ${button.dataset.skill}`);
  assert.equal(ring.tagName, 'CIRCLE'); assert.equal(ring.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(ring.getAttribute('pathLength'), '100'); assert.equal(ring.getAttribute('stroke-dasharray'), '100');
  return Number(ring.getAttribute('stroke-dashoffset'));
}
const close = (actual, expected) => assert(Math.abs(actual - expected) < .001, `${actual} differs from expected ${expected}`);

test('HUD shows changing CD and GCD, preserves button identity, and disables an empty authoritative potion slot', () => {
  const { bar, container, snapshot } = harness(); bar.update(snapshot);
  assert.equal(container.children.length, 8); assert(container.children.some(button => button.dataset.skill === 'dodge'));
  const special = container.children.find(button => button.dataset.skill === 'H1'), potion = container.children.find(button => button.dataset.skill === 'potion-health');
  assert.equal(part(special, 'ability-time').textContent, '5.0'); assert.equal(special.disabled, true); assert.equal(part(special, 'ability-status').textContent, '技能冷却');
  assert.equal(part(potion, 'ability-count').textContent, '×0'); assert.equal(potion.dataset.state, 'no-stock'); assert.equal(potion.disabled, true); assert.match(potion.attributes['aria-label'], /库存 0/);
  bar.update({ ...snapshot, now: 6200 }); assert.equal(container.children.find(button => button.dataset.skill === 'H1'), special); assert.equal(special.disabled, false); assert.equal(special.dataset.cooling, 'false'); assert.equal(offset(special, 'ability-cooldown-ring'), 100);
});

test('the cast bar distinguishes unconfirmed delivery, authoritative windup, channel and completion', () => {
  const { bar, castContainer, snapshot } = harness();
  bar.update({ ...snapshot, pending: { skillId: 'levitate', startedAt: 800, status: 'sending' }, queuedSkillId: 'bolt' });
  assert.equal(castContainer.hidden, false); assert.equal(castContainer.dataset.phase, 'waiting'); assert.match(castContainer.textContent, /等待服务器确认/);
  snapshot.combat.players.c.action = { id: 'a', skillId: 'levitate', startAt: 1000, releaseAt: 1800, completeAt: 3800, channel: true };
  bar.update({ ...snapshot, now: 1400 }); assert.equal(castContainer.dataset.phase, 'windup'); assert.equal(part(castContainer, 'cast-track').attributes['aria-valuenow'], '50');
  bar.update({ ...snapshot, now: 2300 }); assert.equal(castContainer.dataset.phase, 'channel'); assert.match(castContainer.textContent, /持续引导/);
  bar.update({ ...snapshot, now: 3900 }); assert.equal(castContainer.hidden, true);
  bar.dispose(); assert.equal(castContainer.children.length, 0); assert.equal(castContainer.hidden, true); assert.deepEqual(bar.update(snapshot), []);
});

test('switching hero replaces only the slot roster, and uninitialized containers are safe', () => {
  const { bar, container, snapshot } = harness(); bar.update(snapshot); snapshot.character.heroId = 'hermione'; bar.update(snapshot);
  assert(container.children.some(button => button.dataset.skill === 'M1')); assert(!container.children.some(button => button.dataset.skill === 'H1'));
  const empty = createActionBar(); assert.deepEqual(empty.update(), []); empty.dispose();
});


test('simultaneous skill rings count down independently and restore correctly from a later snapshot', () => {
 const {bar,container,castContainer,snapshot}=harness();
 snapshot.combat.players.c.cooldowns.dodge=3000;
 bar.update(snapshot);
 const special=slot(container,'H1'),dodge=slot(container,'dodge');
 close(offset(special,'ability-cooldown-ring'),100/6);
 close(offset(dodge,'ability-cooldown-ring'),100/3);
 close(offset(special,'ability-gcd-ring'),50);
 assert.equal(part(special,'ability-time').textContent,'5.0');
 assert.equal(part(dodge,'ability-time').textContent,'2.0');
 assert.equal(castContainer.hidden,true,'cooldowns never open the cast overlay');
 const later={...snapshot,now:3200};bar.update(later);
 assert.equal(dodge.disabled,false);assert.equal(dodge.dataset.cooling,'false');
 assert.equal(special.disabled,true);assert.equal(special.dataset.cooling,'true');
 assert.equal(special.dataset.gcd,'false');assert.equal(offset(special,'ability-gcd-ring'),100);
 assert.equal(part(special,'ability-time').textContent,'2.8');
 const restored=harness();restored.bar.update(later);
 close(offset(slot(restored.container,'H1'),'ability-cooldown-ring'),offset(special,'ability-cooldown-ring'));
 assert.equal(slot(restored.container,'dodge').disabled,false);
 bar.update({...later,queuedSkillId:'H1'});
 assert.equal(special.dataset.queued,'true');assert.equal(castContainer.hidden,true,'queued-only feedback belongs to its own slot');
});
