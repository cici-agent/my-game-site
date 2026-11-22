import test from 'node:test';
import assert from 'node:assert/strict';
import { worldAreas, areaLinks, getWorldArea, resolveAreaId, questAreaId, getAreaLinks, canUseLink, routeBetween, areaFloor, isAtAreaLink } from '../chapter-one/world-atlas.mjs';
import { canOccupy, moveWithCollisions } from '../chapter-one/client/scene-geometry.mjs';
const complete={completedQuestIds:Array.from({length:36},(_,i)=>`M${String(i+1).padStart(2,'0')}`)};
const close=(actual,expected,label='coordinate')=>assert(Math.abs(actual-expected)<1e-7,`${label}: ${actual} vs ${expected}`);
const world=(area,p)=>({x:area.origin.x+p.x,y:area.origin.y+(p.y??0),z:area.origin.z+p.z});
function valid(area,p){const b=area.navigation.bounds;return p.x>=b[0]+.3-1e-8&&p.x<=b[1]-.3+1e-8&&p.z>=b[2]+.3-1e-8&&p.z<=b[3]-.3+1e-8&&canOccupy(p,area.navigation.walls);}

test('atlas areas and directional doors have unique stable identities and valid spawn support',()=>{
  assert.equal(new Set(worldAreas.map(a=>a.id)).size,worldAreas.length);
  assert.equal(new Set(areaLinks.map(l=>l.id)).size,areaLinks.length,'two doors between the same areas must have different ids');
  for(const area of worldAreas){assert(Object.isFrozen(area));assert(valid(area,area.spawn),area.id+' spawn');close(areaFloor(area.id,area.spawn),area.spawn.y,area.id+' spawn floor');}
  for(const link of areaLinks){assert(getWorldArea(link.from));assert(getWorldArea(link.to));assert(valid(getWorldArea(link.from),link.anchor),link.id+' anchor');assert(valid(getWorldArea(link.to),link.arrival),link.id+' arrival');close(areaFloor(link.to,link.arrival),link.arrival.y,link.id+' arrival floor');}
});

test('every walking seam preserves world pose with enough body clearance on both maps',()=>{
  for(const link of areaLinks.filter(l=>l.kind==='walk')){
    const from=getWorldArea(link.from),to=getWorldArea(link.to),a=world(from,link.anchor),b=world(to,link.arrival);
    assert.equal(from.realm,to.realm,link.id+' walking cannot cross railway realms');
    for(const axis of ['x','y','z'])close(a[axis],b[axis],link.id+'.'+axis);
    // Sample the entire automatic-trigger disc, not merely the seam centre.
    for(let sample=0;sample<16;sample++){
      const angle=sample*Math.PI/8,source={x:link.anchor.x+Math.cos(angle)*.5,y:link.anchor.y,z:link.anchor.z+Math.sin(angle)*.5};
      const destination={x:source.x+from.origin.x-to.origin.x,y:source.y+from.origin.y-to.origin.y,z:source.z+from.origin.z-to.origin.z};
      assert(valid(from,source),link.id+' source trigger disc');assert(valid(to,destination),link.id+' destination overlap');
      close(from.origin.y+areaFloor(from.id,source),to.origin.y+areaFloor(to.id,destination),link.id+' floor seam');
    }
  }
});

