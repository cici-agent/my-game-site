import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldStreaming, getVisibleAreaIds, areaOffset } from '../chapter-one/client/world-streaming.mjs';
import { worldAreas, getWorldArea, getAreaLinks } from '../chapter-one/world-atlas.mjs';

function fixture(){
  const scene=new THREE.Scene(),records=[];
  function build(id,root=new THREE.Group(),context={}){
    const geometry=new THREE.BoxGeometry(1,1,1),texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1),material=new THREE.MeshStandardMaterial({map:texture}),instances=new THREE.InstancedMesh(geometry,material,1),landmark=new THREE.Object3D();
    instances.setMatrixAt(0,new THREE.Matrix4());landmark.position.set(1,2,3);root.add(instances,landmark,new THREE.HemisphereLight());
    const counts=new Map([geometry,material,texture,instances].map(resource=>[resource,0]));for(const resource of counts.keys())resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
    const record={id,root,landmark,counts,context,disposals:0,updates:0,portalDisposals:0};records.push(record);
    const map={root,record,update(){assert.equal(record.disposals,0,'released maps cannot keep updating');record.updates++;},setTrainStopped(value){record.stopped=value;},dispose(){record.disposals++;for(const resource of counts.keys())resource.dispose();}};record.map=map;return map;
  }
  const cache=createWorldStreaming(scene,{createRoom:(sceneId,root,context)=>build(root.name.slice('WorldArea:'.length),root,context),createConnector:area=>build(area.id),openPortals:(root,area)=>({dispose(){records.find(record=>record.root===root).portalDisposals++;}})});
  return{scene,cache,records};
}
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('a preloaded neighbouring map becomes active without rebuilding and rebases every landmark together',()=>{
  const h=fixture();h.cache.activate('SC01',{questId:'M01'});const platform=h.cache.entries.find(entry=>entry.area.id==='LONDON_PLATFORM'),station=h.cache.active;
  assert(platform,'the neighbouring platform is loaded before its door can be crossed');const originalMap=platform.map,originalRoot=platform.root,builds=h.records.length;
  h.scene.updateMatrixWorld(true);const before=platform.map.record.landmark.getWorldPosition(new THREE.Vector3());
  const result=h.cache.activate('LONDON_PLATFORM',{questId:'M02'});assert.equal(result.map,originalMap);assert.equal(result.root,originalRoot);assert.equal(h.records.length,builds);
  h.scene.updateMatrixWorld(true);const after=platform.map.record.landmark.getWorldPosition(new THREE.Vector3()),delta=areaOffset('SC01','LONDON_PLATFORM');
  for(const axis of['x','y','z'])close(after[axis]-before[axis],delta[axis]);assert.equal(station.map.record.disposals,0);
  h.cache.activate('LONDON_PLATFORM',{questId:'M03'});assert.equal(h.cache.active.map,originalMap,'quest advancement in the same area cannot recreate its environment');h.cache.dispose();
});

test('streaming bounds resident areas, isolates realms and exposes only the active lighting rig',()=>{
  const h=fixture();
  for(const area of worldAreas){
    h.cache.activate(area.id,{questId:area.questId});assert(h.cache.entries.length<=22,'the cache must not accumulate every visited region');
    for(const entry of h.cache.entries){assert.equal(entry.area.realm,area.realm);const offset=areaOffset(entry.area.id,area.id);for(const axis of['x','y','z'])close(entry.root.position[axis],offset[axis]);assert(entry.lights.every(light=>light.visible===(entry===h.cache.active)));}
    for(const link of getAreaLinks(area.id).filter(link=>link.kind==='walk'))assert(h.cache.entries.some(entry=>entry.area.id===link.to),'every visible adjacent door is ready before passage');
    assert(getVisibleAreaIds(area.id).every(id=>getWorldArea(id).realm===area.realm));h.cache.update(1/60,1);
  }
  h.cache.dispose();h.cache.dispose();assert.equal(h.cache.entries.length,0);assert.equal(h.scene.children.length,0);
  for(const record of h.records){assert.equal(record.disposals,1,record.id);assert([...record.counts.values()].every(count=>count===1),record.id+' releases geometry, texture, material and instance buffers once');assert(record.portalDisposals<=1);}
});

test('encounter replacements and returning to selection release each map once while clear remains reusable',()=>{
  const h=fixture();h.cache.activate('SC13');const original=h.cache.active.map.record;
  h.cache.activate('SC13',{combat:{id:'battle-a'}});assert.equal(original.disposals,1);const battle=h.cache.active.map;
  h.cache.activate('SC13',{combat:{id:'battle-a'}});assert.equal(h.cache.active.map,battle);assert.equal(h.cache.entries.length,1,'combat does not leave an explorable surrounding cache');
  h.cache.activate('SC13',{combat:{id:'battle-b'}});assert.equal(battle.record.disposals,1);h.cache.clear();h.cache.clear();assert.equal(h.cache.active,null);assert.equal(h.scene.children.length,0);
  h.cache.activate('SC01');assert.equal(h.cache.active.area.id,'SC01');h.cache.dispose();assert.throws(()=>h.cache.activate('SC04'),/WORLD_STREAM_DISPOSED/);
  assert(h.records.every(record=>record.disposals===1));
});
