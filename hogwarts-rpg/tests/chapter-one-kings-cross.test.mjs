import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getWorldArea, getAreaLinks, areaLinks } from '../chapter-one/world-atlas.mjs';
import { createSceneEnvironment } from '../chapter-one/client/scene-environment.mjs';
import { createAtlasEnvironment, openRegionPortals } from '../chapter-one/client/journey-environment.mjs';
import { cameraCollisionFraction, moveWithCollisions, canOccupy } from '../chapter-one/client/scene-geometry.mjs';

const written=[];
const context=new Proxy({fillText(text){written.push(String(text));},measureText:text=>({width:String(text).length*12}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(object,key)=>key in object?object[key]:()=>{}});
globalThis.document={createElement:()=>({width:512,height:512,getContext:()=>context})};
const visible=object=>{for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;};
function build(id){
  const area=getWorldArea(id),root=new THREE.Group();
  const env=id==='SC01'?createSceneEnvironment(id,root):createAtlasEnvironment(area,{portals:getAreaLinks(id)});
  if(id!=='SC01')root.add(env.root);
  const opened=id==='SC01'?openRegionPortals(root,area,{portals:getAreaLinks(id)}):null;
  root.updateMatrixWorld(true);return{area,root,env,dispose(){opened?.dispose();env.dispose();}};
}
function opaqueRay(root,from,direction,distance){
  root.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(...from),new THREE.Vector3(...direction),0,distance).intersectObject(root,true).filter(hit=>visible(hit.object)&&![].concat(hit.object.material??[]).some(material=>material.transparent));
}

test('ordinary King’s Cross retains only platform 9/10 wayfinding and two visible working trains',()=>{
  written.length=0;const built=build('SC01');
  assert(written.includes('9')&&written.includes('10'));assert(written.some(text=>text.includes('CROSS')));
  assert(!written.some(text=>/9¾|9\s*3\/4|HOGWARTS|九又/.test(text)),'the ordinary concourse never advertises the concealed platform');
  const trains=[];built.root.traverse(object=>{if(object.name.startsWith('OrdinaryPassengerTrain:'))trains.push(object);});
  assert.equal(trains.length,2);
  for(const [side,number]of[[-1,9],[1,10]]){
    const train=trains.find(train=>train.name.endsWith(String(number)));assert(train);
    train.position.z=.5;built.root.updateMatrixWorld(true);
    const view=opaqueRay(built.root,[0,1.9,.5],[side,0,0],15);
    assert(view.some(hit=>{for(let node=hit.object;node;node=node.parent)if(node===train)return true;return false;}),'the normal train is visible through the open railway side bays');
    const track=opaqueRay(built.root,[side*12.2,.2,10],[0,-1,0],2);assert(track.length,'tracks have grounded ballast and rails');
    const box=new THREE.Box3().setFromObject(train);assert(side<0?box.max.x<-9.3:box.min.x>9.3,'trains never enter the authoritative walking space');
  }
  built.dispose();
});

