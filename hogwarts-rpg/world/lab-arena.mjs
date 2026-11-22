import * as THREE from 'three';
import {createAvatar, createController} from './player.mjs';
import {equipmentStorageKey, loadEquipment} from './wardrobe.mjs';
import {buildCreature} from './chapter-creature.mjs';

const HERO_COLORS = {harry:'#ab483c',ron:'#aa6b36',hermione:'#cba861',neville:'#6eac86',george:'#b78bd1'};
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

function releaseObject(object) {
  const geometries=new Set(), materials=new Set(), textures=new Set();
  object.traverse(child=>{
    if(child.geometry)geometries.add(child.geometry);
    for(const material of Array.isArray(child.material)?child.material:child.material?[child.material]:[]) {
      materials.add(material);
      if(material.map)textures.add(material.map);
    }
  });
  geometries.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());
}

/** A real third-person arena. Combat values remain owned by lab-rules.mjs. */
export function createLabArena({canvas,onAction,joystick,jumpButton,actionButton}) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.25;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#0a1822');
  scene.fog=new THREE.FogExp2('#0d202a',.023);
  const camera=new THREE.PerspectiveCamera(52,1,.1,110);
  const environment=new THREE.Group();scene.add(environment);
  const materialCache=new Map();
  const material=(color,options={})=>{
    const key=color+JSON.stringify(options);
    if(!materialCache.has(key))materialCache.set(key,new THREE.MeshStandardMaterial({color,roughness:.88,...options}));
    return materialCache.get(key);
  };
  function mesh(geometry,mat,x=0,y=0,z=0,parent=environment) {
    const item=new THREE.Mesh(geometry,mat);item.position.set(x,y,z);item.receiveShadow=true;parent.add(item);return item;
  }
  function box(x,y,z,w,h,d,color,options={}) {
    const item=mesh(new THREE.BoxGeometry(w,h,d),material(color,options),x,y,z);item.castShadow=true;return item;
  }
  function ring(radius,width,color,y=.025,opacity=1) {
    const item=mesh(new THREE.RingGeometry(radius-width/2,radius+width/2,96),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}),0,y,0);
    item.rotation.x=-Math.PI/2;return item;
  }
  scene.add(new THREE.HemisphereLight('#bce9ee','#354747',2.25));
  const moonLight=new THREE.DirectionalLight('#b3d7ee',2.7);moonLight.position.set(-8,15,6);
  moonLight.castShadow=true;moonLight.shadow.mapSize.set(1024,1024);
  Object.assign(moonLight.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:.1,far:45});
  moonLight.shadow.bias=-.0009;scene.add(moonLight);
  const warmLight=new THREE.DirectionalLight('#d6b17f',.9);warmLight.position.set(6,5,-8);scene.add(warmLight);

  // The arena sits inside a complete stone courtyard, beyond the movement boundary.
  box(0,-.25,0,23,.5,25,'#34434a');
  const tiles=[[],[],[]];
  for(let row=-5;row<=5;row++)for(let column=-5;column<=5;column++)tiles[Math.abs(row*7+column*3)%3].push([column*2.02,row*2.02]);
  for(let shade=0;shade<tiles.length;shade++) {
    const paving=new THREE.InstancedMesh(new THREE.BoxGeometry(1.98,.035,1.98),material(['#425159','#3e4e54','#394b52'][shade]),tiles[shade].length);
    const matrix=new THREE.Matrix4();
    tiles[shade].forEach(([x,z],index)=>paving.setMatrixAt(index,matrix.makeTranslation(x,.002,z)));
    paving.receiveShadow=true;environment.add(paving);
  }
  ring(6.1,.095,'#baa06b',.035,.62);ring(5.75,.025,'#bfa66d',.04,.65);
  ring(4.8,.045,'#62d2c2',.045,.48);ring(1.25,.045,'#baa06b',.05,.8);
  const centerRune=ring(.85,.025,'#71d8d1',.053,.8);
  for(let i=0;i<24;i++){
    const angle=i*Math.PI/12,x=Math.sin(angle)*5.95,z=Math.cos(angle)*5.95;
    const rune=mesh(new THREE.PlaneGeometry(.11,i%3===0?.46:.22),material('#bea56d',{emissive:'#6e603b',emissiveIntensity:.3}),x,.055,z);
    rune.rotation.set(-Math.PI/2,0,-angle);rune.receiveShadow=false;
  }
  for(const side of [-1,1]){
    box(side*10,.55,0,1,1.1,24,'#283a42');
    box(side*10,1.12,0,1.18,.18,24,'#637078');
    for(const z of [-10,-5,0,5,10]){
      box(side*9,2.8,z,.72,5.6,.72,'#526269');
      box(side*9,.35,z,1.22,.7,1.22,'#68777b');
      box(side*9,5.6,z,1.16,.3,1.16,'#788588');
      box(side*9,4.85,z,.94,.18,.94,'#899185');
      if(z<10)box(side*9,5.76,z+2.5,.56,.46,5,'#516169');
    }
    const banner=box(side*8.54,3.8,-4.9,.08,2.3,1.45,side<0?'#713f3c':'#355856');
    banner.rotation.y=side<0?.12:-.12;
    box(side*8.48,3.9,-4.9,.10,.75,.55,'#bba46e');
  }
  box(0,3.7,-12,21,7.4,1.5,'#3d505b');
  box(0,7.45,-12,22,.4,1.8,'#637780');
  box(0,1,-10.6,5,2,.7,'#455962');
  box(0,3.7,-11.12,3.6,5.7,.3,'#1d3039');
  box(0,3.7,-10.91,2.6,5.3,.15,'#203b45');
  for(const x of [-7,-4,4,7]) {
    box(x,4.5,-11.15,1.36,3.1,.25,'#1b3039');
    box(x,4.55,-10.99,.92,2.65,.08,'#6d786d',{emissive:'#c9a56b',emissiveIntensity:.55});
    box(x,4.55,-10.91,.09,2.7,.08,'#2a393c');
    box(x,4.45,-10.9,.96,.1,.09,'#2a393c');
  }
  for(let x=-10;x<=10;x+=2)box(x,7.9,-12,.9,.7,1.65,'#536b76');
  for(const x of [-9.8,9.8]) {
    const tower=mesh(new THREE.CylinderGeometry(1.5,1.7,13,8),material('#354e5d'),x,6.3,-15);tower.castShadow=true;
    mesh(new THREE.ConeGeometry(2.1,5,8),material('#223a4b'),x,15.25,-15);
    for(const y of [5,8,11])box(x, y,-13.48,.35,.85,.05,'#7a8170',{emissive:'#e0b875',emissiveIntensity:.8});
  }
  const moon=mesh(new THREE.SphereGeometry(1.45,24,16),new THREE.MeshBasicMaterial({color:'#cededc'}),11,21,-39);
  const moonHalo=mesh(new THREE.SphereGeometry(1.8,24,16),new THREE.MeshBasicMaterial({color:'#8cc8d1',transparent:true,opacity:.10,depthWrite:false}),11,21,-39);
  const starPositions=[];
  for(let i=0;i<110;i++){
    const theta=i*2.39996323,elevation=.18+((i*37)%101)/101*1.05;
    starPositions.push(Math.cos(theta)*48*Math.cos(elevation),Math.sin(elevation)*48,Math.sin(theta)*48*Math.cos(elevation));
  }
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  environment.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#ccdfda',size:.09,transparent:true,opacity:.7})));

  const flames=[];
  for(const [x,z] of [[-7,-6],[7,-6],[-7,6],[7,6]]) {
    box(x,.6,z,.55,1.2,.55,'#283940');box(x,1.3,z,.82,.2,.82,'#71716a');
    const bowl=mesh(new THREE.CylinderGeometry(.36,.15,.25,8),material('#897955',{metalness:.4}),x,1.5,z);
    const flame=mesh(new THREE.OctahedronGeometry(.25),material('#ffd294',{emissive:'#ffad55',emissiveIntensity:3}),x,1.85,z);
    flame.scale.y=1.7;flames.push(flame);
    const light=new THREE.PointLight('#ffb55e',6,8,2);light.position.set(x,2,z);scene.add(light);
    bowl.castShadow=true;
  }
  const world={spawn:[0,4],bounds:[-7.1,7.1,-8.2,8.2],walls:[],landmarks:{npc:[0,-2]},facing:0};
  const dressHero = id => createAvatar({variant:id,isPlayer:true,color:HERO_COLORS[id]||'#ab483c',equipment:loadEquipment(id)});
  let heroId='harry',avatar=dressHero(heroId);scene.add(avatar.root);
  function refreshWardrobe(event) {
    if(event.key===null || event.key===equipmentStorageKey(heroId)) avatar.setEquipment(loadEquipment(heroId));
  }
  window.addEventListener('storage',refreshWardrobe);
  let creatureKind='troll',creature=buildCreature(creatureKind);scene.add(creature.root);creature.root.position.set(0,0,-2);
  creature.root.traverse(child=>{if(child.isMesh)child.castShadow=true;});
  const makeController=()=>createController({camera,element:canvas,avatar,joystick,jumpButton,actionButton,onAction:type=>onAction?.(['primary','cast','context','interact'].includes(type)?'bolt':type)});
  let controller=makeController();
  controller.setWorld(world);
  const shield=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:'#75f3dc',wireframe:true,transparent:true,opacity:.17,depthWrite:false}));
  shield.scale.set(.82,1.17,.82);scene.add(shield);shield.visible=false;
  const guardRing=ring(.9,.06,'#7fe9d4',.07,.75);guardRing.visible=false;
  let elapsed=0,motionTime=0,enabled=true,disposed=false,lastBattle=null,lastEvent=0,lastAuto=false,enemyStrike=0;
  let aimTime=0,shieldReady=false,shieldWeight=0,pendingOutgoing=0,pendingIncoming=0,wasWindup=false;
  const windupPoint=new THREE.Vector3(),wandPoint=new THREE.Vector3();
  const effects=[], cues=[];

  function resize() {
    if(disposed)return;
    const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
    if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio()))renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function setHero(nextId) {
    if(nextId===heroId)return;
    clearEffects();avatar.resetMotion?.();
    heroId=nextId;const next=dressHero(heroId);
    controller.setAvatar(next);scene.remove(avatar.root);avatar.dispose();avatar=next;scene.add(avatar.root);
  }
  function setEnemy(enemy) {
    const type=typeof enemy==='string'?enemy:enemy?.type;
    const nextKind=type==='magic'?'normal':type==='mixed'?'elite':'troll';
    if(nextKind===creatureKind)return;
    clearEffects();
    const position=creature.root.position.clone();scene.remove(creature.root);releaseObject(creature.root);
    creatureKind=nextKind;creature=buildCreature(creatureKind);creature.root.position.copy(position);scene.add(creature.root);
    creature.root.traverse(child=>{if(child.isMesh)child.castShadow=true;});
  }
  function clearEffects() {
    for(const effect of effects){scene.remove(effect.root);releaseObject(effect.root);}effects.length=0;
    cues.length=0;pendingOutgoing=0;pendingIncoming=0;shieldReady=false;shieldWeight=0;
  }
  function reset() {
    // A new controller also clears the old dodge timer and any captured input.
    controller.dispose();controller=makeController();controller.setWorld(world);
    avatar.root.rotation.z=0;creature.root.position.set(0,0,-2);
    lastBattle=null;lastEvent=0;lastAuto=false;wasWindup=false;enemyStrike=0;aimTime=0;motionTime=0;
    avatar.resetMotion?.();creature.resetMotion?.();controller.setCombat?.({active:false,guarded:false,downed:false});
    shield.visible=false;guardRing.visible=false;clearEffects();
  }
  // Presentation is queued against the avatar's authored release moment. Numerical
  // combat remains in the fixed-step rules; these cues only render its result.
  function queue(delay, run) { cues.push({delay:Math.max(0,delay),run}); }
  function advanceCues(dt) {
    if(dt<=0)return;
    const due=[];
    for(let index=cues.length-1;index>=0;index--){
      cues[index].delay-=dt;
      if(cues[index].delay<=0){due.unshift(cues[index].run);cues.splice(index,1);}
    }
    for(const run of due)run();
  }
  function projectile(from,to,color,large=false,{onImpact,target}={}) {
    const root=new THREE.Group();root.name='SpellProjectile';scene.add(root);
    const orb=new THREE.Mesh(new THREE.SphereGeometry(large?.12:.065,8,6),new THREE.MeshBasicMaterial({color}));root.add(orb);
    const trail=new THREE.Mesh(new THREE.CylinderGeometry(.012,large?.065:.035,.65,6),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.62,depthWrite:false}));
    trail.rotation.x=Math.PI/2;trail.position.z=.29;root.add(trail);root.position.copy(from);root.lookAt(to);
    effects.push({root,from:from.clone(),to:to.clone(),age:0,life:clamp(from.distanceTo(to)/24,.095,.32),kind:'bolt',color,onImpact,target});
  }
  function burst(position,color) {
    const root=new THREE.Group();root.position.copy(position);scene.add(root);
    for(let i=0;i<9;i++){
      const spark=new THREE.Mesh(new THREE.OctahedronGeometry(.035),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
      const angle=i*2.39996;spark.userData.direction=new THREE.Vector3(Math.cos(angle),((i*3)%7)/7-.25,Math.sin(angle));root.add(spark);
    }
    effects.push({root,age:0,life:.45,kind:'burst'});
  }
  function number(amount,position,color) {
    if(!Number.isFinite(amount)||amount<=0)return;
    const surface=document.createElement('canvas');surface.width=192;surface.height=96;
    const ctx=surface.getContext('2d');if(!ctx)return;
    ctx.font='bold 55px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=6;ctx.strokeStyle='#10242a';ctx.strokeText(String(Math.round(amount)),96,48);ctx.fillStyle=color;ctx.fillText(String(Math.round(amount)),96,48);
    const texture=new THREE.CanvasTexture(surface);texture.colorSpace=THREE.SRGBColorSpace;
    const root=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));root.scale.set(1.5,.75,1);root.position.copy(position);scene.add(root);
    effects.push({root,age:0,life:1,kind:'number'});
  }
  function cast(action,event={}) {
    if(action==='dodge'){
      if(lastAuto)avatar.playAction?.('dodge');
      else controller.dodge();
      return;
    }
    if(!['shield','bolt','burst'].includes(action))return;
    const timing=controller.cast(action)||{duration:action==='burst'?.72:.56,release:action==='burst'?.24:action==='shield'?.21:.14};
    aimTime=Math.max(aimTime,timing.duration+.08);
    if(action==='shield'){
      shieldReady=false;
      queue(timing.release,()=>{
        shieldReady=true;
        burst(avatar.root.position.clone().add(new THREE.Vector3(0,1,0)),'#7fffe0');
      });
      return;
    }
    pendingOutgoing++;
    queue(timing.release,()=>{
      avatar.root.updateMatrixWorld(true);
      const origin=avatar.getWandTip?avatar.getWandTip(wandPoint).clone():avatar.getCastOrigin?avatar.getCastOrigin():avatar.root.localToWorld(new THREE.Vector3(.25,1.1,-.25));
      const target=()=>creature.root.position.clone().add(new THREE.Vector3(0,creatureKind==='troll'?1.85:1.2,0));
      projectile(origin,target(),action==='burst'?'#eab0ef':'#b3f4e5',action==='burst',{
        target,onImpact:()=>{
          pendingOutgoing=Math.max(0,pendingOutgoing-1);
          creature.react?.('hit',event.crit?1:.65);
          number(event.amount,creature.root.position.clone().add(new THREE.Vector3(.2,creatureKind==='troll'?3.1:2.1,0)),event.crit?'#ffe28f':'#d1fff5');
        }
      });
    });
  }
  function receiveHit(event){
    const impact=()=>{
      pendingIncoming=Math.max(0,pendingIncoming-1);
      const blocked=event.absorbed>0 && event.amount<=0;
      avatar.playAction?.(blocked?'block':'hit');
      number(event.amount,avatar.root.position.clone().add(new THREE.Vector3(-.3,2.3,0)),'#ffa69a');
      burst(avatar.root.position.clone().add(new THREE.Vector3(0,blocked?1:.55,0)),blocked?'#91ffde':'#ffb077');
    };
    pendingIncoming++;
    if(event.school==='magic'){
      const target=()=>avatar.root.position.clone().add(new THREE.Vector3(0,1,0));
      projectile(creature.root.position.clone().add(new THREE.Vector3(0,1.65,0)),target(),'#e69ad7',true,{target,onImpact:impact});
    }else queue(.02,impact);
  }
  function consumeEvents(battle) {
    for(const event of battle?.events||[]) {
      if(event.id<=lastEvent)continue;lastEvent=event.id;
      if(event.type==='cast')cast(event.action,event);
      else if(event.type==='shield'||event.type==='dodge')cast(event.type,event);
      else if(event.type==='enemy-hit'){
        enemyStrike=.34;receiveHit(event);
      }else if(event.type==='enemy-miss')enemyStrike=.34;
    }
  }
  function update(dt,battle,{auto=false,paused=false}={}) {
    if(disposed)return;
    dt=clamp(Number(dt)||0,0,.08);elapsed+=dt;
    const combatDt=paused?0:dt;motionTime+=combatDt;
    const active=battle?.status==='active';
    const newlyStarted=battle&&battle!==lastBattle;
    if(newlyStarted){lastBattle=battle;lastEvent=0;setEnemy(battle.enemy);wasWindup=false;creature.resetMotion?.();}
    if(auto&&(!lastAuto||newlyStarted)){
      avatar.root.position.set(0,0,3);avatar.root.rotation.y=0;creature.root.position.set(0,0,1);
    }
    lastAuto=auto;
    const windup=active&&battle.enemyPhase==='windup';
    if(windup&&!wasWindup)windupPoint.copy(avatar.root.position);
    let creatureSpeed=0;
    if(active&&!paused&&!auto&&!windup){
      const direction=new THREE.Vector3().subVectors(avatar.root.position,creature.root.position);direction.y=0;
      const separation=direction.length();
      if(separation>2.5){
        const travel=Math.min(separation-2.5,combatDt*1.7);
        creature.root.position.addScaledVector(direction.normalize(),travel);
        creatureSpeed=combatDt>0?travel/combatDt:0;
      }
    }
    // Trigger the motion before advancing the avatar, so VFX release and hand
    // movement share the same clock even on low-refresh devices.
    if(!paused)consumeEvents(battle);
    const playerDown=battle?.status==='lost'&&pendingIncoming===0;
    controller.setCombat?.({active:active||pendingOutgoing>0,guarded:shieldReady&&Number(battle?.shield)>0,downed:playerDown});
    controller.setEnabled(enabled&&!paused&&!auto&&(!battle||active));
    if(!paused)controller.update(dt);
    const pose=controller.getPose();
    if(combatDt>0&&(auto||aimTime>0)){
      const targetYaw=Math.atan2(avatar.root.position.x-creature.root.position.x,avatar.root.position.z-creature.root.position.z);
      const difference=Math.atan2(Math.sin(targetYaw-avatar.root.rotation.y),Math.cos(targetYaw-avatar.root.rotation.y));
      avatar.root.rotation.y+=difference*(1-Math.exp(-(pose.moving?7:13)*combatDt));
    }
    advanceCues(combatDt);
    enemyStrike=Math.max(0,enemyStrike-combatDt);aimTime=Math.max(0,aimTime-combatDt);
    const phase=windup?'windup':enemyStrike>0?'opening':'waiting';
    const presentationStatus=battle?.status==='won'&&pendingOutgoing>0?'active':battle?.status;
    creature.update({status:presentationStatus,started:active,phase,dt:combatDt,moveSpeed:creatureSpeed,
      windupProgress:windup?clamp(1-battle.enemyWindup/Math.max(.05,battle.enemy.windup),0,1):0},motionTime,windup?windupPoint:avatar.root.position);
    const reachRing=creature.root.children.find(child=>child.geometry?.type==='RingGeometry');
    if(reachRing&&windup){
      if(battle.enemy?.type!=='magic'){
        reachRing.position.set(0,.07,0);reachRing.scale.setScalar((battle.enemy?.range||3)/1.46);
      }else{
        reachRing.scale.setScalar(.58);
        reachRing.position.set(avatar.root.position.x-creature.root.position.x,.07,avatar.root.position.z-creature.root.position.z);
      }
    }
    wasWindup=windup;
    // The joint rig owns evasion, landing and collapse; root motion stays physical.
    avatar.root.rotation.z=THREE.MathUtils.damp(avatar.root.rotation.z,0,8,combatDt);
    const shieldTarget=Number(battle?.shield)>0&&shieldReady&&active?1:0;
    shieldWeight=THREE.MathUtils.damp(shieldWeight,shieldTarget,shieldTarget?14:8,combatDt);
    shield.visible=shieldWeight>.015;shield.position.copy(avatar.root.position).y+=.9;
    const shieldScale=.75+.25*shieldWeight;
    shield.scale.set(.82*shieldScale,1.17*shieldScale,.82*shieldScale);
    shield.rotation.y=motionTime*.3;shield.material.opacity=shieldWeight*(.13+.025*Math.sin(motionTime*3));
    guardRing.visible=shield.visible;guardRing.material.opacity=.65*shieldWeight;
    guardRing.position.set(avatar.root.position.x,.07,avatar.root.position.z);
    for(let index=effects.length-1;index>=0;index--){
      const effect=effects[index];effect.age+=combatDt;
      const progress=Math.min(1,effect.age/effect.life);
      if(effect.kind==='bolt'){
        if(effect.target)effect.to.copy(effect.target());
        effect.root.position.lerpVectors(effect.from,effect.to,progress);
        effect.root.lookAt(effect.to);
      }else if(effect.kind==='number'){effect.root.position.y+=combatDt*.65;effect.root.material.opacity=1-progress;}
      else for(const spark of effect.root.children){spark.position.copy(spark.userData.direction).multiplyScalar(progress*.7);spark.material.opacity=1-progress;}
      if(progress>=1){
        scene.remove(effect.root);releaseObject(effect.root);effects.splice(index,1);
        if(effect.kind==='bolt')burst(effect.to,effect.color||'#bfeee3');
        effect.onImpact?.();
      }
    }
    for(let index=0;index<flames.length;index++){
      const flame=flames[index];flame.scale.y=1.65+Math.sin(elapsed*7+index*1.8)*.25;flame.rotation.y=elapsed*.5+index;
    }
    centerRune.material.opacity=.5+.2*Math.sin(elapsed*1.2);moonHalo.scale.setScalar(1+.015*Math.sin(elapsed*.3));
    renderer.render(scene,camera);
  }
  function dispose() {
    if(disposed)return;disposed=true;observer.disconnect();controller.dispose();clearEffects();
    window.removeEventListener('storage',refreshWardrobe);
    scene.remove(avatar.root);avatar.dispose();releaseObject(scene);renderer.dispose();
  }
  return {update,setHero,setEnemy,reset,cast,dispose,
    getDistance:()=>Math.hypot(avatar.root.position.x-creature.root.position.x,avatar.root.position.z-creature.root.position.z),
    getPose:()=>controller.getPose(),
    setEnabled:value=>{enabled=Boolean(value);controller.setEnabled(enabled);}
  };
}
