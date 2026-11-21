// The original 312 animation frames are baked into the GLB. Integrate the matching
// gait speeds analytically so the ground's position is reproducible after seeking.
export function sequenceFloor(duration){
  const keys=[[0,0],[31,0],[52,1.09],[84,1.09],[100,2.34],[146,2.34],[164,1.09],[188,1.09],[211,0],[312,0]];
  let total=0;
  const spans=keys.slice(1).map(([end,b],i)=>{
    const [start,a]=keys[i],seconds=(end-start)*duration/312;
    const base=total;total+=(a+b)*.5*seconds;return {start,end,a,b,seconds,base};
  });
  function sample(time){
    const frame=Math.min(312,Math.max(0,312*time/duration));
    const s=spans.find(s=>s.end>=frame)||spans.at(-1),u=(frame-s.start)/(s.end-s.start);
    const smooth=u*u*(3-2*u),integral=u*u*u*(1-u*.5);
    return {speed:s.a+(s.b-s.a)*smooth,distance:s.base+s.seconds*(s.a*u+(s.b-s.a)*integral)};
  }
  return {duration,speed:t=>sample(t).speed,distance:t=>sample(t).distance};
}