test('walking doors accept their full body-safe width and support continuous footsteps into the facing area',()=>{
  for(const link of areaLinks.filter(l=>l.kind==='walk')){
    const n=link.normal,from=getWorldArea(link.from),to=getWorldArea(link.to);close(Math.hypot(n.x,n.z),1,link.id+' unit normal');
    const reverse=getAreaLinks(link.to).find(other=>other.to===link.from&&Math.hypot(other.worldAnchor.x-link.worldAnchor.x,other.worldAnchor.z-link.worldAnchor.z)<1e-7);
    assert(reverse);close(reverse.normal.x,-n.x);close(reverse.normal.z,-n.z);
    const pose=(normal,lateral)=>({x:link.anchor.x+n.x*normal-n.z*lateral,y:link.anchor.y,z:link.anchor.z+n.z*normal+n.x*lateral});
    for(const lateral of[-1.1,-.8,0,.8,1.1]){
      assert(isAtAreaLink(pose(0,lateral),link),link.id+' wide door entry');assert(isAtAreaLink(pose(.45,lateral),link,{normalTolerance:.45}));
      let position=pose(-.55,lateral);assert(valid(from,position));
      for(let frame=1;frame<=10;frame++){const desired=pose(-.55+frame*.1,lateral),next=moveWithCollisions(position,desired,from.navigation.bounds,from.navigation.walls);close(next.x,desired.x,link.id+' approach x');close(next.z,desired.z,link.id+' approach z');position=next;}
      const before=world(from,position);position={x:position.x+from.origin.x-to.origin.x,y:position.y+from.origin.y-to.origin.y,z:position.z+from.origin.z-to.origin.z};
      for(const axis of ['x','y','z'])close(world(to,position)[axis],before[axis],link.id+' transfer '+axis);
      // Passing only the shared apron is insufficient: keep walking into the
      // destination body to catch two south-facing doors attached back-to-back.
      for(let frame=0;frame<9;frame++){const desired={x:position.x+n.x*.1,y:position.y,z:position.z+n.z*.1},next=moveWithCollisions(position,desired,to.navigation.bounds,to.navigation.walls);close(next.x,desired.x,link.id+' arrival x');close(next.z,desired.z,link.id+' arrival z');close(areaFloor(to.id,next),next.y,link.id+' foot support');position=next;}
    }
    assert(!isAtAreaLink(pose(0,1.101),link));assert(!isAtAreaLink(pose(.551,0),link));assert(!isAtAreaLink({...pose(0,0),y:link.anchor.y+.201},link));
    assert(!isAtAreaLink(pose(.451,0),link,{normalTolerance:.45}));
  }
  const recovery=getAreaLinks('SC14-M34').find(link=>link.to==='SC15');assert.equal(recovery.kind,'recovery');
  for(const link of areaLinks.filter(link=>link.kind!=='walk')){assert(isAtAreaLink(link.anchor,link));assert(!isAtAreaLink({...link.anchor,y:link.anchor.y+link.radius+.01},link));}
});

test('a U-shaped stair route rises continuously while its divider prevents a ten-metre shortcut',()=>{
  for(const id of ['STAIR_BG','STAIR_G1','STAIR_12','STAIR_23','STAIR_3T']){
    const area=getWorldArea(id);let p={x:-3.5,y:0,z:12};
    for(const target of [{x:-3.5,z:-10.5},{x:3.5,z:-10.5},{x:3.5,z:12},...(id==='STAIR_3T'?[{x:0,z:12}]:[])]){
      const from={...p},steps=Math.ceil(Math.hypot(target.x-p.x,target.z-p.z)/.1);
      for(let i=1;i<=steps;i++){const desired={x:from.x+(target.x-from.x)*i/steps,z:from.z+(target.z-from.z)*i/steps,y:p.y},next=moveWithCollisions(p,desired,area.navigation.bounds,area.navigation.walls);close(next.x,desired.x,id+' stair x');close(next.z,desired.z,id+' stair z');next.y=areaFloor(id,next);assert(Math.abs(next.y-p.y)<.04,id+' must not jump a whole floor');p=next;}
    }
    close(p.y,10,id+' upper landing');
    const shortcut=moveWithCollisions({x:-3.5,y:0,z:11},{x:3.5,y:0,z:11},area.navigation.bounds,area.navigation.walls);assert(shortcut.x<0,id+' central divider');
  }
});

test('returning to the station follows continuous dry east-shore land after the first boat trip',()=>{
  const learner={completedQuestIds:['M01','M02']},student={completedQuestIds:['M01','M02','M03']};
  assert.equal(routeBetween('GROUNDS','HOGSMEADE_STATION',learner),null,'the shore cannot skip the first boat objective');
  const back=routeBetween('ENTRANCE','HOGSMEADE_STATION',student);assert(back);assert(back.some(link=>link.to==='LAKESHORE_PATH'));assert(!back.some(link=>link.from==='SC03'||link.to==='SC03'));
  assert(getAreaLinks('SC03').filter(link=>link.to==='ARRIVAL_ROAD').every(link=>!canUseLink(student,link)),'north-bank visitors cannot be routed through impassable water');
  const shore=getWorldArea('LAKESHORE_PATH'),water=getWorldArea('GROUNDS').navigation.walls.filter(w=>w.water);let p={...shore.path[0]};
  for(const target of shore.path.slice(1)){
    const from={...p},steps=Math.ceil(Math.hypot(target.x-p.x,target.z-p.z)/.12);
    for(let frame=1;frame<=steps;frame++){const desired={x:from.x+(target.x-from.x)*frame/steps,y:0,z:from.z+(target.z-from.z)*frame/steps},next=moveWithCollisions(p,desired,shore.navigation.bounds,shore.navigation.walls);close(next.x,desired.x,'shore x');close(next.z,desired.z,'shore z');assert(canOccupy(next,water),'no shore waypoint may walk over lake water');p=next;}
  }
  assert(routeBetween('SC03','HOGSMEADE_STATION',student).some(link=>link.to==='LAKESHORE_PATH'));
});

