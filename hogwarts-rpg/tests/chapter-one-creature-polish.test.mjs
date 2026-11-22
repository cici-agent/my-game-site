import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCreature } from '../chapter-one/presentation/creatures.mjs';
import { organicLoft, leafBladeGeometry } from '../chapter-one/presentation/creature-detail.mjs';
import { contentData } from '../chapter-one/data/index.mjs';
import { creatureCollision } from '../chapter-one/combat/collision-profiles.mjs';

function resources(root) {
  const nodes = new Set(), geometries = new Set(), materials = new Set(), textures = new Set(), instances = new Set(); let triangles=0,draws=0;
  root.traverse(node=>{nodes.add(node);if(node.isInstancedMesh)instances.add(node);if(node.geometry){geometries.add(node.geometry);triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);draws++;}for(const material of [].concat(node.material??[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
  return {nodes,geometries,materials,textures,instances,triangles,draws};
}
const settle=(actor,state,frames=100)=>{for(let i=0;i<frames;i++)actor.update(1/30,state);};

test('continuous animal anatomy has outward normals in either longitudinal direction and a smooth UV seam',()=>{
  const rings=[{z:-1,y:0,rx:.1,ry:.1},{z:-.5,y:0,rx:.5,ry:.6},{z:.5,y:0,rx:.5,ry:.6},{z:1,y:0,rx:.1,ry:.1}];
  for(const input of [rings,[...rings].reverse()]){
    const geometry=organicLoft(input),position=geometry.attributes.position,normal=geometry.attributes.normal;
    assert(position.count>rings.length*33,'longitudinal smoothing must remove the visibly coarse rings');
    const centerRow=6,first=centerRow*33,last=first+32;
    assert(normal.getX(first)>0,'the right-facing flank must point outward instead of disappearing under backface culling');
    assert(Math.abs(normal.getX(first)-normal.getX(last))<1e-6);assert(Math.abs(normal.getY(first)-normal.getY(last))<1e-6);
    assert([...position.array,...normal.array].every(Number.isFinite));geometry.dispose();
  }
  const leaf=leafBladeGeometry();let upward=0;for(let i=0;i<leaf.attributes.normal.count;i++)if(leaf.attributes.normal.getY(i)>.25)upward++;
  assert(upward/leaf.attributes.normal.count>.8,'both leaf halves face the same lighting hemisphere');leaf.dispose();
});

test('hound has independent jaws, eyelids and articulated legs while its sleeping pose stays above the floor',()=>{
  const actor=createCreature({templateId:'B1-E10'});
  assert.equal(actor.debugSnapshot().heads,3);assert.equal(actor.debugSnapshot().legs,4);
  for(let head=0;head<3;head++){assert(actor.root.getObjectByName(`HoundJaw${head}`));assert(actor.root.getObjectByName(`HoundLid${head}:-1`));assert(actor.root.getObjectByName(`HoundEar${head}:1`));}
  settle(actor,{action:'walk',speed:1.2},20);const knees=actor.debugSnapshot().kneeAngles;assert(Math.max(...knees)-Math.min(...knees)>.05,'diagonal feet alternate instead of four rigid pendulums');
  actor.update(.1,{action:'attack',windupProgress:1});assert(actor.debugSnapshot().jawAngles.every(value=>value<-.15));
  actor.update(.05,{action:'idle',attackPhase:'recover'});assert(actor.debugSnapshot().releaseAge<.1);
  for(const action of ['sleep','idle'])for(let frame=0;frame<120;frame++){actor.update(1/30,{action});assert(new THREE.Box3().setFromObject(actor.root).min.y>-.035,'folded hocks and paws must stay above the floor throughout settling and rising');}
  assert(actor.debugSnapshot().sleep<.001);actor.dispose();
});

test('hatchling has scalloped wing membranes, a live tail chain and four lifting feet without clipping on rest',()=>{
  const actor=createCreature({templateId:'B1-E08'}),before=actor.debugSnapshot();
  assert.equal(before.tailJoints,3);assert.equal(before.legs,4);assert.equal(before.wings,2);
  const wings=['DragonWing-1','DragonWing1'].map(name=>actor.root.getObjectByName(name));
  assert(wings.every(wing=>[...wing.children].some(mesh=>mesh.geometry?.attributes.position.count>100)),'membrane should have a curved contour rather than a three-triangle kite');
  let peakLift=0;for(let i=0;i<30;i++){actor.update(1/30,{action:'walk',speed:.8});peakLift=Math.max(peakLift,...actor.debugSnapshot().kneeAngles);}const moving=actor.debugSnapshot();assert.notDeepEqual(moving.tailAngles,before.tailAngles);assert(peakLift>.1);
  settle(actor,{action:'downed'});assert(new THREE.Box3().setFromObject(actor.root).min.y>-.035,'resting wings fold above the floor');
  settle(actor,{action:'idle'});assert(actor.debugSnapshot().down<.001);actor.dispose();
});

test('spider, bat and troll settle onto the floor and rise smoothly without rebuilding mesh bounds',()=>{
  for(const [templateId,bodyName,maxStep] of [['PAPER-L1','SpiderBody',.08],['BOX-L6','BatBody',.12],['B1-E07','CreatureBody',.18]]){
    const actor=createCreature({templateId}),body=actor.root.getObjectByName(bodyName);
    // Prime test-only bounds, then ensure runtime animation never recomputes a
    // mesh or geometry box. Grounding uses cached joint proxies instead.
    new THREE.Box3().setFromObject(actor.root);
    actor.root.traverse(node=>{if(node.geometry)node.geometry.computeBoundingBox=()=>{throw new Error('per-frame geometry bounds scan');};if(node.isInstancedMesh)node.computeBoundingBox=()=>{throw new Error('per-frame instance bounds scan');};});
    settle(actor,{action:'walk',speed:1.1},20);actor.update(1/60,{action:'hurt'});
    for(const action of ['downed','idle','dead','idle']){
      let previousY=body.position.y;
      for(let frame=0;frame<240;frame++){
        actor.update(1/60,{action});
        assert(Math.abs(body.position.y-previousY)<maxStep,templateId+' body must not snap when rising');previousY=body.position.y;
        assert(new THREE.Box3().setFromObject(actor.root).min.y>-.035,templateId+' must stay above the floor throughout both transitions');
      }
      if(action==='downed'||action==='dead'){const minimum=new THREE.Box3().setFromObject(actor.root).min.y;assert(minimum>=-.005&&minimum<.04,templateId+' must rest on the floor instead of hovering');}
    }
    assert.deepEqual(actor.root.position.toArray(),[0,0,0]);assert.deepEqual(actor.collision,creatureCollision(templateId));actor.dispose();
  }
});

test('interrupted creature windups never turn into attack lunges and repeated hit snapshots do not stack recoil',()=>{
  for(const templateId of ['PAPER-L1','BOX-L6','B1-E10','B1-E08']){
    const actor=createCreature({templateId});actor.update(.1,{action:'attack',windupProgress:.85});actor.update(.05,{action:'hurt',attackPhase:'waiting'});
    const first=actor.debugSnapshot();assert((first.releaseAge??first.diveAge)>1,templateId+' interruption must not synthesize contact');assert(first.recoil>0);
    actor.update(.1,{action:'hurt'});assert(actor.debugSnapshot().recoil<first.recoil,'duplicate hurt state only decays');
    actor.update(.1,{action:'attack',windupProgress:1});actor.update(.05,{action:'downed',attackPhase:'recover'});
    assert((actor.debugSnapshot().releaseAge??actor.debugSnapshot().diveAge)>1,'death during a charge cannot produce a late attack');actor.dispose();
  }
});

test('all chapter-one variants keep authority transforms, collision data and bounded, independently released render resources',()=>{
  const ids=[...new Set([...contentData.enemies,...contentData.bosses].map(entry=>entry.id).concat(['B1-E10','B1-E08','B1-E04','key']))];
  for(const templateId of ids){
    const actor=createCreature({templateId}),peer=createCreature({templateId}),initial=resources(actor.root),peerResources=resources(peer.root);
    actor.root.position.set(7,2,-3);actor.root.rotation.y=.71;const originalPosition=actor.root.position.clone(),originalRotation=actor.root.rotation.clone();
    for(const action of ['idle','walk','attack','hurt','downed','idle'])settle(actor,{action,speed:action==='walk'?1.1:0,windupProgress:.6,attackPhase:action==='idle'?'recover':'windup'},12);
    assert.deepEqual(actor.root.position,originalPosition,templateId);assert.deepEqual(actor.root.rotation.toArray(),originalRotation.toArray(),templateId);assert.deepEqual(actor.collision,creatureCollision(templateId));
    const after=resources(actor.root);assert.deepEqual(after.nodes,initial.nodes);assert.deepEqual(after.geometries,initial.geometries);assert.deepEqual(after.materials,initial.materials);
    actor.root.updateMatrixWorld(true);actor.root.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite),templateId));
    const counts=new Map();for(const resource of [...initial.geometries,...initial.materials,...initial.textures,...initial.instances]){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}
    let peerDisposals=0;for(const resource of [...peerResources.materials,...peerResources.instances])resource.addEventListener('dispose',()=>peerDisposals++);
    actor.dispose();actor.dispose();actor.update(.1,{action:'walk',speed:1});
    assert([...counts.values()].every(count=>count===1),templateId+' each reachable allocation is released once');assert.equal(peerDisposals,0);assert.equal(actor.root.children.length,0);
    peer.update(.1,{action:'walk',speed:1});peer.dispose();
  }
});

test('polished silhouettes stay within explicit geometry and draw budgets',()=>{
  for(const [templateId,maxTriangles,maxDraws]of [['PAPER-L1',35000,18],['BOX-L6',23000,24],['VINE-L14',17000,11],['ROOT-L16',29000,24],['B1-E10',85000,65],['B1-E08',24000,42],['B1-E07',135000,50]]){
    const actor=createCreature({templateId}),stats=resources(actor.root);assert(stats.triangles<=maxTriangles,`${templateId}: ${stats.triangles}`);assert(stats.draws<=maxDraws,`${templateId}: ${stats.draws}`);actor.dispose();
  }
});
