import { contentData } from './data/index.mjs';
import { getSceneNavigation, sceneNavigationIds } from './client/scene-navigation.mjs';
import { PLAYER_RADIUS } from './movement.mjs';
import { TRAIN_LAYOUT, TRAIN_BULKHEAD_PARTS, solidBox, trainVestibuleParts } from './train-layout.mjs';

// Positions persisted by the authority are always area-local. Only these fixed
// origins place areas into a shared rendered realm; they are never move deltas.
const point = (x=0,y=0,z=0,yaw=0) => ({x,y,z,yaw});
const names = new Map(contentData.scenes.map(scene=>[scene.id,scene.name]));
const mutableAreas = [], mutableLinks = [];
const addArea = (id,sceneId,origin,bounds,kind='room',extra={}) => {
  const inherited = sceneNavigationIds.includes(sceneId) ? getSceneNavigation(sceneId) : {bounds,walls:[]};
  const area={id,sceneId:sceneId??id,name:names.get(sceneId)??id,realm:'HOGWARTS',origin:{x:origin[0],y:origin[1],z:origin[2]},physicalBounds:[...(bounds??inherited.bounds)],navigation:{bounds:[...(bounds??inherited.bounds)],walls:inherited.walls.map(wall=>({...wall}))},spawn:point(0,0,6),kind,...extra};
  mutableAreas.push(area);return area;
};
addArea('SC01','SC01',[0,0,0],null,'room',{realm:'LONDON'});
addArea('LONDON_PLATFORM',null,[0,0,-24],[-9.5,11.8,-38,14],'platform',{realm:'LONDON',name:'九又四分之三站台'});
addArea('SC02_LONDON','SC02',[15,0,-39.4],null,'room',{realm:'LONDON',name:'霍格沃茨特快 · 伦敦站'});
addArea('SC02_HOGSMEADE','SC02',[-16,0,126.6],null,'room',{name:'霍格沃茨特快 · 霍格莫德站'});
addArea('HOGSMEADE_STATION',null,[0,0,142],[-12.8,12,-12,12],'station',{name:'霍格莫德站'});
addArea('ARRIVAL_ROAD',null,[0,0,122],[-5,5,-8,8],'arrival-road',{name:'湖岸山路'});
const lakeArea=addArea('SC03','SC03',[0,0,42],[-10,10,-14,72],'room',{spawn:point(0,0,66)});
lakeArea.navigation.walls=[{x:0,z:21,w:25,d:48,height:5,water:true},...[-1,1].map(side=>({x:side*7,z:16,w:7.2,d:61,height:5,water:true}))];
addArea('FORECOURT',null,[0,0,20],[-8,8,-8,8],'forecourt',{name:'城堡前庭'});
addArea('ENTRANCE',null,[0,0,0],[-10,10,-12,12],'entrance',{name:'霍格沃茨门厅'});
for(const [index,suffix] of ['G','1','2','3'].entries())addArea(`CORRIDOR_${suffix}`,null,[0,index*10,-16],[-44,index===3?60:44,-4,4],'corridor',{name:index?`${index}层走廊`:'一楼长廊',spawn:point(0,0,0)});
for(const [index,suffix] of ['G1','12','23','3T'].entries())addArea(`STAIR_${suffix}`,null,[0,index*10,-32],[-7,7,-12,12],'stairs',{name:'城堡折返楼梯',spawn:point(-3.5,0,10.5)});
for(const [id,x,y]of[['SC04',26,0],['SC06',-26,0],['SC05',26,10],['SC07',-26,10],['SC13',-26,20],['SC15',26,20]])addArea(id,id,[x,y,-34.6]);
addArea('SC11','SC11',[0,40,-8]);
addArea('GROUNDS',null,[0,0,0],[-120,100,-115,70],'grounds',{name:'霍格沃茨校园',spawn:point(13,0,0)});
for(const [id,x,z]of[['SC08',66,-2],['SC09',-76,6],['SC10',-60,-52],['SC12',-88,-92]])addArea(id,id,[x,0,z]);
for(let number=28;number<=34;number++)addArea(`SC14-M${number}`,'SC14',[54,number===28?30:-10,number<=29?-34.6:-34.6-(number-29)*31.29],null,'room',{questId:`M${number}`,name:['路威与活板门','魔鬼网','飞钥匙','巫师棋','倒下的巨怪','药水逻辑房','魔镜密室'][number-28]});
for(let number=29;number<34;number++)addArea(`PASSAGE_M${number}_M${number+1}`,null,[54,-10,-48.29-(number-29)*31.29],[-2.1,2.1,-3,3],'corridor',{name:'地下石廊',spawn:point(0,0,0)});
addArea('CORRIDOR_B',null,[0,-10,-16],[-44,44,-4,4],'corridor',{name:'地下长廊',spawn:point(0,0,0)});
addArea('STAIR_BG',null,[0,-10,-32],[-7,7,-12,12],'stairs',{name:'地下教室楼梯',spawn:point(-3.5,0,10.5)});
addArea('POTIONS','POTIONS',[-26,-10,-34.6],[-7.6,7.6,-14.6,14.6],'room',{name:'魔药地下教室'});
addArea('GRYFFINDOR','GRYFFINDOR',[-26,30,2.6],[-7.6,7.6,-14.6,14.6],'room',{name:'格兰芬多公共休息室'});
addArea('MIRROR_ROOM','MIRROR_ROOM',[26,20,2.6],[-7.6,7.6,-14.6,14.6],'room',{name:'厄里斯魔镜空教室'});
addArea('LAKESHORE_PATH',null,[0,0,0],[11.1,61,17,145],'lakeshore-path',{name:'黑湖东岸小径',spawn:point(58,0,65),path:[point(12,0,142),point(58,0,142),point(58,0,20),point(22,0,20)]});
const areasById=new Map(mutableAreas.map(area=>[area.id,area]));
const localToWorld=(area,p)=>({x:area.origin.x+p.x,y:area.origin.y+(p.y??0),z:area.origin.z+p.z});
const worldToLocal=(area,p)=>point(p.x-area.origin.x,p.y-area.origin.y,p.z-area.origin.z);
function outwardNormal(area,anchor){
  if(area.kind==='stairs')return{x:0,z:1};
  const [x0,x1,z0,z1]=area.navigation.bounds;
  const candidates=[{distance:Math.abs(anchor.x-x0),outside:anchor.x<x0,x:-1,z:0},{distance:Math.abs(anchor.x-x1),outside:anchor.x>x1,x:1,z:0},{distance:Math.abs(anchor.z-z0),outside:anchor.z<z0,x:0,z:-1},{distance:Math.abs(anchor.z-z1),outside:anchor.z>z1,x:0,z:1}];
  const outside=candidates.filter(candidate=>candidate.outside);
  return (outside.length?outside:candidates).sort((a,b)=>a.distance-b.distance).map(({x,z})=>({x,z}))[0];
}
function directed(from,to,anchor,arrival,{kind='walk',requiresQuestIds=[],unavailableAfterQuestIds=[],label,normal,magicWall=false}={}){
  const source=areasById.get(from),target=areasById.get(to);
  const link={id:`${from}>${to}@${anchor.x},${anchor.y??0},${anchor.z}`,from,to,kind,anchor:{...anchor},arrival:{...arrival},normal:normal??outwardNormal(source,anchor),radius:kind==='walk'?.55:1.2,width:2.8,requiresQuestIds:[...requiresQuestIds],unavailableAfterQuestIds:[...unavailableAfterQuestIds],label:label??`前往${target.name}`,worldAnchor:localToWorld(source,anchor)};
  if(magicWall)link.magicWall=true;
  mutableLinks.push(link);return link;
}
function seam(from,to,anchor,options={}){
  const world=localToWorld(areasById.get(from),anchor),arrival=worldToLocal(areasById.get(to),world);
  const normal=options.normal??outwardNormal(areasById.get(from),anchor);
  directed(from,to,anchor,arrival,{...options,normal});directed(to,from,arrival,anchor,{...options,normal:{x:-normal.x,z:-normal.z},label:`返回${areasById.get(from).name}`});
}
seam('SC01','LONDON_PLATFORM',point(0,0,-11.4),{requiresQuestIds:['M01'],magicWall:true});
seam('LONDON_PLATFORM','SC02_LONDON',point(11.8,0,0),{requiresQuestIds:['M01'],label:'登上霍格沃茨特快'});
directed('SC02_LONDON','SC02_HOGSMEADE',point(0,0,6),point(0,0,6),{kind:'train',requiresQuestIds:['M02'],label:'乘霍格沃茨特快前往霍格莫德'});
directed('SC02_HOGSMEADE','SC02_LONDON',point(0,0,6),point(0,0,6),{kind:'train',requiresQuestIds:['M36'],label:'乘返程列车回到伦敦'});
seam('SC02_HOGSMEADE','HOGSMEADE_STATION',point(3.2,0,15.4),{requiresQuestIds:['M02'],label:'走下列车'});
seam('HOGSMEADE_STATION','ARRIVAL_ROAD',point(0,0,-12),{requiresQuestIds:['M02']});
seam('ARRIVAL_ROAD','SC03',point(0,0,-8),{requiresQuestIds:['M02'],unavailableAfterQuestIds:['M03']});
seam('SC03','FORECOURT',point(0,0,-14),{requiresQuestIds:['M03']});
seam('FORECOURT','ENTRANCE',point(0,0,-8),{requiresQuestIds:['M03']});
seam('ENTRANCE','CORRIDOR_G',point(0,0,-12),{requiresQuestIds:['M03']});
for(const [room,corridor]of[['SC04','G'],['SC06','G'],['SC05','1'],['SC07','1'],['SC13','2'],['SC15','2'],['SC14-M28','3']])seam(room,`CORRIDOR_${corridor}`,point(0,0,14.6),{requiresQuestIds:[room==='SC14-M28'?'M27':'M03']});
for(const [index,suffix]of['G1','12','23','3T'].entries()){
  seam(`STAIR_${suffix}`,`CORRIDOR_${['G','1','2','3'][index]}`,point(-3.5,0,12),{requiresQuestIds:['M03']});
  if(index<3)seam(`STAIR_${suffix}`,`CORRIDOR_${index+1}`,point(3.5,10,12),{requiresQuestIds:['M03']});
  else seam(`STAIR_${suffix}`,'SC11',point(0,10,12),{requiresQuestIds:['M03']});
}
for(const x of[-10,10])seam('ENTRANCE','GROUNDS',point(x,0,0),{requiresQuestIds:['M03']});
for(const x of[-44,44])seam('CORRIDOR_G','GROUNDS',point(x,0,0),{requiresQuestIds:['M03']});
for(const [id,z]of[['SC08',12],['SC09',12],['SC10',14.6],['SC12',12],['SC06',-10.69]])seam(id,'GROUNDS',point(0,0,z),{requiresQuestIds:['M03']});
directed('SC14-M28','SC14-M29',point(-.2,0,-7),point(-.2,0,-7),{kind:'drop',requiresQuestIds:['M28'],label:'从活板门落入魔鬼网'});
for(let number=29;number<34;number++){
  const passage=`PASSAGE_M${number}_M${number+1}`;
  seam(`SC14-M${number}`,passage,point(0,0,-10.69),{requiresQuestIds:[`M${number}`]});
  seam(passage,`SC14-M${number+1}`,point(0,0,-3),{requiresQuestIds:[`M${number}`]});
}
directed('SC14-M34','SC15',point(0,0,-7),point(0,0,6),{kind:'recovery',requiresQuestIds:['M34'],label:'获救后在校医院苏醒'});