test('grounds block room footprints and the lake while leaving declared door pockets open',()=>{
  const grounds=getWorldArea('GROUNDS');
  for(const id of ['ENTRANCE','SC04','SC06','SC08','SC09','SC10','SC12','SC03']){const area=getWorldArea(id),p={...area.origin};assert(!canOccupy(p,grounds.navigation.walls),id+' cannot be entered through an unregistered wall');}
  assert(grounds.navigation.walls.some(w=>w.water&&w.building==='SC03'));
  for(const z of[44,20,-4]){const from={x:0,y:0,z:46},target={x:0,y:0,z};const lake=getWorldArea('SC03'),stopped=moveWithCollisions(from,target,lake.navigation.bounds,lake.navigation.walls);assert(stopped.z>=45.299,'ordinary walking cannot cross the black lake');}
  assert(!getAreaLinks('GROUNDS').some(l=>l.to==='SC03'),'grounds cannot bypass the boat and castle arrival');
});

test('routes follow declared geography and story gates instead of connecting any two scene ids',()=>{
  assert(!getAreaLinks('SC01').some(l=>l.to==='SC05'));
  assert.equal(routeBetween('SC01','SC05',{}),null);
  assert.equal(routeBetween('SC02_LONDON','SC02_HOGSMEADE',{completedQuestIds:['M01']}),null);
  const arrival=routeBetween('SC02_LONDON','SC03',{completedQuestIds:['M01','M02']});assert(arrival);assert.deepEqual(arrival.map(l=>l.kind),['train','walk','walk','walk']);
  assert.equal(routeBetween('SC03','SC04',{completedQuestIds:['M01','M02']}),null);
  assert(routeBetween('SC03','SC04',{completedQuestIds:['M03']}));
  assert.equal(routeBetween('CORRIDOR_3','SC14-M28',{completedQuestIds:['M03']}),null);
  const trapdoor=getAreaLinks('SC14-M28').find(l=>l.kind==='drop');assert.equal(canUseLink({completedQuestIds:['M27']},trapdoor),false);assert(canUseLink({completedQuestIds:['M28']},trapdoor));
  const dropFrom=world(getWorldArea(trapdoor.from),trapdoor.anchor),dropTo=world(getWorldArea(trapdoor.to),trapdoor.arrival);close(dropFrom.x,dropTo.x);close(dropFrom.z,dropTo.z);close(dropFrom.y-dropTo.y,40);
  assert.equal(routeBetween('SC14-M29','SC14-M34',{completedQuestIds:['M28','M29']}),null);
  assert(routeBetween('SC14-M29','SC14-M34',complete).every(l=>l.kind==='walk'));
  const recovery=getAreaLinks('SC14-M34').find(l=>l.to==='SC15');assert(recovery);assert.equal(canUseLink({completedQuestIds:['M33']},recovery),false);assert(canUseLink(complete,recovery));
});

test('old saves resolve distinct train and underground areas without mutating their local positions',()=>{
  const old={sceneId:'SC14',currentQuestId:'M31',position:{x:2,y:0,z:-3,yaw:.7}},before=structuredClone(old);
  assert.equal(resolveAreaId(old),'SC14-M31');assert.deepEqual(old,before);
  assert.equal(resolveAreaId({...old,dungeonRoom:{roomId:'M30'}}),'SC14-M30');
  assert.equal(resolveAreaId({...old,areaId:'SC07'}),'SC07');
  assert.equal(resolveAreaId({sceneId:'SC02',completedQuestIds:[]}),'SC02_LONDON');assert.equal(resolveAreaId({sceneId:'SC02',completedQuestIds:['M02']}),'SC02_HOGSMEADE');
  for(let n=28;n<=34;n++)assert.equal(questAreaId(`M${n}`),`SC14-M${n}`);
  assert.equal(questAreaId('M07'),'CORRIDOR_3');assert.equal(questAreaId('M16'),'MIRROR_ROOM');assert.equal(questAreaId('M17'),'SC07');
  assert.equal(getWorldArea('SC14').id,'SC14-M28');
});