test('the single enchanted seam stays opaque brick from both sides at every standing sightline',()=>{
  const links=areaLinks.filter(link=>link.magicWall);assert.equal(links.length,2);assert(links.every(link=>['SC01','LONDON_PLATFORM'].includes(link.from)));
  for(const id of ['SC01','LONDON_PLATFORM']){
    const built=build(id),link=getAreaLinks(id).find(link=>link.magicWall),normal=id==='SC01'?-1:1;
    for(const x of [-1.1,-.6,0,.6,1.1])for(const y of [.6,1.2,1.8,2.5,3.2]){
      const hits=opaqueRay(built.root,[x,y,link.anchor.z-normal*2.5],[0,0,normal],5);
      const barrier=hits.find(hit=>hit.object.userData.magicWall);assert(barrier,`${id}: no transparent arch at ${x},${y}`);
      assert(Math.abs(barrier.point.z-link.anchor.z)<.25,'the visual boundary is the existing world seam');
      assert.equal(hits[0]?.object,barrier.object,'the old untextured door-shaped box cannot remain in front of the brick wall');
    }
    const nav=built.area.navigation;
    for(const x of[-1.05,0,1.05]){
      const start={x,y:0,z:link.anchor.z-normal*.6},end={x,y:0,z:link.anchor.z+normal*.6};
      assert(canOccupy(start,nav.walls)&&canOccupy(end,nav.walls));
      const actual=moveWithCollisions(start,end,nav.bounds,nav.walls);assert(Math.hypot(actual.x-end.x,actual.z-end.z)<1e-8,'magic masonry is not an impassable player collider');
    }
    for(const x of[-3,3]){
      const start={x,y:0,z:link.anchor.z-normal*.9},end={x,y:0,z:link.anchor.z+normal*.7};
      const actual=moveWithCollisions(start,end,nav.bounds,nav.walls);assert(Math.abs(actual.z-end.z)>.6,'only the authored magic opening is traversable; the rest of the wall stays solid');
    }
    built.dispose();
  }
});

test('hidden 9¾ identification exists only behind its solid return wall',()=>{
  written.length=0;const built=build('LONDON_PLATFORM');assert(written.some(text=>text.includes('9¾')&&text.includes('HOGWARTS')));
  const link=getAreaLinks('LONDON_PLATFORM').find(link=>link.magicWall);
  const ray=opaqueRay(built.root,[0,2,6],[0,0,1],10);assert(ray.some(hit=>hit.object.userData.magicWall&&hit.point.z<link.anchor.z),'looking back cannot see the ordinary station through an open arch');
  built.dispose();
});

test('ordinary trains move smoothly, brake at the terminus and never teleport through the divider',()=>{
  const built=build('SC01'),trains=[];built.root.traverse(object=>{if(object.name.startsWith('OrdinaryPassengerTrain:'))trains.push(object);});
  const initial=trains.map(train=>train.position.clone());let previous=initial.map(p=>p.clone()),maximumStep=0;
  for(let frame=1;frame<=320*10;frame++){
    built.env.update(.1,frame*.1);
    trains.forEach((train,index)=>{
      const step=train.position.distanceTo(previous[index]);maximumStep=Math.max(maximumStep,step);assert(step<.075,'reversals happen continuously rather than a visible loop reset');
      assert(train.position.z>=.5-1e-8&&train.position.z<=74.5+1e-8);assert(train.position.z-8.35>-10,'the train never clips through the secret-platform divider');previous[index].copy(train.position);
    });
  }
  assert(maximumStep>.06);assert(trains.some((train,index)=>train.position.distanceTo(initial[index])>.1));built.dispose();
});

test('magic-wall camera protection uses matching world space without closing ordinary door apertures',()=>{
  for(const id of['SC01','LONDON_PLATFORM']){
    const area=getWorldArea(id),link=getAreaLinks(id).find(link=>link.magicWall),n=link.normal.z,wall=area.navigation.cameraWalls.find(wall=>wall.magicWall);
    assert.equal(area.origin.z+wall.z,-11.4);assert.equal(wall.d,.44);
    const focus={x:0,y:1.6,z:link.anchor.z-n*.7},far={...focus,z:link.anchor.z+n*4};
    const fraction=cameraCollisionFraction(focus,far,area.navigation.cameraWalls);assert(fraction<.2);
    const cameraZ=focus.z+(far.z-focus.z)*fraction;assert((cameraZ-link.anchor.z)*n<0,'camera remains on the same side of the masonry as its player');
  }
  for(const id of['SC02_LONDON','SC02_HOGSMEADE']){
    const area=getWorldArea(id),door=getAreaLinks(id).find(link=>link.kind==='walk'),side=Math.sign(door.anchor.x);
    assert.equal(cameraCollisionFraction({x:side,y:1.7,z:15.4},{x:side*5,y:1.7,z:15.4},area.navigation.cameraWalls),1,'normal train doors retain their clear camera opening');
  }
});
