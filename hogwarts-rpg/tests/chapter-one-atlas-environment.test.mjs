import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { worldAreas, getAreaLinks, areaFloor } from '../chapter-one/world-atlas.mjs';
import { createAtlasEnvironment, openRegionPortals } from '../chapter-one/client/journey-environment.mjs';
import { createSceneEnvironment } from '../chapter-one/client/scene-environment.mjs';
import { getVisibleAreaIds } from '../chapter-one/client/world-streaming.mjs';
import { createBoatMotion } from '../chapter-one/client/scene-landscape.mjs';

const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }) };
const legacy = area => /^SC\d\d(?:[-_]|$)/.test(area.id);
const visible = object => { for(let node=object;node;node=node.parent)if(!node.visible)return false;return true; };
function build(area) {
  const root=new THREE.Group(), portals=getAreaLinks(area.id);
  const env=legacy(area)?createSceneEnvironment(area.sceneId,root,{questId:area.questId}):createAtlasEnvironment(area,{portals});
  if(!legacy(area))root.add(env.root);
  const opened=legacy(area)?openRegionPortals(root,area,{portals}):null;
  root.updateMatrixWorld(true);
  return {root,env,opened,dispose(){opened?.dispose();env.dispose();}};
}

test('every continuous doorway has a rendered floor on both sides of its threshold',()=>{
  const failures=[];
  for(const area of worldAreas) {
    const built=build(area);
    for(const link of getAreaLinks(area.id).filter(link=>link.kind==='walk')) {
      const p=link.anchor;
      const ray=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+1.2,p.z),new THREE.Vector3(0,-1,0),0,1.6);
      const hit=ray.intersectObject(built.root,true).find(hit=>visible(hit.object)&&!hit.object.userData.dynamic&&hit.point.y<=p.y+.3);
      if(!hit||Math.abs(hit.point.y-p.y)>.3)failures.push(`${link.id}: floor=${hit?.point.y}`);
    }
    built.dispose();
  }
  assert.deepEqual(failures,[]);
});

test('walk doorway apertures remain clear at body height after original walls are opened',()=>{
  const failures=[];
  for(const area of worldAreas.filter(area=>!['grounds','stairs','lakeshore-path'].includes(area.kind))) {
    const built=build(area), b=area.navigation.bounds;
    for(const link of getAreaLinks(area.id).filter(link=>link.kind==='walk')) {
      const p=link.anchor, axis=Math.min(Math.abs(p.x-b[0]),Math.abs(p.x-b[1]))<Math.min(Math.abs(p.z-b[2]),Math.abs(p.z-b[3]))?'x':'z';
      const from=new THREE.Vector3(p.x,p.y+1.2,p.z),direction=new THREE.Vector3(axis==='x'?1:0,0,axis==='z'?1:0);from.addScaledVector(direction,-1.15);
      const ray=new THREE.Raycaster(from,direction,0,2.3);
      const hit=ray.intersectObject(built.root,true).find(hit=>visible(hit.object)&&![].concat(hit.object.material??[]).some(material=>material.transparent)&&!hit.object.userData.dynamic);
      if(hit)failures.push(`${link.id}: ${hit.object.name||hit.object.geometry.type} at ${hit.point.toArray().map(v=>v.toFixed(2))}`);
    }
    built.dispose();
  }
  assert.deepEqual(failures,[]);
});

test('persistent rooms own and release all added resources exactly once',()=>{
  for(const area of worldAreas) {
    const built=build(area), resources=new Map();
    const own=resource=>{if(resource&&!resources.has(resource)){resources.set(resource,0);resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));}};
    let draws=0,triangles=0;
    built.root.traverse(o=>{
      if(o.isInstancedMesh)own(o);
      own(o.geometry);
      for(const material of [].concat(o.material??[])){own(material);for(const value of Object.values(material))if(value?.isTexture)own(value);}
      if(o.isMesh&&visible(o)){draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}
    });
    if(!legacy(area)){assert(draws<35,`${area.id}: ${draws} draw calls`);assert(triangles<25000,`${area.id}: ${triangles} triangles`);}
    built.dispose();built.dispose();
    for(const [resource,count]of resources)assert.equal(count,1,`${area.id}: ${resource.type??resource.constructor.name} disposed once`);
  }
});

