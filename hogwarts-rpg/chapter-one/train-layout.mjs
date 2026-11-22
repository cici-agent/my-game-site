// Metres in coach-local coordinates. Furniture uses one box specification for
// both its visible envelope and its floor-supported collision volume.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const solidBox=part=>({x:part.x,z:part.z,w:part.w,d:part.d,height:part.y+part.h/2});
export const TRAIN_LAYOUT=freeze({
  floorY:0,bounds:[-3.05,3.05,-10.02,14],spawn:[0,6.7],
  wallX:3.05,wallHeight:3.77,bodyLength:28,aisleHalfWidth:1.25,
  bayOrigins:Array.from({length:8},(_,index)=>-12.6+index*3.25),
  vestibule:{halfWidth:3.2,startZ:14,endZ:17.4,floorEndZ:17.5,doorZ:15.4,doorWidth:2.8,height:3.55},
  trolley:{x:2.05,z:2.55,w:1.1,d:.65,topY:1.24,attendant:{x:.82,y:0,z:2.55}},
});

export const TRAIN_SEATS=freeze([-1,1].flatMap(side=>TRAIN_LAYOUT.bayOrigins.flatMap((bay,index)=>{
  // The outer two window bays are end compartments, not seats embedded in a
  // bulkhead. Every occupied seat lies inside the traversable passenger cabin.
  if(index===0||index===7)return[];
  const id=`bench-${side<0?'left':'right'}-${index}`,x=side*2.03,z=bay+.49;
  const seat={surfaceY:.52,frontZ:-.48,backZ:.28,floorY:0,width:1.47,footMode:'auto'};
  return[{id,bay,side,position:{x,y:0,z},yaw:Math.PI,seat,parts:[
    {id:`${id}:cushion`,x,y:.44,z:bay+.59,w:1.47,h:.16,d:.76,material:'upholstery',rounding:.045,solid:true},
    {id:`${id}:back`,x,y:.81,z:bay+.10,w:1.47,h:.82,d:.22,material:'upholstery-back',rounding:.055,solid:true},
    {id:`${id}:base`,x,y:.195,z:bay+.59,w:1.35,h:.33,d:.66,material:'wood',rounding:.025},
    ...[-1,1].map(edge=>({id:`${id}:arm-${edge}`,x:x+edge*.685,y:.75,z:bay+.59,w:.10,h:.12,d:.70,material:'wood',rounding:.025,solid:true})),
  ]}];
})));
export const TRAIN_PASSENGER_SEATS=freeze({ron:'bench-left-2',hermione:'bench-right-2',harry:'bench-left-4',neville:'bench-left-5',draco:'bench-right-6'});
export const getTrainSeat=id=>TRAIN_SEATS.find(seat=>seat.id===(TRAIN_PASSENGER_SEATS[id]??id))??null;
export function resolveTrainCompanion(occupiedHeroIds=[]){
  const appearanceId=['ron','hermione','harry'].find(id=>!occupiedHeroIds.includes(id))??'neville',slot=getTrainSeat(appearanceId);
  return {appearanceId,name:({ron:'罗恩',hermione:'赫敏',harry:'哈利',neville:'纳威'})[appearanceId],position:{...slot.position},yaw:slot.yaw,seated:true,seat:{...slot.seat}};
}

export const TRAIN_FURNITURE_PARTS=freeze([
  ...TRAIN_SEATS.flatMap(seat=>seat.parts),
  {id:'luggage-left',x:-2.15,y:.31,z:2.55,w:1.02,h:.62,d:.70,material:'leather',rounding:.05,solid:true},
  {id:'card-table-top',x:2.05,y:.625,z:-.45,w:1.08,h:.07,d:.72,material:'wood',rounding:.025,solid:true},
  ...[-1,1].flatMap(x=>[-1,1].map(z=>({id:`card-table-leg:${x}:${z}`,x:2.05+x*.44,y:.30,z:-.45+z*.27,w:.07,h:.60,d:.07,material:'wood'}))),
]);
export const TRAIN_PICKUPS=freeze({
  toad:{position:{x:-1.38,y:TRAIN_LAYOUT.floorY,z:2.83},supportId:'floor',presentation:{prop:'toad'}},
  card:{position:{x:2.05,y:solidBox(TRAIN_FURNITURE_PARTS.find(part=>part.id==='card-table-top')).height,z:-.45},supportId:'card-table-top',presentation:{prop:'card'}},
  companion:{position:{...getTrainSeat('ron').position}},
});
export const TRAIN_BULKHEAD_PARTS=freeze([
  ...[-1,1].map(side=>({id:`coach-side:${side}`,x:side*TRAIN_LAYOUT.wallX,y:TRAIN_LAYOUT.wallHeight/2,z:0,w:.18,h:TRAIN_LAYOUT.wallHeight,d:TRAIN_LAYOUT.bodyLength})),
  {id:'coach-front',x:0,y:1.65,z:-10.2,w:6.2,h:3.3,d:.24},
  ...[-1,1].map(side=>({id:`coach-rear:${side}`,x:side*2.1,y:1.65,z:10.9,w:2,h:3.3,d:.19})),
]);
export const TRAIN_COLLIDERS=freeze([
  ...TRAIN_BULKHEAD_PARTS.map(solidBox),
  ...TRAIN_FURNITURE_PARTS.filter(part=>part.solid).map(solidBox),
  solidBox({x:TRAIN_LAYOUT.trolley.x+.07,y:TRAIN_LAYOUT.trolley.topY/2,z:TRAIN_LAYOUT.trolley.z,w:1.24,h:TRAIN_LAYOUT.trolley.topY,d:.69}),
]);
export function getTrainNavigation(){return{bounds:[...TRAIN_LAYOUT.bounds],walls:TRAIN_COLLIDERS.map(part=>({...part}))};}
export function trainVestibuleParts(portals=[]){
  const v=TRAIN_LAYOUT.vestibule,parts=[{id:'vestibule-end',x:0,y:v.height/2,z:v.endZ,w:v.halfWidth*2,h:v.height,d:.36}];
  for(const side of[-1,1]){
    const door=portals.find(link=>link.kind==='walk'&&Math.sign(link.anchor.x)===side&&link.anchor.z>v.startZ-.01);
    const segments=door?[[v.startZ,door.anchor.z-(door.width??v.doorWidth)/2],[door.anchor.z+(door.width??v.doorWidth)/2,v.endZ]]:[[v.startZ,v.endZ]];
    for(const[lo,hi]of segments)if(hi>lo+1e-8)parts.push({id:`vestibule-side:${side}:${lo}`,x:side*v.halfWidth,y:v.height/2,z:(lo+hi)/2,w:.40,h:v.height,d:hi-lo});
  }
  return parts;
}

// The same local seat contract also describes the lake boat. Boat transforms
// supply the world position/yaw; neither renderer guesses another seat offset.
export const BOAT_SEATS=freeze({
  guide:{z:-.75,seat:{surfaceY:.63,frontZ:-.16,backZ:.16,floorY:.0475,width:1.43,footMode:'auto'}},
  player:{z:.36,seat:{surfaceY:.63,frontZ:-.16,backZ:.16,floorY:.0475,width:1.43,footMode:'auto'}},
});
