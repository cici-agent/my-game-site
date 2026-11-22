import assert from 'node:assert/strict';
import test from 'node:test';
import {createAvatar} from '../world/player.mjs';
import {FITTED_WANDS, FITTED_TOPS} from '../world/fitted-catalog.mjs';
import {ITEMS, SLOT_LABELS, normalizeEquipment, equipmentStorageKey, saveEquipment, loadEquipment} from '../world/wardrobe.mjs';

test('old, missing and cross-slot IDs fall back independently for each character',()=>{
  const old={top:'jumper',pants:'pointed',hat:'unavailable',unrecognized:'future-field'};
  const restored=normalizeEquipment('hermione',old);
  assert.deepEqual(restored,{...normalizeEquipment('hermione'),top:'jumper'});
  assert.equal(normalizeEquipment('harry').weapon,'holly');
  assert.equal(normalizeEquipment('ron').weapon,'willow');
});

test('changing a slot keeps player identity, joints and unrelated equipment meshes',()=>{
  const model=createAvatar({variant:'ron',name:'哈利',isPlayer:true});
  try {
    const head=model.root.getObjectByName('Head');
    const face=head.children[0];
    const sleeve=model.root.getObjectByName('top/jumper');
    assert.ok(sleeve);
    for (const slot of Object.keys(SLOT_LABELS)) for (const {id} of ITEMS[slot]) {
      const equipped=model.setEquipment({[slot]:id});
      assert.equal(equipped[slot],id);
      assert.equal(model.root.getObjectByName('Head'),head);
      assert.equal(head.children[0],face);
      const parts=[];
      model.root.traverse(node=>{if(node.userData.wardrobeSlot===slot)parts.push(node);});
      assert.equal(parts.length>0,id!=='none');
      assert(parts.every(mesh=>mesh.geometry.attributes.position.count>0));
    }
    const current=model.root.getObjectByName('top/'+ITEMS.top.at(-1).id);
    assert.ok(current);
    const hat=model.root.getObjectByName('hat/bobble');
    let disposed=0;
    hat.geometry.addEventListener('dispose',()=>disposed++);
    model.setEquipment({hat:'none'});
    assert.equal(disposed,1);
    assert.equal(model.root.getObjectByName(current.name),current);
  }finally{model.dispose();}
});

test('browser saves are scoped by character and damaged saves recover the matching defaults',t=>{
  const values=new Map();
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  t.after(()=>{
    if(previous) Object.defineProperty(globalThis,'localStorage',previous);
    else delete globalThis.localStorage;
  });
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null
  }});
  assert(saveEquipment('ron',{hat:'beret'}));
  assert.equal(loadEquipment('ron').hat,'beret');
  assert.equal(loadEquipment('harry').hat,'none');
  values.set(equipmentStorageKey('ron'),'broken');
  assert.deepEqual(loadEquipment('ron'),normalizeEquipment('ron'));
});

test('each student can mix robe and wand tiers while the tip follows the casting hand',()=>{
  for (const hero of ['harry','ron','hermione','neville','george']) {
    const wands=FITTED_WANDS.filter(item=>item.hero===hero);
    const tops=FITTED_TOPS.filter(item=>item.hero===hero);
    assert.deepEqual(wands.map(item=>item.tier),[1,2,3,4,5,6,7,8,9,10]);
    assert.deepEqual(tops.map(item=>item.tier),wands.map(item=>item.tier));
    const equipment=normalizeEquipment(hero,{weapon:wands[9].id,top:tops[4].id});
    const avatar=createAvatar({variant:hero,equipment});
    try {
      const wand=avatar.root.getObjectByName('weapon/'+wands[9].id);
      assert.equal(wand.parent.name,'ArmR');
      const start=avatar.getCastOrigin();
      avatar.animate(.08,{casting:true,time:1});
      assert.ok(avatar.getCastOrigin().distanceTo(start)>.01);
      assert.equal(avatar.setEquipment({top:tops[2].id}).weapon,wands[9].id);
      assert.equal(avatar.root.getObjectByName(wand.name),wand);
      assert.equal(avatar.setEquipment({weapon:'none'}).top,tops[2].id);
      assert.equal(avatar.root.getObjectByName(wand.name),undefined);
    } finally { avatar.dispose(); }
  }
});
