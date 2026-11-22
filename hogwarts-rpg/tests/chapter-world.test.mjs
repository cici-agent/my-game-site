import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createChapterJourney} from '../world/chapter-journey.mjs';
import {chapterStages,arrivalPoint} from '../world/chapter-route.mjs';
import {createWorld} from '../world/world.mjs';
import {sagaLayout} from '../world/saga-world.mjs';
import {SAGA} from '../js/magic/saga.mjs';

function setup(t,stage,extra={}){
  const ui=new Map(),events=[],voices=[],checkpoints=[],notes=[],beams=[],swings=[];
  const {onAction=()=>{},onDodge=()=>true,...initial}=extra;
  let pose={x:0,y:0,z:6,yaw:0},time=1;
  const area=new THREE.Group();
  const landmarks=sagaLayout(stage)||{npc:[0,2.4],target:[-2.7,-3.45],exit:[0,-8.5],inspect:[2,-1.7]};
  const world={landmarks,walls:[],boatLanding:[-2.65,-9.35],setBoatRide:p=>({x:-4.55,y:.08,z:-3.45-5.9*p,yaw:0})};
  const control={getPose:()=>pose,ride:next=>{pose=next;},setWorld:(_,arr)=>{pose={x:arr[0],z:arr[1],y:0,yaw:0};},cast(){swings.push(time);},dodge:onDodge};
  const stub=()=>new THREE.Group();
  const f=createChapterJourney({data:{stage,hero:'harry',playerId:'first',...initial},world,area,control,
    beacon(){const g=stub();g.userData.gem=stub();return g;},nameTag:stub,release:o=>o.removeFromParent(),
    beam:(x,z)=>{beams.push([x,z]);return new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());},
    say:(name,text)=>voices.push(text),sound:note=>notes.push(note),onAction:async e=>{events.push(e);await onAction(e,f);},onChange:()=>checkpoints.push(f.getTravel()),
    ui:key=>{if(!ui.has(key))ui.set(key,{dataset:{}});return ui.get(key);}
  });
  t.after(()=>f.dispose());
  return {f,area,world,events,ui,voices,checkpoints,notes,beams,swings,loc:(x,z,yaw=0)=>{pose={x,z,y:0,yaw};},tick(n,peers=[]){for(let i=0;i<n;i++){time+=.05;f.update(.05,time,pose,false,peers);}}};
}

test('Hagrid waits, walks to dock, shares moving boat, and disembarks before exit works',async t=>{
  const {f,area,events,loc,tick}=setup(t,'lake');
  const guide=area.getObjectByName('海格');
  loc(-.6,2.4);tick(1);f.interact('interact');assert.equal(f.getTravel().chapterBeat,1);
  loc(0,8.7);tick(25);assert.equal(guide.position.z,2.4);
  loc(0,1);tick(35,[{x:0,z:9,escort:0}]);assert.equal(guide.position.z,2.4);
  for(let i=0;i<105;i++){loc(guide.position.x,guide.position.z+.4);tick(1);}
  assert.equal(f.getTravel().chapterBeat,2);assert(guide.position.z<-3.3);
  loc(-2.7,-3.45);tick(12);f.interact('interact');assert(f.riding);
  tick(45);assert(guide.position.z<-6);assert.equal(f.getTravel().chapterBeat,2,'mid-ride saves use the dock');
  tick(52);assert(!f.riding);assert.equal(f.getTravel().chapterBeat,4);
  loc(0,-8.5);tick(2);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,[{type:'advance',from:'lake',to:'classroom'}]);
});

test('the class requires a physical feather demonstration before the corridor transition',async t=>{
  const {f,loc,tick,events}=setup(t,'classroom');
  loc(0,-8.5);tick(22);assert.equal(events.length,0);
  loc(0,2.4);tick(15);f.interact('interact');
  loc(2,-1.7);tick(13);f.interact('cast');tick(43);
  assert.equal(f.getTravel().chapterBeat,2);
  loc(0,-8.5);tick(13);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(events[0].to,'corridor');
});

