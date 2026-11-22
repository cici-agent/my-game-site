import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {contentData,growthData} from '../chapter-one/data/index.mjs';
import {createEncounter,advanceEncounter} from '../chapter-one/combat/engine.mjs';
import {creatureCollision} from '../chapter-one/combat/collision-profiles.mjs';
import {runtimeQuests} from '../chapter-one/online/catalog.mjs';

function numericRows(value,path='',out=[]){
 if(typeof value==='number'||typeof value==='boolean')out.push([path,value]);
 else if(Array.isArray(value))value.forEach((v,i)=>numericRows(v,`${path}[${i}]`,out));
 else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))numericRows(child,path+'.'+key,out);
 return out;
}
const fingerprint=value=>createHash('sha256').update(JSON.stringify(numericRows(value))).digest('hex');
test('the creature presentation revision retains every published combat, growth and reward numeric field',()=>{
 assert.equal(fingerprint(contentData),'6cfeafeb723ed2d6e95ea88006aed0d1435ef8bddb065d630d40db367414871b');
 assert.equal(fingerprint(growthData),'1996c27e9bc52e61d19334ee3e9a5cb06493c67b580c70872b0b09f29b48fab8');
 assert.deepEqual(contentData.enemies.filter(e=>['PAPER-L1','BOX-L6'].includes(e.id)).map(e=>[e.id,e.name,e.level,e.tier,e.hpEach,e.skills[0].name,e.skills[0].rawDamage,e.xpUnits]),[
  ['PAPER-L1','小蜘蛛',1,'normal',240,'蛛丝喷吐',12,1],['BOX-L6','小蝙蝠',6,'strong',630,'低空扑击',66,2],
 ]);
 const quest=runtimeQuests.find(q=>q.id==='M04');assert.match(quest.objectives[1].label,/低处.*小蜘蛛/);assert.match(quest.objectives[2].label,/小蝙蝠.*低空扑击/);
 for(const encounter of contentData.encounters.filter(e=>['B1-E01','B1-E02'].includes(e.id)))assert.match(encounter.origin,/游戏化设计.*并非原著/);
});

test('renamed non-boss creature attacks retain exact damage, timing and line shape, and late observers receive their full attack trajectory',()=>{
 for(const [enemyId,name,rawDamage,windupMs]of [['PAPER-L1','蛛丝喷吐',12,1200],['BOX-L6','低空扑击',66,1100]]){
  let state=createEncounter({id:'creature-timing',kind:'monster',enemyId,players:[{id:'p',heroId:'harry',level:6,position:{x:0,y:0,z:2}}]});
  state=advanceEncounter(state,2000);const enemy=state.enemies['enemy-0'],attack=structuredClone(enemy.attack);
  assert.notEqual(enemy.tier,'boss');assert.equal(attack.name,name);assert.equal(attack.shape,'line');assert.equal(attack.rawDamage,rawDamage);assert.equal(attack.releaseAt-attack.startAt,windupMs);assert.equal(enemy.attackCooldowns[0],6000);
  state=advanceEncounter(state,attack.releaseAt);const event=state.events.find(e=>e.type==='enemy_attack_resolved');
  assert.equal(event.templateId,enemyId);assert.equal(event.attack.name,name);assert.deepEqual(event.attack,attack);assert.equal(event.attackId,attack.id);
  assert.deepEqual({collisionBase:enemy.collisionBase,collisionHeight:enemy.collisionHeight},creatureCollision(enemyId));
 }
});