seam('POTIONS','CORRIDOR_B',point(0,0,14.6),{requiresQuestIds:['M03']});
seam('STAIR_BG','CORRIDOR_B',point(-3.5,0,12),{requiresQuestIds:['M03']});
seam('STAIR_BG','CORRIDOR_G',point(3.5,10,12),{requiresQuestIds:['M03']});
seam('GRYFFINDOR','CORRIDOR_3',point(0,0,-14.6),{requiresQuestIds:['M03']});
seam('MIRROR_ROOM','CORRIDOR_2',point(0,0,-14.6),{requiresQuestIds:['M03']});
seam('HOGSMEADE_STATION','LAKESHORE_PATH',point(12,0,0),{requiresQuestIds:['M03'],label:'沿黑湖东岸步行返校'});
seam('LAKESHORE_PATH','GROUNDS',point(22,0,20),{requiresQuestIds:['M03'],normal:{x:-1,z:0}});
const lakeshore=areasById.get('LAKESHORE_PATH');
lakeshore.navigation.walls.push({x:(11.1+55)/2,z:81,w:55-11.1,d:116,height:100,boundary:true},{x:(11.1+20.5)/2,z:20,w:20.5-11.1,d:6,height:100,boundary:true});

// Widen only authored door aprons. The side strips remain impassable, so an
// expanded rectangular navigation bound does not open the entire room facade.
function apron(area,axis,coordinate,center=0){
  const b=area.navigation.bounds,w=area.navigation.walls,half=1.4,overlap=.9,high=100;
  const rect=(x,z,width,depth)=>{if(width>0&&depth>0)w.push({x,z,w:width,d:depth,height:high,boundary:true});};
  if(axis==='z'){
    const old=coordinate<0?b[2]:b[3],edge=coordinate+(coordinate<0?-overlap:overlap);if(coordinate<0?edge>=old:edge<=old)return;
    const low=Math.min(old,edge),top=Math.max(old,edge);rect((b[0]+center-half)/2,(low+top)/2,center-half-b[0],top-low);rect((center+half+b[1])/2,(low+top)/2,b[1]-center-half,top-low);b[coordinate<0?2:3]=edge;
  }else{
    const old=coordinate<0?b[0]:b[1],edge=coordinate+(coordinate<0?-overlap:overlap);if(coordinate<0?edge>=old:edge<=old)return;
    const low=Math.min(old,edge),top=Math.max(old,edge);rect((low+top)/2,(b[2]+center-half)/2,top-low,center-half-b[2]);rect((low+top)/2,(center+half+b[3])/2,top-low,b[3]-center-half);b[coordinate<0?0:1]=edge;
  }
}
// The side doors meet a real vestibule. Furniture and sidewalls, rather than
// an invisible aisle-sized rectangle, define the passenger cabin's solid space.
for(const id of ['SC02_LONDON','SC02_HOGSMEADE']){
  const area=areasById.get(id),v=TRAIN_LAYOUT.vestibule;
  area.navigation.bounds=[-v.halfWidth-.9,v.halfWidth+.9,TRAIN_LAYOUT.bounds[2],v.floorEndZ];
  const vestibule=trainVestibuleParts(mutableLinks.filter(link=>link.from===id));
  area.navigation.walls.push(...vestibule.map(solidBox));
  area.navigation.cameraWalls=[...TRAIN_BULKHEAD_PARTS.map(solidBox),...vestibule.map(solidBox)];
}