test('instance victory exposes the correct physical exit and losing never advances the chapter',async t=>{
  const {f,loc,tick,events,world}=setup(t,'dungeon');
  const fight={kind:'troll',status:'active',phase:'windup',target:'first',phaseUntil:Date.now()+4500,players:{},enemy:{name:'巨怪'}};
  f.setEncounter(fight);assert.equal(f.targets.length,0);assert.equal(world.walls.length,1);
  loc(0,15);assert(!f.playAction('attack'));loc(0,5);assert(f.playAction('attack'));
  loc(0,-8.5);tick(22);assert.equal(events.length,0);
  f.setEncounter({...fight,status:'won'},{helper:true});
  assert.equal(f.targets[0].label,'返回加入前的章节');
  tick(2);assert.equal(events.length,0,'replay exit is separate from progression exit');
  loc(-2.7,-2.05);tick(2);f.interact('interact');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(events.length,0,'interacting from 1.4 m away cannot replace walking through the exit');
  loc(-2.7,-3.45);tick(2);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,[{type:'exitDungeon'}]);
  f.setEncounter({...fight,status:'lost'});assert(!f.targets[0].cross);
  f.setEncounter({...fight,status:'won'},{helper:false});assert.equal(f.targets[0].label,'穿过大门，进入下一章');
  tick(15);assert.equal(world.walls.length,0,'the raised grille is physically passable');
  assert.deepEqual(Object.keys(chapterStages),['station','train','lake','classroom','corridor','dungeon','safe',...SAGA.flatMap(v=>[v.stage,'arena-'+v.stage]),'epilogue']);
});

test('four encounter seats face the enemy and clear the actual room geometry; rejoining restores the saved pose',t=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{
    get:(_,name)=>name==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}
  })})};
  t.after(()=>{if(previous)globalThis.document=previous;else delete globalThis.document;});
  for(const stage of ['dungeon','corridor']){
    const world=createWorld(chapterStages[stage].map,new THREE.Group());
    const ids=['one','two','three','four'],players=Object.fromEntries(ids.map((id,seat)=>[id,{seat}]));
    const data={stage,instance:{players}},points=ids.map(playerId=>arrivalPoint({...data,playerId},world));
    for(const [i,p] of points.entries()){
      for(const other of points.slice(i+1))assert(Math.hypot(p.x-other.x,p.z-other.z)>2.4);
      assert(!world.walls.some(w=>Math.abs(w.x-p.x)<w.w*.5+.4&&Math.abs(w.z-p.z)<w.d*.5+.4));
      assert(p.x>world.bounds[0]+.4&&p.x<world.bounds[1]-.4&&p.z>world.bounds[2]+.4&&p.z<world.bounds[3]-.4);
      assert(Math.abs(p.yaw-Math.atan2(p.x,p.z+2.2))<.001);
    }
    const travel={mode:'chapter',stage,x:2.1,z:.55,yaw:.46};
    assert.equal(arrivalPoint({...data,playerId:'two',travel},world),travel);
    assert.deepEqual(arrivalPoint({...data,instance:{players:{three:{seat:2}}},playerId:'three'},world),points[2]);
    world.dispose();
  }
});

test('one party reservation seats two students, uses the same crossing clock, and leaves a late arrival on shore',async t=>{
  let now=10_000;t.mock.method(Date,'now',()=>now);
  const ready={stage:'lake',mode:'chapter',chapterBeat:2};
  const first=setup(t,'lake',{party:true,travel:ready,playerId:'a'});
  const other=setup(t,'lake',{party:true,travel:ready,playerId:'b'});
  const late=setup(t,'lake',{party:true,travel:ready,playerId:'c'});
  first.loc(-2.7,-3.45);other.loc(-2.3,-3.25);late.loc(0,6);
  for(const client of [first,other,late])client.tick(2);
  first.f.interact('interact');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(first.events,[{type:'boardBoat'}]);assert.deepEqual(other.events,[]);
  for(const client of [first,other,late])client.f.setBoat({boat:{departAt:14500,arriveAt:21000},serverNow:now});
  first.tick(1,[{id:'b',x:-2.3,z:-3.25}]);other.tick(1,[{id:'a',x:-2.7,z:-3.45}]);late.tick(1);
  assert(first.f.riding&&other.f.riding);assert(!late.f.riding);
  now=18000;first.tick(1);other.tick(6);late.loc(-2.7,-3.45);late.tick(2);
  const a=first.area.getObjectByName('海格'),b=other.area.getObjectByName('海格');
  assert.equal(a.position.x,b.position.x);assert.equal(a.position.z,b.position.z);assert(!late.f.riding);
  now=21001;first.tick(1);other.tick(1);
  assert.equal(first.f.getTravel().chapterBeat,4);assert.equal(other.f.getTravel().chapterBeat,4);assert.equal(late.f.getTravel().chapterBeat,2);
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));

