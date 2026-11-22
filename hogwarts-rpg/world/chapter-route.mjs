import { SAGA } from '../js/magic/saga.mjs';
export const chapterStages={
  station:{map:'kings-cross',place:'国王十字车站',next:'train'},
  train:{map:'express',place:'霍格沃茨特快列车',next:'lake'},
  lake:{map:'lake',place:'黑湖渡口',next:'classroom'},
  classroom:{map:'charms',place:'弗立维的魔咒课',next:'corridor'},
  corridor:{map:'practice-gallery',place:'万圣节回廊'},
  dungeon:{map:'troll-washroom',place:'巨怪副本 · 东侧盥洗室'},
  safe:{map:'sorting',place:'第二章 · 大礼堂营地',next:'year1'},
  ...Object.fromEntries(SAGA.flatMap((volume,index)=>{
    const heading='第'+('一二三四五六七'[index])+'卷 · '+volume.title;
    return [
      [volume.stage,{map:volume.stage,place:volume.place,heading,next:SAGA[index+1]?.stage||'epilogue'}],
      ['arena-'+volume.stage,{map:'arena-'+volume.stage,place:volume.boss,heading}]
    ];
  })),
  epilogue:{map:'epilogue',place:'晨光中的大礼堂',heading:'终章 · 霍格沃茨的黎明'}
};

// A staggered entrance leaves a clear sightline to the close pair as well as the boss.
const entranceSeats=[[-1.45,4.6],[1.45,4.6],[-2.7,6.7],[2.7,6.7]];
export function arrivalPoint(data,world){
  const travel=data.travel,b=world.bounds;
  let restore=null;
  if(travel?.mode==='chapter'&&travel.stage===data.stage&&Number.isFinite(travel.x)&&Number.isFinite(travel.z)
    &&travel.x>=b[0]&&travel.x<=b[1]&&travel.z>=b[2]&&travel.z<=b[3])restore=travel;
  if(data.stage==='lake'&&travel?.stage==='lake'&&travel.chapterBeat===4)return restore&&restore.z<-7.25?restore:world.boatLanding;
  if(restore||!data.instance?.players)return restore;
  const players=data.instance.players,member=players[data.playerId];
  if(!member)return null;
  const seat=Number.isInteger(member.seat)?member.seat:Object.keys(players).indexOf(data.playerId);
  const [x,z]=entranceSeats[seat]||entranceSeats[0];
  return {x,y:0,z,yaw:Math.atan2(x,z+2.2)};
}

export const escortPath=[[-.6,2.4],[.36,.93],[.16,-1.14],[-1.32,-2.53],[-2.69,-3.43]];
export function escortProgress(escort){
  if(escort.index>=escortPath.length)return 1;
  const [sx,sz]=escortPath[escort.index-1], [x,z]=escortPath[escort.index];
  return (escort.index-1+Math.min(1,Math.hypot(escort.x-sx,escort.z-sz)/Math.hypot(x-sx,z-sz)))/(escortPath.length-1);
}
export function catchUpEscort(escort,progress){
  if(!Number.isFinite(progress)||progress<=escortProgress(escort))return;
  const end=escortPath.length-1,raw=Math.min(1,progress)*end,index=Math.min(end-1,Math.floor(raw)),weight=raw-index;
  const [sx,sz]=escortPath[index],[x,z]=escortPath[index+1];
  escort.x=sx+(x-sx)*weight;escort.z=sz+(z-sz)*weight;
  escort.index=raw===end?end+1:index+1;escort.yaw=Math.atan2(sx-x,sz-z);
}
export function walkEscort(escort,followers,dt) {
  if(escort.index>=escortPath.length)return {moving:false,arrived:true};
  const waiting=followers.some(p=>p && Math.hypot(escort.x-p.x,escort.z-p.z)>5.5);
  if(waiting)return {moving:false,waiting:true};
  const [x,z]=escortPath[escort.index],dx=x-escort.x,dz=z-escort.z,dist=Math.hypot(dx,dz);
  const travel=Math.min(1.65*dt,dist);
  if(dist>.001){
    escort.x+=dx/dist*travel;escort.z+=dz/dist*travel;
    escort.yaw=Math.atan2(-dx,-dz);
  }
  if(dist<=travel+.001)escort.index++;
  return {moving:travel>.001,arrived:escort.index>=escortPath.length};
}
