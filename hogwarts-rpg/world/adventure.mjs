import * as THREE from 'three';
import {createOpening} from './opening.mjs';
import {createSelectionStage} from './selection-stage.mjs';
import {createWorld} from './world.mjs';
import {createAvatar,createController} from './player.mjs';
import {equipmentStorageKey,loadEquipment,normalizeEquipment,supportsWardrobe} from './wardrobe.mjs';
import {createProp} from './props.mjs';
import {MISSIONS,SPEECH} from './missions.mjs';
import {createChapterJourney} from './chapter-journey.mjs';
import {chapterStages,arrivalPoint} from './chapter-route.mjs';
import {SCENES} from '../js/magic/rpg-story.mjs';
import {CHARACTERS} from '../js/magic/rpg-catalog.mjs';

const names = new Map(CHARACTERS.map(p=>[p.id,p.name]));
const byId = id=>document.getElementById(id);
const lerp = THREE.MathUtils.lerp;
function release(node) {
  const geometry = new Set(),materials = new Set(),textures = new Set();
  node.traverse(obj=>{
    if(obj.geometry)geometry.add(obj.geometry);
    for(const m of [obj.material].flat()) if(m){materials.add(m);if(m.map)textures.add(m.map);}
  });
  geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  node.removeFromParent();
}
function nameTag(text, ally=false) {
  const c=document.createElement('canvas'),ctx=c.getContext('2d');
  c.width=384;c.height=72;
  ctx.font='600 32px "PingFang SC",sans-serif';
  const w=Math.min(380,ctx.measureText(text).width+32);
  ctx.fillStyle=ally?'#143947dc':'#1c211cd9';ctx.beginPath();ctx.roundRect((384-w)/2,8,w,54,8);ctx.fill();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=ally?'#bbf4ff':'#fff3d0';ctx.fillText(text,192,35,352);
  const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,transparent:true,depthWrite:false,toneMapped:false}));
  sprite.scale.set(3.48,.65,1);sprite.position.y=2.39;return sprite;
}
function beacon() {
  const g=new THREE.Group(),m=new THREE.MeshBasicMaterial({color:0xf6d389,transparent:true,opacity:.84,depthWrite:false});
  const circle=new THREE.Mesh(new THREE.RingGeometry(.54,.61,36),m);circle.rotation.x=-Math.PI/2;circle.position.y=.045;g.add(circle);
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.125),new THREE.MeshBasicMaterial({color:0xffdd87,toneMapped:false}));
  gem.position.y=2.78;gem.scale.y=1.42;g.add(gem);g.userData.gem=gem;return g;
}
function sound(note) {
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    const ctx=sound.context||(sound.context=new Audio());if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    const tone=ctx.createOscillator(),env=ctx.createGain(),t=ctx.currentTime;
    tone.type='sine';tone.frequency.setValueAtTime(note,t);tone.frequency.exponentialRampToValueAtTime(note*1.48,t+.18);
    env.gain.setValueAtTime(.0001,t);env.gain.exponentialRampToValueAtTime(.055,t+.02);env.gain.exponentialRampToValueAtTime(.0001,t+.4);
    tone.connect(env);env.connect(ctx.destination);tone.start();tone.stop(t+.42);
  }catch{}
}
export function createAdventure({onChoice,onPose,onCheckpoint,onChapterPose,onChapterAction,say,isPaused}) {
  const canvas=byId('world'),radar=byId('radar'), map=radar.getContext('2d');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(56,1,.08,150);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  let equipment=loadEquipment('base');
  let avatar=createAvatar({name:'新生',variant:'base',isPlayer:true,color:0x497263,equipment});
  scene.add(avatar.root);
  const control=createController({camera,element:canvas,avatar,
    joystick:byId('joystick'),jumpButton:byId('jump'),actionButton:byId('action'),onAction:interact});
  let world,area,stageId='',stepIndex=-1,beatIndex=0,beats=[],finished=false,sessionKey,playerId,selfCampaign;
  let targets=[],npcs=[],scenery=[],carried=null,nearest=null,fx=null,busy=false;
  let t=0,last=performance.now(),tick=0,lastSave=0,lastPos=null,token=0;
  let crossingLock=0,sceneEntered=0,travelMemo=null;
  let journey=null,heroId=null,chapterKey='',selectionStage=null,opening=null;
  const peers=new Map();
  const viewDir=new THREE.Vector3();
  const tagPosition=new THREE.Vector3(),tagParentScale=new THREE.Vector3();
  function sizeTag(tag){
    tag.getWorldPosition(tagPosition);
    const depth=tagPosition.sub(camera.position).dot(viewDir);
    tag.visible=depth>1.0 && depth<31;
    if(!tag.visible)return;
    tag.parent.getWorldScale(tagParentScale);
    const unitsPerPixel=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5)/Math.max(1,canvas.clientHeight);
    const h=Math.min(.65,unitsPerPixel*27)/tagParentScale.y;
    tag.scale.set(h*5.33,h,1);
  }
  function makeCarry(kind) {
    if(carried){release(carried);carried=null;}
    if(!kind)return;
    carried=createProp(kind);carried.scale.setScalar(kind==='toad'?.55:.62);
    carried.position.set(.29,.76,-.39);avatar.root.add(carried);
  }
  function clearMarkers() {
    for(const obj of scenery)release(obj);scenery=[];targets=[];nearest=null;
    byId('callout').hidden=true;
  }
  function clearNPCs(){for(const n of npcs){release(n.tag);n.model.dispose();n.model.root.removeFromParent();}npcs=[];}
  function clearPeers(){for(const n of peers.values()){release(n.tag);n.model.dispose();n.model.root.removeFromParent();}peers.clear();}
  function setupNPCs() {
    clearNPCs();const spots=new Map();
    for(const step of MISSIONS[stageId])for(const b of step)for(const a of b.targets){
      if(a.who&&!spots.has(a.who))spots.set(a.who,a.spot);
    }
    for(const [who,spot] of spots){
      const xy=world.landmarks[spot], model=createAvatar({variant:who,name:names.get(who)||who});
      const tag=nameTag(names.get(who)||who);
      model.root.add(tag);model.root.position.set(xy[0],0,xy[1]);model.root.rotation.y=Math.PI;
      area.add(model.root);npcs.push({who,spot,model,tag});
    }
  }
  function currentTargets(){
    clearMarkers();
    if(finished){byId('objective').textContent='第一学年已完成';byId('guidance').textContent='自由探索，或打开手记回顾这一年的选择。';byId('range').textContent='自由探索';return;}
    const beat=beats[beatIndex];
    byId('objective').textContent=beat.goal;
    byId('guidance').textContent=beat.targets.some(x=>x.kind==='spell')?'靠近目标后按 F 挥杖，手机点「施法」。':'跟随金色标记；靠近后即可互动。';
    for(const a of beat.targets){
      const xy=world.landmarks[a.spot], marker=beacon();
      marker.position.set(xy[0],0,xy[1]);area.add(marker);scenery.push(marker);
      let prop=null;if(a.prop){prop=createProp(a.prop);prop.position.set(xy[0]+(a.who ? .58 : 0),0,xy[1]);area.add(prop);scenery.push(prop);}
      targets.push({...a,x:xy[0],z:xy[1],marker,propNode:prop});
    }
    if(stageId==='platform' && stepIndex===0 && beatIndex===1)makeCarry('trunk');
    if(stageId==='lake' && stepIndex===1 && beatIndex===1)makeCarry('toad');
  }
  function configure(campaign,memberId,identity,travel) {
    if(journey){journey.dispose();journey=null;chapterKey='';stageId='';replaceHero(null);}
    selfCampaign=campaign;playerId=memberId;
    const sceneIndex=Math.min(campaign.sceneIndex,SCENES.length-1);
    const id=SCENES[sceneIndex].id, different=sessionKey!==identity || id!==stageId;
    if(!different && stepIndex===campaign.stepIndex && finished===campaign.finished)return;
    token++;if(fx?.line)release(fx.line);fx=null;busy=false;makeCarry(null);crossingLock=t+.6;
    if(different){
      clearMarkers();clearNPCs();clearPeers();if(area?.userData.practice)release(area.userData.practice);world?.dispose();area?.removeFromParent();
      area=new THREE.Group();scene.add(area);world=createWorld(id,area);
      sessionKey=identity;stageId=id;sceneEntered=t;
      setupNPCs();
      const b=world.bounds;let restore=null;
      if(travel?.sceneId===id && typeof travel.x==='number' && Number.isFinite(travel.z) && travel.x>b[0] && travel.x<b[1] && travel.z>b[2] && travel.z<b[3]) restore={x:travel.x,z:travel.z,y:0,yaw:travel.yaw};
      control.setWorld(world,restore);lastPos=null;
      if(id==='platform'){
        // A low unpacked case gives new students a place to practice jumping.
        const trunk=createProp('trunk');trunk.position.set(2.15,0,4.7);trunk.scale.set(.98,.72,.9);area.add(trunk);area.userData.practice=trunk;
        world.walls.push({x:2.15,z:4.7,w:.92,d:.58,h:.43});
      }
      const trans=byId('transition');trans.classList.add('lit');requestAnimationFrame(()=>trans.classList.remove('lit'));
    }
    finished=campaign.finished;stepIndex=campaign.stepIndex;
    if(id==='lake' && stepIndex>=1 && world.boatLanding){
      world.setBoatRide(1);
      if(control.getPose().z>-7.1)control.setWorld(world,world.boatLanding);
    }
    beats=MISSIONS[id][stepIndex]||[];beatIndex=0;
    if(!finished && travel?.sceneId===id && travel.stepIndex===stepIndex && travel.beatIndex>0 && travel.beatIndex<beats.length)beatIndex=travel.beatIndex;
    canvas.dataset.scene=id;canvas.dataset.step=String(stepIndex);canvas.dataset.beat=String(beatIndex);
    byId('chapter').textContent='第一卷 · 魔法石　/　第 '+(sceneIndex+1)+' 关';
    byId('place').textContent=SCENES[sceneIndex].place;
    byId('quest-type').textContent=finished?'学年完成':'当前任务';
    currentTargets();savePoint();
  }
  function replaceHero(hero){
    if(heroId===hero)return;
    const variant=hero||'base';
    equipment=supportsWardrobe(variant)?loadEquipment(variant):undefined;
    const next=createAvatar({name:hero?(names.get(hero)||hero):'新生',variant,isPlayer:true,color:hero?undefined:0x497263,equipment});
    control.setAvatar(next);scene.add(next.root);avatar.dispose();avatar=next;heroId=hero;
  }
  window.addEventListener('wardrobe-change',({detail})=>{
    if(!detail || detail.variant!==(heroId||'base') || !supportsWardrobe(detail.variant))return;
    equipment=normalizeEquipment(detail.variant,detail.equipment);
    avatar.setEquipment(equipment);
  });
  window.addEventListener('storage',event=>{
    const variant=heroId||'base';
    if(!supportsWardrobe(variant)||(event.key!==null && event.key!==equipmentStorageKey(variant)))return;
    equipment=loadEquipment(variant);
    avatar.setEquipment(equipment);
  });
  function configureChapter(data){
    if(!chapterStages[data.stage])return;
    replaceHero(data.hero);
    const key=JSON.stringify([data.identity,data.playerId,data.stage,data.instanceKey||'']);
    if(journey&&key===chapterKey){
      if(Object.hasOwn(data,'instance'))journey.setEncounter(data.instance,data);
      else journey.setFlags(data);
      return;
    }
    token++;if(fx?.line)release(fx.line);fx=null;busy=false;makeCarry(null);
    journey?.dispose();journey=null;
    clearMarkers();clearNPCs();clearPeers();
    if(area?.userData.practice)release(area.userData.practice);
    world?.dispose();area?.removeFromParent();
    area=new THREE.Group();scene.add(area);
    world=createWorld(chapterStages[data.stage].map,area);
    control.setWorld(world,arrivalPoint(data,world));lastPos=null;stageId=data.stage;playerId=data.playerId;
    stepIndex=-1;sessionKey=null;selfCampaign=null;chapterKey=key;
    canvas.dataset.scene=data.stage;canvas.dataset.step='0';
    byId('chapter').textContent=chapterStages[data.stage].heading||(data.stage==='safe'?'第一卷 · 魔法石　/　大礼堂':'第一卷 · 魔法石　/　入学');
    byId('place').textContent=chapterStages[data.stage].place;byId('quest-type').textContent='当前任务';
    journey=createChapterJourney({data,world,area,avatar,control,beacon,nameTag,release,beam,say,sound,onAction:onChapterAction,onChange:savePoint,ui:byId});
    const trans=byId('transition');trans.classList.add('lit');requestAnimationFrame(()=>trans.classList.remove('lit'));
    savePoint();
  }
  function savePoint() {
    if(!world||fx?.a.kind==='boat')return;
    const pose=control.getPose();
    travelMemo=journey?journey.getTravel():{sceneId:stageId,stepIndex,beatIndex,x:pose.x,z:pose.z,yaw:pose.yaw};
    onCheckpoint(travelMemo);lastPos=pose;lastSave=t;
  }
  function beam(x,z) {
    const from=avatar.getCastOrigin(),to=new THREE.Vector3(x,1.12,z);
    const line=new THREE.Mesh(new THREE.CylinderGeometry(.025,.045,from.distanceTo(to),8),new THREE.MeshBasicMaterial({color:0xffdb84,transparent:true,opacity:.9,toneMapped:false}));
    line.position.copy(from).lerp(to,.5);line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());area.add(line);return line;
  }
  async function finishInteraction(a,stamp) {
    if(stamp!==token)return;
    if(beatIndex+1<beats.length){
      if(a.kind==='pickup')makeCarry(a.prop);
      beatIndex++;canvas.dataset.beat=String(beatIndex);crossingLock=t+.5;
      currentTargets();savePoint();busy=false;
    }else{
      try{await onChoice(a.choice??0,selfCampaign.revision);}
      catch(err){
        if(a.kind==='boat' && stamp===token && world.setBoatRide){
          world.setBoatRide(0);control.setWorld(world,world.landmarks.target);savePoint();
        }
        say('队伍手记',err.message);
      }
      finally{if(stamp===token)busy=false;}
    }
  }
  function trigger(a) {
    if(busy || !a)return;busy=true;const stamp=token;
    const spell=a.kind==='spell';
    if(a.kind==='talk'){
      const localLines={
        'lake:neville':'莱福！原来你在这里。谢谢你们替我留意船边的动静。',
        'sorting:harry':'明早在门厅集合？好，我会等你们。', 'express:hermione':'糖浆印是罗恩的。来看看这串蹼印，它通向车门。',
        'team-puzzle:neville':'我来站侧面，看见我的手掌停下，你们就让羽毛定住。',
        'trapdoor-return:mcgonagall':'蓝门在半月窗下面？带我过去，我们得为返程的学生留一条路。'
      };
      say(names.get(a.who),localLines[stageId+':'+a.who]||SPEECH[a.who],3000);
    }
    if(a.kind==='pickup')say('拿起物品',a.prop==='toad'?'莱福安静地蹲在你的手掌里。':'你托起了行李箱。送到站台前方的标记处。',2350);
    if(a.kind==='drop')makeCarry(null);
    if(a.kind==='cross')sound(392);
    if(spell){control.cast();sound(659);}
    if(a.kind==='boat')say('黑湖渡船','小船离开岸边。抬头看，城堡的窗户亮了。',2700);
    const delay=spell?1.05:a.kind==='boat'?3.7:a.kind==='cross'?.32:.16;
    fx={a,stamp,start:t,duration:delay,line:spell?beam(a.x,a.z):null,moving:a.propNode?.getObjectByName('movable')};
    if(fx.moving)fx.base=fx.moving.position.clone();
    if(a.kind==='boat' && world.setBoatRide)control.ride(world.setBoatRide(0),.016);
  }
  function interact(type='interact') {
    if(!world || isPaused() || busy)return;
    if(journey){journey.interact(type);return;}
    const a=closest();
    if(a && a.dist<=(a.kind==='spell'?2.8:1.95) && (type!=='cast' || a.kind==='spell')){trigger(a);return;}
    if(type==='cast'){
      if(selfCampaign.members[playerId]?.skills.includes('levitate')){control.cast();sound(587);}
      else say('魔杖','在魔咒课上学会漂浮咒后，就可以挥杖施法。',2000);
    }else if(a)say('当前目标',a.label+' · 还有 '+Math.ceil(a.dist)+' 米',1800);
  }
  function closest(){const p=avatar.root.position;let best=null;for(const a of targets){a.dist=Math.hypot(a.x-p.x,a.z-p.z);if(!best||a.dist<best.dist)best=a;}return best;}
  function applyPeers(all){
    if(!world)return;
    const seen=new Set();
    for(const data of all){
      if(data.id===playerId)continue;seen.add(data.id);let item=peers.get(data.id);
      if(item && item.hero!==data.hero){release(item.tag);item.model.dispose();peers.delete(data.id);item=null;}
      const variant=data.hero||'base';
      const peerEquipment=supportsWardrobe(variant)?normalizeEquipment(variant,data.equipment):undefined;
      const equipmentKey=JSON.stringify(peerEquipment);
      if(!item){
        const model=createAvatar({name:data.name,variant,color:data.hero?undefined:0x497e94,isPlayer:true,equipment:peerEquipment});const tag=nameTag(data.name,true);
        model.root.add(tag);scene.add(model.root);model.root.position.set(data.x,data.y||0,data.z);
        item={model,tag,hero:data.hero,equipmentKey,jumpAt:-99,castAt:-99};peers.set(data.id,item);
      }else if(item.equipmentKey!==equipmentKey){
        item.model.setEquipment(peerEquipment);
        item.equipmentKey=equipmentKey;
      }
      if(data.jumpId && item.jumpId!==data.jumpId && data.jumpAge<1800){item.jumpAt=t;item.jumpId=data.jumpId;}
      if(data.castId && item.castId!==data.castId && data.castAge<1800){item.castAt=t;item.castId=data.castId;}
      item.data=data;
    }
    for(const [id,n] of peers)if(!seen.has(id)){release(n.tag);n.model.dispose();n.model.root.removeFromParent();peers.delete(id);}
    canvas.dataset.peers=String(peers.size);
  }
  function updateMap(p,near){
    const cx=95,cy=95,scale=5.3;map.clearRect(0,0,190,190);
    map.save();map.beginPath();map.arc(cx,cy,84,0,2*Math.PI);map.fillStyle='rgba(16,37,33,.83)';map.fill();map.clip();
    map.strokeStyle='#bca16d55';map.lineWidth=2;for(const wall of world.walls){
      map.strokeRect(cx+(wall.x-wall.w/2-p.x)*scale,cy+(wall.z-wall.d/2-p.z)*scale,wall.w*scale,wall.d*scale);
    }
    const dot=(x,z,c,size)=>{map.beginPath();map.arc(cx+(x-p.x)*scale,cy+(z-p.z)*scale,size,0,2*Math.PI);map.fillStyle=c;map.fill();};
    for(const a of targets)dot(a.x,a.z,'#ffda80',6);for(const f of peers.values())dot(f.data.x,f.data.z,'#89d6ff',5);
    map.save();map.translate(cx,cy);map.rotate(-p.yaw);map.beginPath();map.moveTo(0,-11);map.lineTo(7,8);map.lineTo(0,5);map.lineTo(-7,8);map.closePath();map.fillStyle='#fff4d7';map.fill();map.restore();
    map.restore();map.strokeStyle='#dbc38d';map.lineWidth=3;map.beginPath();map.arc(cx,cy,84,0,2*Math.PI);map.stroke();
    map.fillStyle='#ffebc9';map.font='bold 18px Georgia';map.textAlign='center';map.fillText('N',95,29);
    byId('range').textContent=near?'目标 '+Math.max(0,Math.round(near.dist))+' 米':'自由探索';
    camera.getWorldDirection(viewDir);const bearing=(Math.atan2(viewDir.x,-viewDir.z)+Math.PI*2)%(2*Math.PI);
    const headings=['N','NE','E','SE','S','SW','W','NW'],i=Math.round(bearing/(Math.PI/4))%8;
    byId('bearing').textContent=headings[i];const sides=byId('compass').querySelectorAll('span');
    sides[0].textContent=headings[(i+6)%8];sides[1].textContent=headings[(i+2)%8];
  }
  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min(.08,Math.max(.001,(now-last)/1000));last=now;if(document.hidden)return;
    const wardrobeOpen=document.body.classList.contains('wardrobe-open');
    if(selectionStage){if(!wardrobeOpen)selectionStage.render(dt);return;}
    if(opening){if(!wardrobeOpen)opening.render(dt);return;}
    if(!world)return;
    t+=dt;const paused=wardrobeOpen||isPaused();control.setEnabled(!paused && !(fx?.a.kind==='boat') && !journey?.riding);
    control.update(dt);const pose=control.getPose();const motion=pose.y>.09?'air':pose.moving?'walk':pose.casting?'cast':'idle';
    if(canvas.dataset.motion!==motion)canvas.dataset.motion=motion;
    world.update?.(dt,t);
    camera.getWorldDirection(viewDir);
    for(const n of npcs){
      sizeTag(n.tag);
      if(Math.hypot(n.model.root.position.x-pose.x,n.model.root.position.z-pose.z)<3.2)n.model.root.rotation.y=Math.atan2(n.model.root.position.x-pose.x,n.model.root.position.z-pose.z);
      n.model.animate(dt,{moving:false,time:t});
    }
    for(const p of peers.values()){
      sizeTag(p.tag);
      const d=p.data,r=p.model.root,old=r.position.clone();const blend=1-Math.exp(-dt*6);
      r.position.x=lerp(r.position.x,d.x,blend);r.position.z=lerp(r.position.z,d.z,blend);
      const replay=t-p.jumpAt<.68 ? Math.sin((t-p.jumpAt)/.68*Math.PI)*.95:0;
      r.position.y=lerp(r.position.y,Math.max(d.y||0,replay),Math.min(1,dt*15));
      r.rotation.y+=Math.atan2(Math.sin(d.yaw-r.rotation.y),Math.cos(d.yaw-r.rotation.y))*blend;
      p.model.animate(dt,{moving:d.moving||Math.hypot(r.position.x-old.x,r.position.z-old.z)>.016,speed:d.moving?3:0,jump:r.position.y,casting:d.casting||t-p.castAt<.5,time:t});
    }
    if(journey){
      nearest=journey.update(dt,t,pose,paused,[...peers.values()].map(p=>p.data));
      targets=journey.targets;for(const item of journey.actors)sizeTag(item.tag);
    }else nearest=closest();
    for(const a of targets){a.marker.userData.gem.rotation.y=t; a.marker.userData.gem.position.y=2.72+.12*Math.sin(t*2.6);}
    if(fx){
      const e=fx,progress=Math.min(1,(t-e.start)/e.duration);
      if(e.a.kind==='boat' && world.setBoatRide)control.ride(world.setBoatRide(progress),dt);
      if(e.line)e.line.material.opacity=.9*(1-progress);
      if(e.moving){
        e.moving.position.copy(e.base);
        if(e.a.prop==='ring'){
          const align=Math.min(1,progress*2.5);
          e.moving.position.x=lerp(e.base.x,0,align);
          e.moving.position.y=lerp(e.base.y,1.4,align);
          e.moving.position.z=lerp(e.base.z,-.52,progress);
        }else if(e.a.prop==='frame'){
          e.moving.position.x+=progress*.84;e.moving.position.y+=Math.sin(progress*Math.PI)*.47;
          e.moving.rotation.z*=1-Math.min(1,dt*7);
        }else e.moving.position.y+=Math.sin(progress*Math.PI)*.88;
      }
      if(progress===1){
        if(e.a.kind==='boat' && world.boatLanding)control.setWorld(world,world.boatLanding);
        if(e.line)release(e.line);fx=null;finishInteraction(e.a,e.stamp);
      }
    }else if(!journey && !paused && !busy && nearest?.kind==='cross' && nearest.dist<1.05 && t>crossingLock && t-sceneEntered>.5)trigger(nearest);
    if(!paused && (pose.moving || pose.y>.1))canvas.dataset.hasMoved='true';
    tick+=dt;
    if(tick>.105){tick=0;updateMap(pose,nearest);const can=nearest && nearest.dist<=(nearest.kind==='spell'?2.8:1.95) && !paused && !busy;
      byId('callout').hidden=!can;if(can)byId('callout').textContent=(nearest.cross?'步行 · ':matchMedia('(pointer:coarse)').matches?'':nearest.kind==='spell'?'F · ':'E · ')+nearest.label;
      byId('action').textContent=can&&nearest.kind==='spell'?'施法':'互动';
    }
    if(journey)onChapterPose?.(getChapterPose());
    else onPose({...pose,sceneId:stageId,equipment});
    if(t-lastSave>1.5 && (!lastPos || Math.hypot(pose.x-lastPos.x,pose.z-lastPos.z)>.12))savePoint();
    if(!wardrobeOpen)renderer.render(scene,camera);
  }
  function resize(){const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(canvas);resize();requestAnimationFrame(frame);
  addEventListener('pagehide',savePoint);document.addEventListener('visibilitychange',()=>{if(document.hidden)savePoint();});
  function getChapterPose(){
    return journey?{...control.getPose(),sceneId:stageId,hero:heroId,equipment,escort:journey.escort}:null;
  }
  const castScene={
    select(id,immediate=false){
      if(!selectionStage){control.setEnabled(false);selectionStage=createSelectionStage({renderer,canvas});}
      selectionStage.select(id,immediate);
    },
    pick(x,y){return selectionStage?.pick(x,y)??null;},
    rotate(radians){selectionStage?.rotate(radians);},
    zoom(delta){selectionStage?.zoom(delta);},
    resetView(){selectionStage?.resetView();},
    end(){selectionStage?.dispose();selectionStage=null;}
  };
  function stopOpening(){opening?.dispose();opening=null;}
  function startOpening(onCaption,onEnd){
    stopOpening();control.setEnabled(false);
    opening=createOpening({renderer,canvas,onCaption,onEnd});
  }
  return {castScene,startOpening,stopOpening,configure,configureChapter,applyPeers,savePoint,getChapterPose,
    setChapterEncounter(instance){journey?.setEncounter(instance);},
    applyChapterBoat(packet){journey?.setBoat(packet);},
    playChapterAction(action){return journey?.playAction(action)??false;}
  };
}