for(const book of SAGA){
  test(book.stage+' runs its mentor, two physical trials, saved course and dungeon entrance',async t=>{
    const {f,area,world,events,notes,voices,loc,tick}=setup(t,book.stage);
    const places=world.landmarks;
    const visit=(spot,key)=>{loc(...places[spot]);tick(13);f.interact(key);};
    assert(area.getObjectByName(book.guide));
    assert.equal(f.getTravel().chapterBeat,0);
    visit('exit','context');assert.equal(f.getTravel().chapterBeat,0);
    visit('npc','context');assert.equal(f.getTravel().chapterBeat,1);
    const first=area.getObjectByName(book.stage+'-trial-1');
    const second=area.getObjectByName(book.stage+'-trial-2');
    assert(first.children.length>=3&&second.children.length>=3);
    for(const [i,[spot]] of book.trial.entries()){
      const target=f.targets[0];
      assert.equal(target.trial,i);
      loc(...places.exit);tick(16);f.interact('context');tick(27);
      assert.equal(f.getTravel().chapterBeat,i+1,'long-distance casts/interactions must miss');
      const otherKey=target.kind==='spell'?'interact':'cast';
      visit(spot,otherKey);tick(24);
      assert.equal(f.getTravel().chapterBeat,i+1,'the wrong input cannot complete a trial');
      const correctKey=book.book%2===0?'context':target.kind==='spell'?'cast':'interact';
      visit(spot,correctKey);tick(7);
      assert.equal(f.getTravel().chapterBeat,i+1,'the object animates before saving the completion');
      tick(18);await settle();
      assert.equal(f.getTravel().chapterBeat,i+2);
      assert(voices.includes(book.trial[i][3]));
    }
    assert.deepEqual(events,[{type:'learnSaga',skillId:book.spell.id}]);
    assert(notes.length>=5);
    assert.equal(f.targets[0].boss,book.kind);
    visit('exit','context');await settle();
    assert.deepEqual(events.at(-1),{type:'enterDungeon',kind:book.kind});
  });
}

test('a collected memory follows its carrier, survives a movement checkpoint, and can retry a failed course save',async t=>{
  let offline=true;
  const book=SAGA[2],ready={mode:'chapter',stage:book.stage,chapterBeat:2};
  const {f,area,world,events,voices,loc,tick}=setup(t,book.stage,{travel:ready,onAction(e){
    if(e.type==='learnSaga'&&offline)throw new Error('课程保存暂时不可用');
  }});
  const root=area.getObjectByName('year3-trial-1'),item=root.getObjectByName('relic');
  const position=new THREE.Vector3();
  loc(1.4,.3);tick(12);item.getWorldPosition(position);assert(Math.abs(position.x-1.81)<.02);
  loc(-2,-1);tick(12);item.getWorldPosition(position);assert(Math.abs(position.x+1.59)<.02);
  loc(...world.landmarks.target);tick(12);f.interact('cast');tick(25);await settle();
  assert(voices.includes('课程保存暂时不可用'));assert.equal(f.getTravel().chapterBeat,2);assert.equal(f.targets[0].kind,'spell');
  offline=false;tick(12);f.interact('context');tick(25);await settle();
  assert.equal(f.getTravel().chapterBeat,3);assert.equal(events.length,2);
  const resumed=setup(t,book.stage,{travel:ready,trained:true,cleared:true});
  assert.equal(resumed.f.getTravel().chapterBeat,3);assert(resumed.f.targets.some(p=>p.kind==='advance'));
  resumed.loc(...world.landmarks.exit);resumed.tick(12);await settle();
  assert.deepEqual(resumed.events,[{type:'advance',from:'year3',to:'year4'}]);
});

test('a walking instructor waits for the player and leads them toward the first mirror',t=>{
  const {f,world,area,loc,tick}=setup(t,'year1');
  const guide=area.getObjectByName(SAGA[0].guide),start=guide.position.clone();
  loc(...world.landmarks.npc);tick(13);f.interact('interact');
  loc(5,8);tick(15);assert(guide.position.equals(start));
  loc(...world.landmarks.npc);tick(20);assert(guide.position.distanceTo(start)>1);
});

for(const book of SAGA){
  test('arena-'+book.stage+' shows the book boss, routes F, and only walking through the correct gate leaves',async t=>{
    const fight={kind:book.kind,id:'D',status:'active',phase:'windup',phaseUntil:Date.now()+6400,
      started:true,mechanic:{step:0,band:0,actor:null},target:'first',players:{},enemy:{name:book.boss}};
    const {f,area,world,events,loc,tick}=setup(t,'arena-'+book.stage,{instance:fight});
    assert(area.getObjectByName(book.kind));assert.equal(f.targets.length,0);
    loc(0,15);assert(!f.playAction('counter'));loc(0,4);assert(f.playAction('counter'));
    f.interact('cast');await settle();assert.deepEqual(events,[{type:'combat',action:'counter'}]);
    f.setEncounter({...fight,status:'won'},{helper:true});tick(14);
    assert.deepEqual([f.targets[0].x,f.targets[0].z],world.landmarks.target);
    loc(...world.landmarks.exit);tick(12);assert.equal(events.length,1);
    const [x,z]=world.landmarks.target;
    loc(x+1.35,z);tick(12);f.interact('interact');await settle();assert.equal(events.length,1);
    loc(x,z);tick(12);await settle();assert.deepEqual(events.at(-1),{type:'exitDungeon'});
    f.setEncounter({...fight,status:'won'},{helper:false});
    loc(...world.landmarks.exit);tick(16);await settle();
    assert.equal(events.length,3);assert.equal(world.walls.length,0);
  });
}

