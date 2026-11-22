import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {SAGA} from '../js/magic/saga.mjs';
import {HEROES} from '../js/magic/adventure-rules.mjs';
import {createWorld} from '../world/world.mjs';
import {buildSagaBoss} from '../world/saga-boss.mjs';
import {createSelectionStage} from '../world/selection-stage.mjs';
import {createOpening} from '../world/opening.mjs';

function canvasContext(t){
  const old=globalThis.document;
  const ctx=new Proxy({},{get:(_,property)=>String(property).includes('Gradient')?()=>({addColorStop(){}}):()=>{}});
  globalThis.document={createElement:()=>({getContext:()=>ctx})};
  t.after(()=>{if(old)globalThis.document=old;else delete globalThis.document;});
  return {clientWidth:1200,clientHeight:760,getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight,right:this.clientWidth,bottom:this.clientHeight};}};
}

test('all seven journeys, their individual boss arenas and the epilogue have clear physical routes and different staging',t=>{
  canvasContext(t);
  const sets=new Set();
  for(const id of [...SAGA.flatMap(book=>[book.stage,'arena-'+book.stage]),'epilogue']){
    const scene=new THREE.Scene(),w=createWorld(id,scene);
    const points=[w.spawn,w.landmarks.npc,w.landmarks.inspect,w.landmarks.target,w.landmarks.exit];
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
      for(let step=0;step<=32;step++){
        const u=step/32,x=points[i][0]*(1-u)+points[j][0]*u,z=points[i][1]*(1-u)+points[j][1]*u;
        assert(x>w.bounds[0]+.32&&x<w.bounds[1]-.32&&z>w.bounds[2]+.32&&z<w.bounds[3]-.32,id);
        assert(!w.walls.some(wall=>Math.abs(x-wall.x)<wall.w*.5+.32&&Math.abs(z-wall.z)<wall.d*.5+.32),id);
      }
    }
    const assembly=[];
    scene.traverse(mesh=>{
      if(mesh.isInstancedMesh)assembly.push([mesh.geometry.type,mesh.material.color.getHexString(),mesh.count]);
    });
    assert(assembly.length>=10,id);
    const fingerprint=JSON.stringify(assembly.sort());
    assert(!sets.has(fingerprint),id+' shares all geometry and colors with another map');sets.add(fingerprint);
    w.dispose();assert.equal(scene.children.length,0);
  }
});

test('seven encounter rigs animate, turn to a target and show phase indicators only during battle',()=>{
  for(const book of SAGA){
    const boss=buildSagaBoss(book.kind),[body,telegraph,shield]=boss.root.children;
    boss.root.position.set(1,0,-2);
    boss.update({started:false,status:'active',phase:'windup'},.5,null);
    assert(!telegraph.visible);
    boss.update({started:true,status:'active',phase:'windup'},1.1,{x:4,z:1});
    assert(telegraph.visible);assert.equal(body.rotation.y,Math.PI/4);assert.equal(telegraph.position.x,3);
    boss.root.updateMatrixWorld(true);const initial=new THREE.Box3().setFromObject(body);
    assert(initial.max.y-initial.min.y>1.6,book.kind);
    boss.update({started:true,status:'active',phase:'vulnerable'},2,{x:0,z:3});
    assert(shield.visible&&!telegraph.visible);
    boss.update({started:true,status:'won',phase:'windup'},3.8,{x:2,z:4});
    assert(!shield.visible&&!telegraph.visible);
    boss.root.updateMatrixWorld(true);
    const final=new THREE.Box3().setFromObject(body);
    assert(final.min.distanceTo(initial.min)>.01,book.kind);
    assert(Number.isFinite(final.max.y),book.kind);
  }
});

test('picking a student in 3D follows every hero into the foreground on desktop or phone',t=>{
  const canvas=canvasContext(t);
  let scene,camera;
  const renderer={render(stage,view){scene=stage;camera=view;scene.updateMatrixWorld(true);}};
  const stage=createSelectionStage({renderer,canvas});
  for(const [w,h] of [[1200,760],[390,844]]){
    canvas.clientWidth=w;canvas.clientHeight=h;
    for(const id of ['harry','ron','hermione','neville','george']){
      stage.select(id,true);stage.render(.017);
      const actor=scene.getObjectByName(HEROES[id].name);
      const onScreen=actor.localToWorld(new THREE.Vector3(0,1.04,0)).project(camera);
      assert(Math.abs(onScreen.x)<1&&Math.abs(onScreen.y)<1,id);
      assert.equal(stage.pick((onScreen.x+1)*w/2,(1-onScreen.y)*h/2),id);
    }
  }
  assert.equal(stage.pick(-1,30),null);
  stage.dispose();assert.equal(scene.children.length,0);
});

test('the real-time opening shows letter, handover, trolley and departure, completes once and can be skipped at any shot',t=>{
  const canvas=canvasContext(t);
  const captions=[],frames=[];let ended=0;
  const renderer={render(scene,camera){scene.updateMatrixWorld(true);frames.push([scene,camera.position.clone()]);}};
  const opening=createOpening({canvas,renderer,onCaption:caption=>captions.push(caption),onEnd:()=>ended++});
  for(const dt of [0,1.9,3.3,4,4,4,.1])opening.render(dt);
  assert.equal(captions.length,4);assert.equal(ended,1);assert.equal(frames.length,6);
  assert.equal(new Set(frames.map(v=>v[0])).size,3);
  assert(frames[2][0].getObjectByName('海格'));assert(frames[3][0].getObjectByName('wheel cap'));
  assert(frames[4][1].distanceTo(frames[3][1])>2);
  opening.dispose();opening.dispose();
  assert(frames.every(([scene])=>!scene.children.length));
  const skipped=createOpening({renderer,canvas,onEnd:()=>ended++});
  skipped.render(.3);skipped.dispose();skipped.render(20);assert.equal(ended,1);
});

test('the celebration is an active part of the hall and leaves the aisle and every interaction clear',t=>{
  canvasContext(t);
  const scene=new THREE.Scene(),world=createWorld('epilogue',scene);
  const guests=['海格','弗立维教授'].map(name=>scene.getObjectByName(name));
  const crest=scene.getObjectByName('黎明勋章');
  assert(crest?.isMesh&&guests.every(Boolean));
  const paths=guests.map(()=>new Set()),lifts=new Set();
  for(let i=0;i<=130;i++){
    world.update(.1,i*.1);lifts.add(crest.position.y.toFixed(2));
    for(const [n,guest] of guests.entries()){
      const {x,z}=guest.position;paths[n].add(z.toFixed(2));
      assert(Math.abs(x)>3.8);
      assert(!world.walls.some(w=>Math.abs(w.x-x)<w.w*.5+.38&&Math.abs(w.z-z)<w.d*.5+.38));
      for(const [px,pz] of Object.values(world.landmarks))assert(Math.hypot(x-px,z-pz)>1.25);
    }
  }
  assert(paths.every(trace=>trace.size>12));assert(lifts.size>12);
  assert(new THREE.Box3().setFromObject(crest).min.y>1.80);
  world.dispose();assert.equal(scene.children.length,0);
});
