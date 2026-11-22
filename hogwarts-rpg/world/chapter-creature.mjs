import * as THREE from 'three';

export function buildExitGate(){
  const root=new THREE.Group(),grille=new THREE.Group();
  root.add(grille);
  const stone=new THREE.MeshStandardMaterial({color:'#a19880',roughness:.9});
  const metal=new THREE.MeshStandardMaterial({color:'#495c56',roughness:.6,metalness:.35});
  const trim=new THREE.MeshStandardMaterial({color:'#c2a56c',roughness:.65});
  function box(parent,x,y,z,w,h,d,mat){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);
  }
  for(const side of [-1,1]){
    box(root,side*1.39,1.62,0,.34,3.24,.4,stone);
    box(root,side*1.39,.17,0,.52,.34,.55,stone);
    box(root,side*1.39,2.98,0,.47,.19,.51,trim);
  }
  box(root,0,3.28,0,3.18,.34,.47,stone);
  for(let i=-3;i<=3;i++)box(grille,i*.36,1.44,0,.074,2.81,.10,metal);
  for(const y of [.6,2.29])box(grille,0,y,0,2.61,.092,.135,metal);
  return {root,grille};
}

// Keep the club on its own joint so the opening and the levitation window are legible.
export function buildCreature(kind) {
  const root=new THREE.Group(), body=new THREE.Group(), torso=new THREE.Group(), clubArm=new THREE.Group(), club=new THREE.Group();
  const troll=kind==='troll', elite=kind==='elite';
  body.name='CreatureBody';torso.name='CreatureTorso';clubArm.name='CreatureClubArm';club.name='CreatureClub';
  root.add(body);body.add(torso);torso.add(clubArm);clubArm.add(club);
  const colors=new Map();
  function material(color){
    if(!colors.has(color))colors.set(color,new THREE.MeshStandardMaterial({color,roughness:.87}));
    return colors.get(color);
  }
  function mesh(parent,geo,c,p,s) {
    const o=new THREE.Mesh(geo,material(c));o.position.set(...p);o.scale.set(...s);parent.add(o);return o;
  }
  const oval=(parent,c,p,s)=>mesh(parent,new THREE.SphereGeometry(1,12,9),c,p,s);
  const cylinder=(parent,c,p,s,top=1,bottom=1)=>mesh(parent,new THREE.CylinderGeometry(top,bottom,1,10),c,p,s);
  const skin=troll?'#839886':elite?'#899fa5':'#b08e65',dark=troll?'#697c69':elite?'#4f626c':'#765739';
  const legs=[],knees=[],feet=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group(),knee=new THREE.Group(),foot=new THREE.Group();
    leg.name=side<0?'CreatureLegL':'CreatureLegR';knee.name=side<0?'CreatureKneeL':'CreatureKneeR';foot.name=side<0?'CreatureFootL':'CreatureFootR';
    leg.position.set(side*.38,.88,0);knee.position.y=-.36;foot.position.set(0,-.32,.08);
    body.add(leg);leg.add(knee);knee.add(foot);legs.push(leg);knees.push(knee);feet.push(foot);
    oval(leg,dark,[0,-.15,0],[.285,.34,.33]);
    oval(knee,dark,[0,-.13,0],[.25,.27,.29]);
    oval(foot,skin,[side*.01,0,.07],[.31,.21,.44]);
  }
  oval(torso,skin,[0,1.58,0],[.78,.97,.56]);
  cylinder(torso,'#75604a',[0,.95,0],[.76,.47,.54],.88,1);
  cylinder(torso,'#4f4235',[0,1.18,0],[.76,.14,.54]);
  mesh(torso,new THREE.BoxGeometry(1,1,1),'#b5a170',[0,1.18,.52],[.2,.14,.065]);
  oval(torso,skin,[0,2.54,.09],[.48,.50,.41]);oval(torso,dark,[0,2.4,.37],[.39,.23,.19]);
  oval(torso,skin,[0,2.55,.46],[.17,.17,.18]);
  for(const side of [-1,1]){
    oval(torso,dark,[side*.46,2.56,.08],[.14,.18,.09]);
    oval(torso,'#efe4be',[side*.20,2.64,.474],[.087,.066,.041]);
    oval(torso,'#292b23',[side*.20,2.64,.51],[.033,.043,.016]);
    oval(torso,dark,[side*.20,2.74,.408],[.151,.050,.095]).rotation.z=side*.11;
    cylinder(torso,'#e4d9b3',[side*.24,2.33,.49],[.05,.14,.045],0,1);
  }
  const freeArm=new THREE.Group();freeArm.name='CreatureFreeArm';freeArm.position.set(-.63,2.04,0);torso.add(freeArm);
  oval(freeArm,skin,[-.15,-.24,.028],[.36,.67,.33]).rotation.z=-.24;
  oval(freeArm,dark,[-.30,-.77,.11],[.28,.35,.26]);
  clubArm.position.set(.63,2.04,0);
  oval(clubArm,skin,[.19,-.32,0],[.30,.56,.31]).rotation.z=.24;
  oval(clubArm,dark,[.34,-.76,.13],[.23,.29,.23]);
  club.position.set(.38,-.78,.17);club.rotation.x=.96;
  cylinder(club,'#694c35',[0,0,.03],[.077,.52,.077]);
  cylinder(club,'#8a6747',[0,.8,.03],[.23,1.2,.23],1,.37);
  oval(club,'#9d7a55',[0,1.39,.03],[.24,.26,.23]);
  for(const [height,size] of [[.57,.14],[1.11,.204]])cylinder(club,'#615244',[0,height,.03],[size,.075,size]);
  if(!troll){
    body.scale.setScalar(elite?.82:.64);
    if(elite){
      oval(torso,'#859aa0',[0,2.76,.10],[.54,.45,.47]);
      mesh(torso,new THREE.BoxGeometry(1,1,1),'#313d43',[0,2.64,.52],[.58,.1,.05]);
      for(const side of [-1,1])oval(torso,'#adbdba',[side*.64,2.14,0],[.35,.20,.40]);
    }else{
      for(const side of [-1,1])oval(body,'#695337',[side*.38,.91,.26],[.10,.10,.08]);
      club.scale.set(.58,.83,.58);
    }
  }else body.scale.setScalar(1.24);
  torso.position.y=1.1;
  for(const child of torso.children)child.position.y-=1.1;
  const impact=new THREE.Mesh(new THREE.RingGeometry(1.28,1.46,48),new THREE.MeshBasicMaterial({color:0xe26040,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide}));
  impact.rotation.x=-Math.PI/2;impact.position.y=.07;root.add(impact);
  const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp,damp=THREE.MathUtils.damp;
  const smooth=value=>{const v=clamp(value,0,1);return v*v*(3-2*v);};
  const turn=(current,target,rate,dt)=>current+Math.atan2(Math.sin(target-current),Math.cos(target-current))*(1-Math.exp(-rate*dt));
  let lastTime=null,lastPhase='',phaseAge=0,gaitPhase=0,gaitWeight=0,motionTime=0,death=0,recoil=0,recoilSide=1,previousWon=false;
  let strikeAge=10,releaseFromCharge=false,lastChargeExact=false;
  function resetMotion(){
    lastTime=null;lastPhase='';phaseAge=0;gaitPhase=0;gaitWeight=0;motionTime=0;death=0;recoil=0;recoilSide=1;previousWon=false;strikeAge=10;releaseFromCharge=false;lastChargeExact=false;
    body.position.set(0,0,0);body.rotation.set(0,0,0);torso.rotation.set(0,0,0);torso.position.set(0,1.1,0);
    clubArm.rotation.set(-.15,0,0);freeArm.rotation.set(0,0,0);club.position.y=-.78;club.rotation.x=.96;
    for(let i=0;i<2;i++){legs[i].rotation.set(0,0,0);knees[i].rotation.set(0,0,0);feet[i].rotation.set(0,0,0);}
    impact.visible=false;
  }
  function react(reaction='hit',strength=1){
    const amount=clamp(Number(strength)||1,.1,2);
    recoil=Math.min(1.2,recoil+amount*(reaction==='block'?.35:.7));
    recoilSide*=-1;
  }
  resetMotion();
  function update(state,t,targetPoint){
    const time=Number.isFinite(t)?t:(lastTime??0);
    const suppliedDt=Number(state?.dt);
    const dt=clamp(state?.dt!==undefined&&Number.isFinite(suppliedDt)?suppliedDt:lastTime===null?1/60:Math.max(0,time-lastTime),0,.1);
    lastTime=time;motionTime+=dt;
    const won=state?.status==='won',lost=state?.status==='lost',phase=state?.phase||'waiting';
    if(previousWon&&!won)resetMotion();
    previousWon=won;
    const windup=!!state?.started&&phase==='windup',opening=phase==='opening',vulnerable=phase==='vulnerable';
    if(phase!==lastPhase){
      if(opening){strikeAge=0;releaseFromCharge=lastPhase==='windup'&&lastChargeExact;}
      phaseAge=0;lastPhase=phase;
    }else phaseAge+=dt;
    strikeAge+=dt;
    const suppliedSpeed=Number(state?.moveSpeed??state?.movementSpeed);
    const speed=!won&&!windup&&Number.isFinite(suppliedSpeed)?Math.max(0,suppliedSpeed):0;
    gaitWeight=damp(gaitWeight,Math.min(1,speed/1.7),9,dt);
    // Advance feet by distance travelled, not an unrelated clock, and settle on stopping.
    if(speed>.01)gaitPhase+=dt*speed/(troll?2.1:elite?1.55:1.3)*Math.PI*2;
    if(targetPoint&&Number.isFinite(targetPoint.x)&&Number.isFinite(targetPoint.z)&&!won){
      const facing=Math.atan2(targetPoint.x-root.position.x,targetPoint.z-root.position.z);
      body.rotation.y=turn(body.rotation.y,facing,windup?3:7,dt);
    }
    death=won?Math.min(1,death+dt/(troll?.85:.65)):0;
    recoil*=Math.exp(-dt*9);
    const breathing=Math.sin(motionTime*(troll?1.9:2.4))*.009*(1-gaitWeight);
    let armX=-.15,armY=0,armZ=.025,lean=0,twist=0,crouch=0,freeX=.04,freeZ=0;
    if(windup){
      const precise=Number.isFinite(state?.windupProgress);
      lastChargeExact=precise;
      const progress=precise?clamp(state.windupProgress,0,1):Math.min(.72,phaseAge/.72);
      const lift=smooth(progress/.48),strike=precise?smooth((progress-.74)/.26):0;
      armX=lerp(lerp(-.15,-1.96,lift),.94,strike);
      armY=lerp(.25*lift,-.14,strike);armZ=.16*lift*(1-strike);
      lean=lerp(-.12*lift,.24,strike);twist=lerp(-.15*lift,.13,strike);
      crouch=.055*lift+.055*strike;freeX=-.32*lift+.48*strike;freeZ=-.22*lift;
    }else if(opening||strikeAge<.6){
      const contact=releaseFromCharge?1:smooth(strikeAge/.14);
      const recover=opening?0:smooth((strikeAge-.19)/.41);
      armX=lerp(lerp(-1.82,.96,contact),-.15,recover);
      armY=lerp(-.14,0,recover);lean=lerp(.24*contact,0,recover);twist=lerp(.13,0,recover);
      crouch=.11*(1-recover);freeX=.26*(1-recover);freeZ=-.16*(1-recover);
    }else if(vulnerable){
      armX=-.44;lean=.12;twist=-.12;crouch=.045;freeZ=-.25;
    }
    const settle=smooth(death),alive=1-settle;
    const stagger=Math.sin(motionTime*19)*recoil*.025;
    body.rotation.z=lerp(Math.sin(gaitPhase)*.026*gaitWeight+recoilSide*recoil*.055,1.27,settle);
    body.position.y=lerp(-crouch+Math.abs(Math.sin(gaitPhase*2))*.025*gaitWeight,.28,settle);
    torso.rotation.x=(lean-recoil*.10)*alive;
    torso.rotation.y=(twist+Math.sin(gaitPhase)*.035*gaitWeight)*alive;
    torso.rotation.z=stagger*alive;
    torso.position.y=1.1+breathing*alive;
    torso.position.z=recoil*.025*alive;
    // The left arm balances the heavy club instead of staying welded to the torso.
    freeArm.rotation.x=damp(freeArm.rotation.x,(freeX-Math.sin(gaitPhase)*.20*gaitWeight)*alive,14,dt);
    freeArm.rotation.z=damp(freeArm.rotation.z,freeZ*alive,14,dt);
    const swingTarget=lerp(armX+Math.sin(gaitPhase)*.09*gaitWeight,.26,settle);
    clubArm.rotation.x=windup&&lastChargeExact||opening&&releaseFromCharge?swingTarget:damp(clubArm.rotation.x,swingTarget,18,dt);
    clubArm.rotation.y=damp(clubArm.rotation.y,armY*alive,18,dt);
    clubArm.rotation.z=damp(clubArm.rotation.z,(armZ+recoilSide*recoil*.035)*alive,18,dt);
    club.position.y=damp(club.position.y,vulnerable&&!won?.95:-.78,8,dt);
    club.rotation.x=damp(club.rotation.x,vulnerable&&!won?1.58:.96,10,dt);
    for(let i=0;i<2;i++){
      const p=gaitPhase+i*Math.PI,swing=Math.max(0,Math.sin(p));
      const hip=(-Math.cos(p)*.29*gaitWeight+crouch*.8)*alive;
      const knee=(swing*.42*gaitWeight+crouch*1.7)*alive;
      legs[i].rotation.x=damp(legs[i].rotation.x,hip,18,dt);
      knees[i].rotation.x=damp(knees[i].rotation.x,knee,18,dt);
      feet[i].rotation.x=damp(feet[i].rotation.x,-hip-knee+swing*.11*gaitWeight,18,dt);
    }
    impact.visible=!!state?.started&&windup&&!won&&!lost;
    impact.material.opacity=.68+.12*Math.sin(motionTime*6);
    if(targetPoint&&Number.isFinite(targetPoint.x)&&Number.isFinite(targetPoint.z))impact.position.set(targetPoint.x-root.position.x,.07,targetPoint.z-root.position.z);
  }
  return {root,update,react,resetMotion};
}
