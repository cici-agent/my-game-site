import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyWarning, createEnemyStrike } from '../chapter-one/client/enemy-fx.mjs';

const attack={id:'spider-1',origin:{x:1,y:0,z:2},aim:{x:1,y:0,z:-4},direction:{x:0,z:-1},shape:'line',radius:.24,range:6,startAt:0,releaseAt:1200};
test('enemy warning remains on the floor and shows the actual attack area without red wire rays',()=>{
 const root=createEnemyWarning(attack,'PAPER-L1');let lines=0;root.traverse(n=>{if(n.isLine)lines++;});assert.equal(lines,0);
 const area=root.children[0];assert.equal(area.position.x,1);assert.equal(area.position.z,-1);
 root.userData.update(0);root.userData.update(1200);root.updateMatrixWorld(true);
 root.traverse(n=>assert.ok(n.matrixWorld.elements.every(Number.isFinite)));
 root.userData.dispose();assert.equal(root.children.length,0);
});
test('visible silk attack advances from the creature toward the authored aim and only shows hit particles for confirmed hits',()=>{
 const a=createEnemyStrike({attack,templateId:'PAPER-L1',hit:false}),b=createEnemyStrike({attack,templateId:'PAPER-L1',hit:true});
 a.update(.1);b.update(.1);const moving=a.root.children[0];assert.ok(moving.position.z<2&&moving.position.z>-4);assert.ok(moving.position.y>.4);
 let done=false;for(let i=0;i<3;i++){done=a.update(.1);b.update(.1);}
 assert.equal(a.root.children.at(-1).visible,false);assert.equal(b.root.children.at(-1).visible,true);
 for(let i=0;i<10;i++)done=a.update(.1);assert.equal(done,true);a.dispose();assert.equal(a.root.children.length,0);assert.ok(b.root.children.length>0);b.dispose();
});
test('late events without attack geometry do not invent an enemy beam',()=>{assert.equal(createEnemyStrike({}),null);});

test('cone warning preserves the authority forward sector rather than pointing behind the attacker',()=>{
 const root=createEnemyWarning({...attack,shape:'cone',direction:{x:0,z:1}});assert.equal(root.children[0].rotation.y,Math.PI);root.userData.dispose();
});