test('stairs tread geometry follows the shared two-flight floor including rooftop landing',()=>{
  for(const area of worldAreas.filter(area=>area.kind==='stairs')) {
    const built=build(area);
    for(const x of [-3.5,3.5])for(const z of [-11,-8,-3,2,8,10.5]) {
      const y=areaFloor(area.id,{x,z});
      const ray=new THREE.Raycaster(new THREE.Vector3(x,y+.4,z),new THREE.Vector3(0,-1,0),0,.6);
      const hit=ray.intersectObject(built.root,true).find(hit=>visible(hit.object));
      assert(hit&&Math.abs(hit.point.y-y)<.22,`${area.id} ${x},${z}: authoritative floor ${y}, rendered ${hit?.point.y}`);
    }
    if(area.id==='STAIR_3T') {
      const ray=new THREE.Raycaster(new THREE.Vector3(0,11,12),new THREE.Vector3(0,-1,0),0,1.5);
      assert(Math.abs(ray.intersectObject(built.root,true)[0].point.y-10)<.05,'central rooftop door rests on the upper landing');
    }
    built.dispose();
  }
});

test('lake stays water, and the real shore path runs outside its basin',()=>{
  const lake=worldAreas.find(area=>area.id==='SC03'), built=build(lake);let water;
  built.root.traverse(o=>{if(o.isReflector)water=o;});assert(water);
  const extent=new THREE.Box3().setFromObject(water);
  assert(Math.abs(extent.min.x+52)<.01&&Math.abs(extent.max.x-52)<.01);
  assert(Math.abs(extent.min.z+14)<.01&&Math.abs(extent.max.z-72)<.01);
  built.dispose();
  const shore=build(worldAreas.find(area=>area.id==='LAKESHORE_PATH'));
  for(const [x,z]of [[58,142],[58,100],[58,40],[58,20],[22,20]]) {
    const ray=new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0),0,1.5);
    assert(ray.intersectObject(shore.root,true).some(hit=>Math.abs(hit.point.y)<.02),`shore ${x},${z} has solid ground`);
  }
  const waterRay=new THREE.Raycaster(new THREE.Vector3(30,2,40),new THREE.Vector3(0,-1,0),0,3);
  assert.equal(waterRay.intersectObject(shore.root,true).length,0,'no shore flooring crosses the lake');
  shore.dispose();
});

test('outdoor streaming shows the real castle skyline without loading every room interior',()=>{
  const campus=getVisibleAreaIds('GROUNDS');
  for(const id of ['SC04','SC11','ENTRANCE','CORRIDOR_3','STAIR_3T','GRYFFINDOR','MIRROR_ROOM','SC03'])assert(campus.includes(id),`actual landmark ${id} is visible from campus`);
  assert(!campus.includes('SC14-M34'),'underground finale is not an outdoor skyline');
  assert(!campus.includes('SC05')&&!campus.includes('SC07'),'closed lesson interiors stay streamed at their own doors');
  assert(getVisibleAreaIds('SC01').includes('SC02_LONDON'),'the actual carriage is visible before crossing from the London station');
  for(const area of worldAreas) {
    const visible=getVisibleAreaIds(area.id);assert(visible.length<=27,`${area.id}: bounded persistent visible set`);
    assert.equal(visible.length,new Set(visible).size);
    for(const id of visible)assert.equal(worldAreas.find(a=>a.id===id).realm,area.realm,'no train journey renders both realms together');
    for(const link of getAreaLinks(area.id).filter(link=>link.kind==='walk'))assert(visible.includes(link.to),`${area.id}: every immediately accessible doorway remains prepared`);
  }
});