test('stepping out of the marked basilisk strike triggers one dodge and no second dash',async t=>{
  let dashes=0;
  const fight={kind:'basilisk',id:'s',status:'active',phase:'opening',phaseUntil:Date.now()+5600,
    started:true,mechanic:{band:0,step:1,actor:'friend'},enemy:{name:'蛇怪'},target:'friend',players:{}};
  const {f,events,loc,tick}=setup(t,'arena-year2',{instance:fight,onDodge(){dashes++;return true;},
    onAction(e,journey){if(e.type==='combat')journey.playAction(e.action);}
  });
  loc(1,3);tick(12);loc(2.1,3);tick(12);await settle();assert.equal(events.length,0);
  loc(2.9,3);tick(12);await settle();tick(25);await settle();
  assert.deepEqual(events,[{type:'combat',action:'dodge'}]);assert.equal(dashes,0);
  assert(f.playAction('dodge'));assert.equal(dashes,1);
});

test('walking out of camp opens the first volume; the epilogue has two separate world interactions',async t=>{
  const camp=setup(t,'safe');
  camp.loc(.1,-7.15);camp.tick(14);camp.f.interact('interact');await settle();
  assert.deepEqual(camp.events,[]);
  camp.loc(...camp.world.landmarks.exit);camp.tick(12);await settle();
  assert.deepEqual(camp.events,[{type:'advance',from:'safe',to:'year1'}]);
  const end=setup(t,'epilogue');
  assert.equal(end.f.getTravel().chapterBeat,0);
  end.loc(...end.world.landmarks.npc);end.tick(16);end.f.interact('context');await settle();
  end.loc(...end.world.landmarks.target);end.tick(16);end.f.interact('interact');await settle();
  assert.deepEqual(end.events,[{type:'ending'},{type:'replays'}]);
});

test('exploration casts follow the student facing, stop on tall walls and never interact or grant rewards',async t=>{
  const {f,world,beams,swings,events,voices,loc,tick}=setup(t,'epilogue');
  loc(...world.landmarks.npc);tick(1);f.interact('primary');
  assert.equal(swings.length,1);assert.equal(beams.length,0);
  f.setFlags({knowsMagic:true});
  loc(3,3,Math.PI/2);tick(13);
  world.walls.push({x:2,z:3,w:.2,d:1,height:.48},{x:.8,z:3,w:.4,d:1,height:2});
  f.interact('cast');assert.equal(beams.length,1);assert(Math.abs(beams[0][0]-1)<.001&&Math.abs(beams[0][1]-3)<.001);
  f.interact('primary');assert.equal(beams.length,1);
  loc(...world.landmarks.npc);tick(14);f.interact('primary');
  assert.equal(beams.length,2);assert.equal(swings.length,3);assert.deepEqual(voices,[]);
  await settle();assert.deepEqual(events,[]);
});

test('mouse prioritises a nearby spell lesson and remains a basic attack during a boss counter cue',async t=>{
  const book=SAGA[2],lesson=setup(t,book.stage,{knowsMagic:true,travel:{mode:'chapter',stage:book.stage,chapterBeat:2}});
  lesson.loc(...lesson.world.landmarks.target);lesson.tick(12);lesson.f.interact('primary');
  assert.deepEqual(lesson.beams,[lesson.world.landmarks.target]);
  lesson.tick(25);await settle();assert.deepEqual(lesson.events,[{type:'learnSaga',skillId:'patronus'}]);
  const fight=setup(t,'arena-year3',{knowsMagic:true,instance:{kind:'dementor',status:'active',phase:'opening',
    phaseUntil:Date.now()+5200,started:true,mechanic:{band:0,step:1},players:{},enemy:{name:book.boss}}});
  fight.tick(12);fight.f.interact('primary');await settle();fight.f.interact('cast');await settle();
  assert.deepEqual(fight.events,[{type:'combat',action:'attack'},{type:'combat',action:'counter'}]);
});
