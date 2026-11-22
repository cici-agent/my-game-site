const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const copy = p => ({ x:p.x, y:p.y??0, z:p.z });
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

// A route has an authoritative clock, not a stream of occasional position
// targets. Predict that same route between polls without inventing progress.
export function sampleEscort(escort, now = escort?.serverTime) {
  if(!escort)return null;
  const timed=finitePoint(escort.origin)&&finitePoint(escort.destination)&&Number.isFinite(escort.startedAt)&&Number.isFinite(escort.durationSeconds)&&escort.durationSeconds>0;
  const awaitingStart=escort.awaitingStart===true||escort.startedAt===null;
  const progress=awaitingStart?0:timed?clamp(((Number.isFinite(now)?now:escort.serverTime??escort.startedAt)-escort.startedAt)/(escort.durationSeconds*1000),0,1):clamp(escort.progress??0,0,1);
  const source=timed||awaitingStart&&finitePoint(escort.origin)?escort.origin:escort.position;
  const position=timed?{x:source.x+(escort.destination.x-source.x)*progress,y:(source.y??0)+((escort.destination.y??0)-(source.y??0))*progress,z:source.z+(escort.destination.z-source.z)*progress}:finitePoint(source)?copy(source):{x:0,y:0,z:0};
  const speed=timed?Math.hypot(escort.destination.x-source.x,escort.destination.z-source.z)/escort.durationSeconds:0;
  return {...escort,position,progress,awaitingStart,awaitingPlayer:!awaitingStart&&progress>=1&&escort.kind!=='boat',speed,timed};
}

export function acceptEscortSnapshot(previous, next, serverTime) {
  if(!next)return null;
  const incoming={...next,serverTime:next.serverTime??serverTime};
  if(previous) {
    if(Number.isFinite(previous.serverTime)&&Number.isFinite(incoming.serverTime)&&incoming.serverTime<previous.serverTime)return previous;
    const a=String(previous.targetId??'').match(/^M(\d+)-(\d+)$/),b=String(incoming.targetId??'').match(/^M(\d+)-(\d+)$/);
    if(a&&b&&a[1]===b[1]&&Number(b[2])<Number(a[2]))return previous;
    if(previous.targetId===incoming.targetId&&Number.isFinite(previous.startedAt)&&incoming.startedAt===null)return previous;
  }
  return incoming;
}

// Bounded linear correction avoids the sprint/idle pulses of exponential lerp.
// Normal timed routes already advance at their exact authored walking speed.
export function stepNpcMotion(position, destination, dt, routeSpeed = 0) {
  const dx=destination.x-position.x,dy=(destination.y??0)-(position.y??0),dz=destination.z-position.z,distance=Math.hypot(dx,dy,dz);
  const speed=routeSpeed>0?clamp(routeSpeed+.35,.7,3.2):1.7,step=Math.min(distance,speed*clamp(Number.isFinite(dt)?dt:0,0,.1));
  if(distance<1e-8)return copy(position);
  const t=step/distance;return{x:position.x+dx*t,y:(position.y??0)+dy*t,z:position.z+dz*t};
}

export function escortStatusText(escort, now=escort?.serverTime) {
  const sample=sampleEscort(escort,now);if(!sample)return '';
  const name=sample.npc??'同伴';
  if(sample.awaitingStart||!sample.timed&&sample.progress===0)return sample.kind==='boat'?`靠近${name}，按 E 登船`:`靠近${name}，按 E 开始同行`;
  if(sample.progress>=1)return sample.kind==='boat'?'船已靠岸，正在下船':`${name}已到达终点，走近即可继续`;
  return sample.kind==='boat'?`渡湖中 ${Math.round(sample.progress*100)}% · 靠岸后自动下船`:`跟上${name} · ${Math.round(sample.progress*100)}% · 路点自动继续`;
}