test('long lake crossing has fifty metres of open water and a genuine walkable south shore',()=>{
  const built=build(worldAreas.find(area=>area.id==='SC03'));
  const down=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0),0,2).intersectObject(built.root,true).filter(hit=>visible(hit.object)&&!hit.object.userData.dynamic);
  for(const z of [0,10,20,30,40])assert.equal(down(0,z).length,0,`crossing z${z} is open water, not a long bridge`);
  for(const z of [52,60,68,72])for(const x of [-3,0,3])assert(down(x,z).some(hit=>Math.abs(hit.point.y)<.08),`south shore ${x},${z} has solid terrain`);
  const motion=createBoatMotion();assert.equal(motion.getPose().boatPosition.z,46);
  let previous=motion.getPose().boatPosition;
  for(let frame=1;frame<=70*30;frame++) {
    const progress=frame/(70*30);
    motion.setEscort({kind:'boat',progress,position:{x:1.5-3*progress,z:46-50*progress}});motion.update(1/30);
    const next=motion.getPose().boatPosition;assert(Math.hypot(next.x-previous.x,next.z-previous.z)<.04,'real distance progresses continuously through each render frame');previous=next;
  }
  for(let frame=0;frame<90;frame++)motion.update(1/30);
  const final=motion.getPose();assert(Math.abs(final.boatPosition.z+4)<.001);assert.equal(final.phase,'docked');
  assert(Math.hypot(final.boatPosition.x-1.5,final.boatPosition.z-46)>50,'duration corresponds to a full lake crossing');
  built.dispose();
});

test('station platform has grounded enclosure, roof trusses and a physically suspended sign',()=>{
  const built=build(worldAreas.find(area=>area.id==='LONDON_PLATFORM'));
  const hit=(p,d,distance)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,distance).intersectObject(built.root,true).find(hit=>visible(hit.object));
  assert(hit([0,2,-10],[-1,0,0],13),'west brick station wall encloses the yard');
  assert(hit([0,2,-25],[0,0,-1],15),'north brick facade ends the platform');
  assert(hit([0,3,-10],[0,1,0],7),'continuous roof is visible overhead');
  assert(hit([15,0,-40],[0,-1,0],2),'rails and solid ballast continue below the locomotive');
  built.dispose();
});

test('castle storeys have continuous masonry while the roads below upper wings remain open',()=>{
  for(const id of ['CORRIDOR_G','CORRIDOR_1','CORRIDOR_2','CORRIDOR_3']) {
    const built=build(worldAreas.find(area=>area.id===id));
    for(const y of[5.4,7.4,9.4]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(12,y,18),new THREE.Vector3(0,0,-1),0,20);
      assert(ray.intersectObject(built.root,true).some(hit=>visible(hit.object)),`${id} masonry closes the old floor-to-floor air gap at ${y}`);
    }
    built.dispose();
  }
  for(const id of['GRYFFINDOR','MIRROR_ROOM']) {
    const area=worldAreas.find(area=>area.id===id),built=build(area);
    const road=new THREE.Raycaster(new THREE.Vector3(-12,1.7-area.origin.y,0),new THREE.Vector3(1,0,0),0,24);
    assert.equal(road.intersectObject(built.root,true).filter(hit=>visible(hit.object)).length,0,`${id} cannot add a wall across the existing campus road`);
    const facade=new THREE.Raycaster(new THREE.Vector3(0,8-area.origin.y,25),new THREE.Vector3(0,0,-1),0,20);
    assert(facade.intersectObject(built.root,true).some(hit=>visible(hit.object)),`${id} has a supported exterior below the upper room`);
    built.dispose();
  }
  const tower=build(worldAreas.find(area=>area.id==='SC11'));
  const surplus=new THREE.Raycaster(new THREE.Vector3(16,1,0),new THREE.Vector3(0,-1,0),0,2);
  assert.equal(surplus.intersectObject(tower.root,true).filter(hit=>visible(hit.object)).length,0,'the legacy 36m terrain slab no longer floats around the tower');
  tower.dispose();
});
