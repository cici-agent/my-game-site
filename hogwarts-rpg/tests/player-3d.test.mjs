import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createAvatar,createController} from '../world/player.mjs';

class Element extends EventTarget {
  constructor() {
    super();
    this.style={setProperty(){}};
  }
  setPointerCapture() {}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
}
function send(target,type,data) {
  const event=new Event(type,{cancelable:true});
  for(const [key,value] of Object.entries(data)) Object.defineProperty(event,key,{value});
  target.dispatchEvent(event);
}
function fixture(t, walls=[]) {
  globalThis.window=new Element();
  globalThis.document=new Element();
  document.querySelector=()=>null;
  const element=new Element(),joystick=new Element(),jumpButton=new Element(),actionButton=new Element(),actions=[];
  const avatar=createAvatar({name:'哈利',variant:'harry',isPlayer:true});
  const camera=new THREE.PerspectiveCamera(58,1,.1,100);
  const ctrl=createController({element,joystick,jumpButton,actionButton,avatar,camera,onAction:kind=>actions.push(kind)});
  ctrl.setWorld({spawn:[0,0],bounds:[-5,5,-10,5],walls,landmarks:{npc:[0,-3]}});
  const tick=n=>{for(let i=0;i<n;i++)ctrl.update(1/60);};
  const key=(type,code)=>send(window,type,{code,repeat:false});
  t.after(()=>{ctrl.dispose();avatar.dispose();delete globalThis.window;delete globalThis.document;});
  return {ctrl,avatar,camera,element,joystick,jumpButton,actionButton,actions,tick,key};
}

test('3D walking, collision, running, jump over luggage, landing and action keys', t=>{
  const box={x:0,z:-2,w:2,d:.62,h:.52};
  const {ctrl,actions,tick,key}=fixture(t,[box]);
  key('keydown','KeyW');tick(60);
  assert(ctrl.getPose().z > -1.4 && ctrl.getPose().z < -1.28);
  key('keydown','Space');tick(17);
  assert(ctrl.getPose().y>1);
  key('keyup','KeyW');tick(60);
  assert(Math.abs(ctrl.getPose().y-.52)<.001,'can land on top of luggage');
  key('keydown','KeyW');key('keydown','ShiftLeft');tick(65);
  assert(ctrl.getPose().z<-6);assert.equal(ctrl.getPose().y,0);
  key('keydown','KeyE');key('keydown','KeyF');
  assert.deepEqual(actions,['interact','cast']);
  ctrl.cast();assert.equal(ctrl.getPose().casting,true);tick(38);
  assert.equal(ctrl.getPose().casting,false);
});

test('touch controls accept independent pointers and pause clears movement', t=>{
  const {ctrl,tick,joystick,jumpButton,actionButton,actions}=fixture(t);
  send(joystick,'pointerdown',{pointerId:1,clientX:50,clientY:10,button:0});
  tick(12);const z=ctrl.getPose().z;assert(z<-.35);
  send(jumpButton,'pointerdown',{pointerId:2,button:0});tick(8);assert(ctrl.getPose().y>.55);
  send(actionButton,'pointerdown',{pointerId:3,button:0});assert.deepEqual(actions,['context']);
  send(joystick,'pointerup',{pointerId:1});
  ctrl.setEnabled(false);const before=ctrl.getPose().z;tick(80);
  assert.equal(ctrl.getPose().z,before);assert.equal(ctrl.getPose().y,0);
});

test('camera stays in front of a wall directly behind the player', t=>{
  const {ctrl,camera,tick,key}=fixture(t,[{x:0,z:1.2,w:8,d:.3}]);
  assert(camera.position.z>0 && camera.position.z<1.05);
  key('keydown','KeyS');tick(100);
  assert(ctrl.getPose().z<.74);
  assert(camera.position.z<1.05);
});

test('boat ride follows its transform outside player bounds, dismount restores controls', t=>{
  const {ctrl,camera,tick,key,actions}=fixture(t);
  key('keydown','KeyW');tick(6);
  const pier={x:12,y:1.24,z:17,yaw:.7};
  ctrl.ride(pier,1/60);
  key('keydown','KeyE');key('keydown','Space');tick(20);
  assert.deepEqual(ctrl.getPose(),{...pier,moving:false,casting:false});
  assert.deepEqual(actions,[]);assert(Number.isFinite(camera.position.z));
  ctrl.setWorld({spawn:[0,0],bounds:[-5,5,-5,5],walls:[],facing:0},{x:0,y:0,z:2});
  tick(6);assert.equal(ctrl.getPose().z,2);
  key('keydown','KeyW');tick(12);assert(ctrl.getPose().z<1.7);
});

test('combat dodge moves the body, respects a wall and can follow directional input',t=>{
  const {ctrl,tick,key}=fixture(t,[{x:1.42,z:0,w:.26,d:4,h:3}]);
  assert(ctrl.dodge());
  assert.equal(ctrl.dodge(),false);
  tick(48);
  const first=ctrl.getPose();
  assert(first.x>.8&&first.x<1.18);
  key('keydown','KeyW');tick(3);assert(ctrl.dodge());tick(15);key('keyup','KeyW');
  assert(ctrl.getPose().z<first.z-1.75);
  ctrl.setEnabled(false);assert.equal(ctrl.dodge(),false);
});

test('a short mouse click casts while dragging the camera and touch taps preserve their controls',t=>{
  const {element,actions}=fixture(t);
  const point={pointerType:'mouse',pointerId:1,button:0,clientX:70,clientY:80};
  send(element,'pointerdown',point);send(element,'pointerup',point);
  send(element,'pointerdown',point);send(element,'pointermove',{...point,clientX:89});
  send(element,'pointerup',point);
  send(element,'pointerdown',{...point,pointerType:'touch'});send(element,'pointerup',{...point,pointerType:'touch'});
  assert.deepEqual(actions,['primary']);
});
