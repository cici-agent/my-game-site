import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Vector3 } from 'three';
import { resolveAreaId, getWorldArea, getAreaLinks } from '../chapter-one/world-atlas.mjs';
import { WALK_SPEED } from '../chapter-one/movement.mjs';
import { moveAmongPeople } from '../chapter-one/people.mjs';
import { correctionPlan, moveWithCollisions, sampleEscort } from '../chapter-one/client/scene-geometry.mjs';
import { applyEquipmentAppearance, resetEquipmentAppearance } from '../chapter-one/presentation/equipment-appearance.mjs';

// Execute the actual world coordinator functions. Scene construction, rendering
// and the RAF-produced frame samples are the only replaced boundaries.
const source = await readFile(new URL('../chapter-one/client/world.mjs', import.meta.url), 'utf8');
function actualFunction(name) {
  const declaration = new RegExp(`^  (?:async )?function ${name}\\(`, 'm').exec(source);
  assert(declaration, `world function ${name} exists`);
  const next = /\n  (?:async )?function \w+\(/g; next.lastIndex = declaration.index + declaration[0].length;
  const end = next.exec(source)?.index ?? source.length;
  return source.slice(declaration.index, end);
}
const functions = ['resetMovement', 'recordCorrection', 'acknowledgedPoint', 'noteMovementSent', 'takeMovementPacket', 'rejectMovement', 'setSnapshot', 'canMountBroom', 'updateEscortPresentation'].map(actualFunction).join('\n');
const correctionStart = source.indexOf('const portion = correction.clone().multiplyScalar');
const correctionEnd = source.indexOf('\n        }\n        const travel', correctionStart);
assert(correctionStart >= 0 && correctionEnd > correctionStart, 'actual smoothing frame block exists');
const correctionFrame = source.slice(correctionStart, correctionEnd);
const sampleStart = source.indexOf('selfPose = { x: actor.root.position.x');
const sampleEnd = source.indexOf('onPose?.(selfPose);', sampleStart) + 'onPose?.(selfPose);'.length;
assert(sampleStart >= 0 && sampleEnd > sampleStart, 'actual frame sample recorder exists');
const sampleFrame = source.slice(sampleStart, sampleEnd);
const json = value => JSON.parse(JSON.stringify(value));
const position = (x = 0, y = 0, z = 0) => ({ x, y, z, yaw: 0 });
function harness() {
  const areas = [], context = vm.createContext({ resolveAreaId, getWorldArea, getAreaLinks, areaOffset: (a,b)=>{const from=getWorldArea(a).origin,to=getWorldArea(b).origin;return{x:from.x-to.x,y:from.y-to.y,z:from.z-to.z};}, THREE: { Vector3 }, correctionPlan, moveWithCollisions, moveAmongPeople, sampleEscort, WALK_SPEED, applyEquipmentAppearance, resetEquipmentAppearance, performance: { now: () => 1000 }, Date, console, __areas: areas });
  vm.runInContext(`
const streaming = {setTransit(){}}, scene = {}, keys = new Set(), velocity = {x:0,y:0,set(x,y){this.x=x;this.y=y;}}, moveHistory = new Map(), correctionApplied = new THREE.Vector3(), npcs = new Map(), targets = new Map(), peopleBodies = [];
let movementSteps = [], previousAck = 10, movementInFlight = null, rejectedMove = null;
let journey = null, wasBoatRide = false, crossing=null, crossingCooldown=0, elapsed=0, landing=false; const camera={position:new THREE.Vector3()}; const planJourney=()=>null,getSceneNavigation=()=>({bounds:[-5,5,-5,5],walls:[]}),targetGroup={position:new THREE.Vector3()};
let snapshotGeneration = 0, view = {sceneId:'SC04',serverTime:100,targets:[]}, character = {id:'self',heroId:'harry',sceneId:'SC04',position:{x:0,y:0,z:0,yaw:0},lastAcceptedMoveSequence:10,skills:[]}, room = null, combat = null;
let sceneStamp = 'SC04:', selection = false, selected = 'harry', disposed = false, serverAt = 0, receivedAt = 0, jumpPreparation = 0, dy = 0, grounded = true, flying = false, correction = null, stalledSnapshots = 0, yaw = 0;
let selfPose = {x:0,y:0,z:0,yaw:0,grounded:true,flying:false,sprint:false};
const actor = {root:{position:new THREE.Vector3(),rotation:{y:0},parent:scene},resetPresentation({position,yaw}){this.root.position.set(...position);this.root.rotation.y=yaw;}};
const map = {bounds:[-5,5,-5,5],walls:[],setEscort(){},setContext(){}}, point=p=>new THREE.Vector3(p.x,p.y??0,p.z), identity=c=>c?.id??c?.characterId;
const serverNow=()=>serverAt+Math.max(0,performance.now()-receivedAt), resetAbilities=()=>{};
const clearTarget=()=>{}, resetArea=(id,encounter)=>__areas.push({id,encounter}), updateTargets=()=>{},syncPeers=()=>{},syncCombat=()=>{},onJourney=()=>{},onPose=()=>{};
async function chooseHero(id){selected=id;actor.root.parent=scene;}
${functions}
function sampleFrame(voluntary,sprint=false,boat=false,justDisembarked=false,dt=1/60){${sampleFrame}}
function correctionFrame(dt){if(correction){${correctionFrame}} sampleFrame(new THREE.Vector3());}
globalThis.__world={resetMovement,noteMovementSent,takeMovementPacket,rejectMovement,setSnapshot,
 setLocal(p){actor.root.position.copy(point(p));selfPose={...selfPose,...p};},
 setFlying(value){flying=value;selfPose.flying=value;},
 step(delta,flags={}){const voluntary=new THREE.Vector3(delta.dx,delta.dy,delta.dz);actor.root.position.add(voluntary);if('flying' in flags)flying=flags.flying;sampleFrame(voluntary,Boolean(flags.sprint));},
 applyCorrectionFrame:correctionFrame,
 correction(value){correction=value?point(value):null;},
 seedAck(value){previousAck=value;},
 state(){return {applied:{x:correctionApplied.x,y:correctionApplied.y,z:correctionApplied.z},steps:movementSteps,history:[...moveHistory],previousAck,inFlight:movementInFlight,rejectedMove,correction:correction&&{x:correction.x,y:correction.y,z:correction.z},local:{x:actor.root.position.x,y:actor.root.position.y,z:actor.root.position.z},selfPose,flying,character,view,selection};}
};`, context);
  const world = context.__world;
  return { world, areas, state: () => json(world.state()), snapshot: (ack, p, extra = {}) => world.setSnapshot({ id: 'self', heroId: 'harry', sceneId: extra.view?.sceneId ?? 'SC04', position: p, lastAcceptedMoveSequence: ack, skills: [], ...extra.character }, null, { sceneId: 'SC04', serverTime: 200, targets: [], ...extra.view }) };
}
function nearPoint(actual, expected, label) { for (const axis of ['x', 'y', 'z']) assert(Math.abs((actual?.[axis] ?? 0) - (expected?.[axis] ?? 0)) < 1e-8, `${label}.${axis}: ${actual?.[axis]} != ${expected?.[axis]}`); }

test('unknown and old acknowledgement snapshots preserve unsent steps and the current in-flight request', async () => {
  const h = harness(); h.world.noteMovementSent(12, position(2)); h.world.setLocal(position(2)); h.world.step({ dx: .1, dy: 0, dz: 0 });
  const before = h.state();
  await h.snapshot(11, position(1));
  assert.deepEqual(h.state().steps, before.steps); assert.equal(h.state().inFlight.sequence, 12); assert.equal(h.state().history.length, 1);
  assert.equal(h.state().correction, null); nearPoint(h.state().local, before.local, 'unknown ack local');
  await h.snapshot(9, position(.5));
  assert.deepEqual(h.state().steps, before.steps); assert.equal(h.state().inFlight.sequence, 12); assert.equal(h.state().history.length, 1);
  assert.equal(h.state().correction, null); nearPoint(h.state().local, before.local, 'old ack local');
});

test('fresh acknowledgements correct only the transmitted endpoint while retaining newer local movement', async () => {
  const h = harness(); h.world.setLocal(position(3)); h.world.noteMovementSent(11, position(3));
  h.world.step({ dx: .25, dy: 0, dz: -.1 }); const pending = h.state().steps;
  await h.snapshot(11, position(2));
  nearPoint(h.state().local, { x: 3.25, y: 0, z: -.1 }, 'prediction remains until smoothing');
  nearPoint(h.state().correction, { x: -1, y: 0, z: 0 }, 'only sent position error');
  assert.deepEqual(h.state().steps, pending); assert.equal(h.state().inFlight, null); assert.deepEqual(h.state().history, []);
  const packet = json(h.world.takeMovementPacket()); assert.equal(packet.steps.length, 1); nearPoint(packet.position, { x: 3.25, y: 0, z: -.1 }, 'later input endpoint');
});

test('successive fresh acknowledgements do not add the same pending position error twice', async () => {
  const h = harness(); h.world.setLocal(position(1)); h.world.noteMovementSent(11, position(1));
  await h.snapshot(11, position(.9));
  nearPoint(h.state().correction, { x: -.1, y: 0, z: 0 }, 'first unapplied error');
  // A later input is queued and sent before a RAF applies the first correction.
  h.world.step({ dx: .1, dy: 0, dz: 0 }); const next = h.world.takeMovementPacket(); h.world.noteMovementSent(12, next.position);
  await h.snapshot(12, position(1));
  nearPoint(h.state().local, { x: 1.1, y: 0, z: 0 }, 'latest local pose');
  nearPoint(h.state().correction, { x: -.1, y: 0, z: 0 }, 'the remaining server error is still ten centimetres');
});

test('an authoritative displacement with the same acknowledgement adds to the outstanding correction', async () => {
  const h = harness(); h.world.setLocal(position(1)); h.world.correction(position(-.1));
  await h.snapshot(10, position(.2));
  nearPoint(h.state().local, { x: 1, y: 0, z: 0 }, 'local pending input is retained');
  nearPoint(h.state().correction, { x: .1, y: 0, z: 0 }, 'new server displacement adds to the existing correction');
});

test('a fresh acknowledgement subtracts smoothing already applied since its packet was sent', async () => {
  const h = harness(); h.world.setLocal(position(1)); h.world.noteMovementSent(11, position(1)); await h.snapshot(11, position(.9));
  h.world.step({ dx: .1, dy: 0, dz: 0 }); const packet = h.world.takeMovementPacket(); h.world.noteMovementSent(12, packet.position);
  h.world.applyCorrectionFrame(Math.log(2) / 14);
  nearPoint(h.state().local, { x: 1.05, y: 0, z: 0 }, 'half the first correction is visibly applied');
  nearPoint(h.state().applied, { x: -.05, y: 0, z: 0 }, 'applied correction ledger');
  await h.snapshot(12, position(1));
  nearPoint(h.state().correction, { x: -.05, y: 0, z: 0 }, 'only the unapplied half remains');
});

test('a queued sample endpoint includes smoothing applied after sampling but before transmission', async () => {
  const h = harness(); h.world.setLocal(position(1)); h.world.noteMovementSent(11, position(1)); await h.snapshot(11, position(.9));
  h.world.step({ dx: .1, dy: 0, dz: 0 });
  h.world.applyCorrectionFrame(Math.log(2) / 14);
  const packet = h.world.takeMovementPacket();
  nearPoint(packet.position, { x: 1.05, y: 0, z: 0 }, 'sent endpoint reflects the pose at transmission');
  assert.equal(packet.steps.length, 1); assert.equal(packet.steps[0].dx, .1, 'smoothing is excluded from voluntary input');
  h.world.noteMovementSent(12, packet.position); await h.snapshot(12, position(1));
  nearPoint(h.state().correction, { x: -.05, y: 0, z: 0 }, 'the sampled-to-sent interval cannot be corrected twice');
});

test('a scene change clears in-flight history and old steps before the new scene accepts input', async () => {
  const h = harness(); h.world.noteMovementSent(11, position(2)); h.world.setLocal(position(2)); h.world.step({ dx: .25, dy: .1, dz: 0 }); h.world.correction(position(-.5));
  await h.snapshot(11, position(0, 0, 6), { view: { sceneId: 'SC05' } });
  assert.deepEqual(h.state().steps, []); assert.deepEqual(h.state().history, []); assert.equal(h.state().inFlight, null); assert.equal(h.state().correction, null);
  nearPoint(h.state().local, { x: 0, y: 0, z: 6 }, 'new scene spawn'); assert.equal(h.areas.length, 1); assert.equal(h.areas[0].id, 'SC05');
  const packet = h.world.takeMovementPacket();
  assert(packet === null || Math.hypot(packet.position.x, packet.position.y, packet.position.z - 6) < 1e-8, 'a packet before the next RAF must not acknowledge the old scene pose');
});

test('rejected movement retains steps predicted after the rejected packet was sent', () => {
  const h = harness(); h.world.setLocal(position(3)); h.world.noteMovementSent(11, position(3));
  h.world.step({ dx: .25, dy: 0, dz: -.1 }); const pending = h.state().steps;
  h.world.rejectMovement(11, position(2));
  assert.deepEqual(h.state().steps, pending); assert.equal(h.state().inFlight, null); assert.deepEqual(h.state().history, []);
  nearPoint(h.state().correction, { x: -1, y: 0, z: 0 }, 'rejected endpoint correction');
  const packet = json(h.world.takeMovementPacket()); assert.equal(packet.steps.length, 1); nearPoint(packet.position, { x: 3.25, y: 0, z: -.1 }, 'newer input survives rejection');
});

test('a delayed rejection for an already forgotten request cannot alter the current movement queue', () => {
  const h = harness(); h.world.setLocal(position(2)); h.world.noteMovementSent(12, position(2)); h.world.step({ dx: .1, dy: 0, dz: 0 }); const before = h.state();
  h.world.rejectMovement(11, position(1));
  assert.deepEqual(h.state(), before);
});

test('a bounded packet retains its consumed flight state even when the latest pose has dismounted', () => {
  const h = harness(); h.world.setFlying(true); h.world.step({ dx: .04, dy: .06, dz: 0 }, { flying: true });
  h.world.step({ dx: .04, dy: -.02, dz: 0 }, { flying: false }); h.world.setFlying(false);
  const packet = json(h.world.takeMovementPacket()); assert.equal(packet.steps.length, 2); assert.equal(packet.flying, true, 'flight steps must not be validated as an ordinary jump after dismounting');
  assert.equal(h.world.takeMovementPacket().flying, false, 'an empty later packet uses the current ground state');
});

test('movement packets consume at most 96 samples and keep the remaining path for the next request', () => {
  const h = harness();
  for (let index = 0; index < 100; index++) h.world.step({ dx: .01, dy: 0, dz: 0 }, { sprint: index === 5 });
  const first = json(h.world.takeMovementPacket()); assert.equal(first.steps.length, 96); nearPoint(first.position, { x: .96, y: 0, z: 0 }, 'first chunk endpoint'); assert.equal(first.sprint, true);
  assert.equal(h.state().steps.length, 4);
  const second = json(h.world.takeMovementPacket()); assert.equal(second.steps.length, 4); nearPoint(second.position, { x: 1, y: 0, z: 0 }, 'second chunk endpoint'); assert.equal(second.sprint, false);
});

test('explicit movement reset clears acknowledgements, correction and all pending transport state', () => {
  const h = harness(); h.world.setLocal(position(2)); h.world.noteMovementSent(12, position(2)); h.world.step({ dx: .1, dy: 0, dz: 0 }); h.world.correction(position(.5));
  h.world.resetMovement(); const state = h.state();
  assert.deepEqual(state.steps, []); assert.deepEqual(state.history, []); assert.equal(state.previousAck, -1); assert.equal(state.inFlight, null); assert.equal(state.rejectedMove, null); assert.equal(state.correction, null);
});