function openDoorBands(area,portals){
  const b=area.navigation.bounds,base=[...b],groups={west:[],east:[],north:[],south:[]};
  for(const p of portals){
    if(p.x<base[0]+1)groups.west.push(p);else if(p.x>base[1]-1)groups.east.push(p);
    else if(p.z<base[2]+1)groups.north.push(p);else if(p.z>base[3]-1)groups.south.push(p);
  }
  for(const [side,doors]of Object.entries(groups)){
    if(!doors.length)continue;const alongZ=side==='north'||side==='south',negative=side==='north'||side==='west',index=alongZ?(negative?2:3):(negative?0:1);
    const coordinates=doors.map(p=>alongZ?p.z:p.x),edge=(negative?Math.min(...coordinates)-.9:Math.max(...coordinates)+.9),old=base[index];
    if(negative?edge>=old:edge<=old)continue;b[index]=edge;
    const low=Math.min(old,edge),high=Math.max(old,edge),ranges=doors.map(p=>{const center=alongZ?p.x:p.z;return[center-1.4,center+1.4];}).sort((a,b)=>a[0]-b[0]);
    const min=base[alongZ?0:2],max=base[alongZ?1:3];let cursor=min;
    const block=(a,z)=>{if(z<=a)return;area.navigation.walls.push(alongZ?{x:(a+z)/2,z:(low+high)/2,w:z-a,d:high-low,height:100,boundary:true}:{x:(low+high)/2,z:(a+z)/2,w:high-low,d:z-a,height:100,boundary:true});};
    for(const [a,z]of ranges){block(cursor,Math.min(a,max));cursor=Math.max(cursor,z);}block(cursor,max);
  }
}
for(const area of mutableAreas){
  if(area.kind==='stairs'){
    area.navigation.bounds[3]=12.9;
    if(area.id==='STAIR_3T')area.navigation.walls.push({x:0,z:0,w:.8,d:18,height:100,boundary:true},{x:-1.6,z:10.95,w:.35,d:3.9,height:100,boundary:true},{x:-.8,z:9,w:1.6,d:.35,height:100,boundary:true});
    else area.navigation.walls.push({x:0,z:1.95,w:.8,d:21.9,height:100,boundary:true});
    continue;
  }
  if(area.kind==='grounds')continue;
  openDoorBands(area,mutableLinks.filter(link=>link.from===area.id&&link.kind==='walk').map(link=>link.anchor));
}
// The enchanted brick barrier is visually solid from both sides, while its
// authored walk seam intentionally has no player collision. Cameras stay on
// the player's side as they pass through its thickness.
for(const id of ['SC01','LONDON_PLATFORM']){
  const area=areasById.get(id),door=mutableLinks.find(link=>link.from===id&&link.magicWall);
  if(id==='LONDON_PLATFORM')for(const [low,high]of[[area.navigation.bounds[0],-door.width/2],[door.width/2,area.navigation.bounds[1]]])
    area.navigation.walls.push({x:(low+high)/2,z:door.anchor.z,w:high-low,d:.44,height:7.9,boundary:true});
  area.navigation.cameraWalls=[...area.navigation.walls,{x:door.anchor.x,z:door.anchor.z,w:34.4,d:.44,height:7.9,magicWall:true}];
}
// Exterior collision excludes every occupied building and the whole lake.
const grounds=areasById.get('GROUNDS');
for(const area of mutableAreas.filter(area=>area.realm==='HOGWARTS'&&area.origin.y===0&&['room','entrance','corridor','stairs','forecourt'].includes(area.kind))){
  if(area.id.startsWith('SC02')||area.id==='SC03')continue;
  const [x0,x1,z0,z1]=area.navigation.bounds;
  const footprint={x:area.origin.x+(x0+x1)/2,z:area.origin.z+(z0+z1)/2,w:x1-x0,d:z1-z0,height:100,boundary:true,building:area.id};
  // Carve a narrow pocket at each declared outdoor door for exact seam transfer.
  let pieces=[{x0:footprint.x-footprint.w/2,x1:footprint.x+footprint.w/2,z0:footprint.z-footprint.d/2,z1:footprint.z+footprint.d/2}];
  for(const link of mutableLinks.filter(link=>link.from===area.id&&link.to==='GROUNDS')){
    const p=link.worldAnchor,cut={x0:p.x-1.4,x1:p.x+1.4,z0:p.z-1.4,z1:p.z+1.4},next=[];
    for(const r of pieces){const ax=Math.max(r.x0,cut.x0),bx=Math.min(r.x1,cut.x1),az=Math.max(r.z0,cut.z0),bz=Math.min(r.z1,cut.z1);if(ax>=bx||az>=bz){next.push(r);continue;}for(const part of[{x0:r.x0,x1:ax,z0:r.z0,z1:r.z1},{x0:bx,x1:r.x1,z0:r.z0,z1:r.z1},{x0:ax,x1:bx,z0:r.z0,z1:az},{x0:ax,x1:bx,z0:bz,z1:r.z1}])if(part.x1>part.x0&&part.z1>part.z0)next.push(part);}pieces=next;
  }
  for(const p of pieces)grounds.navigation.walls.push({x:(p.x0+p.x1)/2,z:(p.z0+p.z1)/2,w:p.x1-p.x0,d:p.z1-p.z0,height:100,boundary:true,building:area.id,water:area.id==='SC03'});
}
grounds.navigation.walls.push({x:0,z:71,w:104,d:86,height:100,water:true,building:'SC03'});
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
export const worldAreas=deepFreeze(mutableAreas);
export const areaLinks=deepFreeze(mutableLinks);
export function getWorldArea(id){return areasById.get(id==='SC02'?'SC02_LONDON':id==='SC14'?'SC14-M28':id)??null;}
export function questAreaId(questId){const authored={M07:'CORRIDOR_3',M16:'MIRROR_ROOM',M17:'SC07'};if(authored[questId])return authored[questId];if(/^M(?:2[89]|3[0-4])$/.test(questId))return `SC14-${questId}`;if(questId==='M02')return 'SC02_LONDON';return contentData.questSceneMap[questId]?.[0]??'SC01';}
export function resolveAreaId(character={}){
  if(areasById.has(character.areaId))return character.areaId;
  const sceneId=character.sceneId??character.visitSceneId,questId=character.dungeonRoom?.roomId??character.activity?.questId??character.currentQuestId;
  if(sceneId==='SC14')return /^M(?:2[89]|3[0-4])$/.test(questId)?`SC14-${questId}`:'SC14-M28';
  if(sceneId==='SC02')return character.completedQuestIds?.includes('M02')?'SC02_HOGSMEADE':'SC02_LONDON';
  return areasById.has(sceneId)?sceneId:questAreaId(questId);
}
export function getAreaLinks(areaId){const id=getWorldArea(areaId)?.id;return areaLinks.filter(link=>link.from===id);}
export function isAtAreaLink(position,link,{normalTolerance=.55,lateralMargin=PLAYER_RADIUS}={}){
  if(!position||!link?.anchor||![position.x,position.y??0,position.z].every(Number.isFinite))return false;
  const dx=position.x-link.anchor.x,dy=(position.y??0)-(link.anchor.y??0),dz=position.z-link.anchor.z;
  if(link.kind!=='walk')return Math.hypot(dx,dy,dz)<=(link.radius??1.2)+1e-9;
  const normal=link.normal;if(!normal||!Number.isFinite(normal.x)||!Number.isFinite(normal.z))return false;
  const length=Math.hypot(normal.x,normal.z);if(length<1e-6)return false;
  return Math.abs((dx*normal.x+dz*normal.z)/length)<=normalTolerance+1e-9&&Math.abs((-dx*normal.z+dz*normal.x)/length)<=(link.width??2.8)/2-lateralMargin+1e-9&&Math.abs(dy)<=.2+1e-9;
}
export function canUseLink(character,link){if(!link||!areaLinks.includes(link)&&!areaLinks.some(item=>item.id===link.id))return false;const known=areaLinks.find(item=>item.id===link.id),completed=new Set(character?.completedQuestIds??[]);return known.requiresQuestIds.every(id=>completed.has(id))&&!known.unavailableAfterQuestIds.some(id=>completed.has(id));}
export function routeBetween(from,to,character={}){
  const source=getWorldArea(from)?.id,target=getWorldArea(to)?.id;if(!source||!target)return null;if(source===target)return [];
  const queue=[{id:source,path:[]}],seen=new Set([source]);
  for(let index=0;index<queue.length;index++)for(const link of getAreaLinks(queue[index].id)){if(!canUseLink(character,link)||seen.has(link.to))continue;const path=[...queue[index].path,link];if(link.to===target)return path;seen.add(link.to);queue.push({id:link.to,path});}return null;
}
export function areaFloor(areaId,p){const area=getWorldArea(areaId);if(!area||area.kind!=='stairs')return 0;const z=Math.max(-9,Math.min(9,p.z));if(p.z<=-9)return 5;if(area.id==='STAIR_3T'&&p.z>=9&&p.x>=-1.6)return 10;return p.x<0?(9-z)*5/18:5+(z+9)*5/18;}
