// Keep all currently weighted clips when another choice interrupts a transition.
// This blends every animated property, including facial morph weights.
export function motionBlend(){
  let layers=[],target=null,sources=[],elapsed=0,active=false;
  const length=.36;
  function finish(){
    for(const a of layers)if(a!==target)a.stop();
    if(target)target.setEffectiveWeight(1);
    layers=target?[target]:[];sources=[];active=false;
  }
  function select(action,phase,blend){
    const before=layers.map(a=>({a,w:a.getEffectiveWeight()}));
    target=action;
    if(!action){finish();return;}
    if(!blend||!before.length){finish();action.reset().setEffectiveWeight(1).play();}
    else{
      const existing=before.find(x=>x.a===action);
      sources=before.filter(x=>x.a!==action&&x.w>.000001);
      for(const x of before)if(x.a!==action&&x.w<=.000001)x.a.stop();
      action.reset().setEffectiveWeight(existing?.w||0).play();
      layers=[...sources.map(x=>x.a),action];elapsed=0;active=!!sources.length;
      if(!active)finish();
    }
    action.time=phase*action.getClip().duration;
  }
  function update(dt){
    if(!active)return;
    elapsed+=dt;const t=Math.min(1,elapsed/length),a=t*t*(3-2*t);let remainder=1;
    for(const src of sources){const w=src.w*(1-a);src.a.setEffectiveWeight(w);remainder-=w;}
    target.setEffectiveWeight(Math.max(0,remainder));if(t===1)finish();
  }
  function speed(rates){return layers.reduce((sum,a)=>sum+a.getEffectiveWeight()*(rates[a.getClip().name]||0),0);}
  const each=fn=>{for(const a of layers)fn(a);};
  return {select,finish,update,speed,each};
}
