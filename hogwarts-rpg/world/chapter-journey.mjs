import * as THREE from 'three';
import {createAvatar} from './player.mjs';
import {createProp} from './props.mjs';
import {chapterStages,escortPath,walkEscort,escortProgress,catchUpEscort} from './chapter-route.mjs';
import {buildCreature,buildExitGate} from './chapter-creature.mjs';
import {sagaStage,sagaBoss} from '../js/magic/saga.mjs';
import {getSagaCombatHint,getSagaCue} from '../js/magic/adventure-rules.mjs';
import {buildSagaBoss} from './saga-boss.mjs';
import {makeTrialProp,makeJournal} from './saga-props.mjs';

const ids={molly:'韦斯莱夫人',hagrid:'海格',flitwick:'弗立维教授',mcgonagall:'麦格教授'};
const goals={
  station:['向韦斯莱夫人问路。','走过九号和十号站台间的砖墙，登上特快。'],
  train:['走到车厢前端，随列车抵达霍格莫德。'],
  lake:['走近提灯的海格。','跟上海格，沿栈桥前往小船。','走到海格身边上船。','乘船横渡黑湖。','跟海格上岸，走向城堡。'],
  classroom:['向弗立维教授学习漂浮咒。','对准桌上的羽毛施法，让它悬浮。','走到教室出口，前往万圣节回廊。'],
  corridor:['练习战斗，或走到尽头的拱门邀请朋友挑战巨怪。'],
  dungeon:['等候队友，准备挑战巨怪。'],
  safe:['沿大礼堂中央走廊前往三楼，调查活板门下的魔镜。'],
  epilogue:['返回晨光里的礼堂。与伙伴重温结局，或邀请好友重返已通过的副本。']
};
const aidHint='红圈出现后移动闪避；巨怪挥空，再用漂浮咒举起木棒。';
const MAX_BEAT={station:1,train:0,lake:4,classroom:2,corridor:0,dungeon:0,safe:0};

export function createChapterJourney({data,world,area,avatar,control,beacon,nameTag,release,beam,say,sound,onAction,onChange,ui}) {
  const {stage,playerId}=data,volume=sagaStage(stage);
  const arena=stage.startsWith('arena-')&&Boolean(sagaStage(stage.slice(6)));
  const saved=data.travel?.mode==='chapter'&&data.travel.stage===stage?data.travel:null;
  let trained=!!data.trained,beat=volume&&trained?3:Math.min(volume?2:MAX_BEAT[stage]||0,Math.max(0,Math.trunc(Number(saved?.chapterBeat)||0))),t=0,disposed=false;
  // Rejoin a moving boat from a safe point on shore.
  if(stage==='lake'&&beat===3)beat=2;
  let encounter=null,helper=!!data.helper,cleared=!!data.cleared,signature='',pending=false,blockedUntil=0;
  let knowsMagic=!!data.knowsMagic,nextFreeCast=0;
  let actors=[],markers=[],props=[],targets=[],nearest=null,creature=null,glow=null,beamTime=0,lessonTimer=0;
  let rideTime=0,peerViews=[],dodgeKey='',dodgeOrigin=null,dodged=false,currentHero=data.hero;
  let party=!!data.party,sailing=null,serverOffset=0,seat=0;
  let trialEffect=null,storyGuide=null,journal=null,lastHint='',moveDodge=false,warning=null;
  const trialProps=[];
  const escort={x:escortPath[0][0],z:escortPath[0][1],yaw:Math.PI,index:1};
  if(stage==='lake'&&beat>=2){escort.index=escortPath.length;[escort.x,escort.z]=escortPath.at(-1);}
  function actor(who,spot,label=ids[who]){
    const model=createAvatar({variant:who,name:label}),tag=nameTag(label);model.root.add(tag);
    model.root.position.set(spot[0],0,spot[1]);model.root.rotation.y=Math.PI;area.add(model.root);
    actors.push({who,model,tag});return model;
  }
  const places=world.landmarks;
  let gate=null,returnGate=null,gateWall=null;
  if(stage==='dungeon'||arena){
    gate=buildExitGate();gate.root.position.set(places.exit[0],0,places.exit[1]+.95);area.add(gate.root);props.push(gate.root);
    gateWall={x:gate.root.position.x,z:gate.root.position.z,w:2.65,d:.21,h:3.13};
    world.walls?.push(gateWall);
    returnGate=buildExitGate();returnGate.root.rotation.y=Math.PI*.5;
    returnGate.root.position.set(places.target[0]-.40,0,places.target[1]);
    returnGate.root.scale.setScalar(.82);returnGate.root.visible=false;area.add(returnGate.root);props.push(returnGate.root);
    if(arena){
      warning=new THREE.Mesh(new THREE.RingGeometry(1.42,1.58,48),new THREE.MeshBasicMaterial({color:0xff956b,transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide}));
      warning.rotation.x=-Math.PI/2;warning.visible=false;area.add(warning);props.push(warning);
    }
  }
  let guide=null,feather=null;
  if(stage==='station')actor('molly',places.target);
  if(stage==='lake'){
    guide=actor('hagrid',[escort.x,escort.z]);
    const lantern=new THREE.Group(),brass=new THREE.MeshStandardMaterial({color:0x9a794b,roughness:.55});
    const halo=new THREE.Mesh(new THREE.CylinderGeometry(.103,.085,.20,7),new THREE.MeshStandardMaterial({color:0xffd889,emissive:0xffaf50,emissiveIntensity:1.3}));
    lantern.add(halo);
    for(const y of [-.12,.12]){const rim=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.042,7),brass);rim.position.y=y;lantern.add(rim);}
    const hoop=new THREE.Mesh(new THREE.TorusGeometry(.083,.014,5,12),brass);hoop.position.y=.18;lantern.add(hoop);
    lantern.position.set(-.47,.91,-.11);guide.root.add(lantern);props.push(lantern);
    if(beat===4){world.setBoatRide(1);guide.root.position.set(-1.8,0,-10.4);}
  }
  if(stage==='classroom'){
    actor('flitwick',places.npc);const table=createProp('feather');table.position.set(...[places.inspect[0],0,places.inspect[1]]);area.add(table);props.push(table);feather=table.getObjectByName('movable');
  }
  if(stage==='safe')actor('mcgonagall',places.npc);
  function addJournal(spot,title){
    const j=makeJournal();j.root.name=title;j.root.position.set(spot[0],0,spot[1]);
    const tag=nameTag(title);j.root.add(tag);area.add(j.root);props.push(j.root);return j;
  }
  if(volume){
    if(/笔记|手记|记录|作战图/.test(volume.guide))journal=addJournal(places.npc,volume.guide);
    else storyGuide=actor(volume.mentor,places.npc,volume.guide);
    for(const [i,[spot]] of volume.trial.entries()){
      const prop=makeTrialProp(volume,i,places[spot]);area.add(prop.root);props.push(prop.root);trialProps.push(prop);
    }
  }
  if(stage==='epilogue'){
    actor('mcgonagall',places.npc,ids.mcgonagall);
    journal=addJournal(places.target,'霍格沃茨战役记录');
  }
  function clearTargets(){for(const x of markers)release(x);markers=[];targets=[];nearest=null;}
  function put(kind,point,label,extra={}){
    const marker=beacon();marker.position.set(point[0],0,point[1]);area.add(marker);markers.push(marker);
    targets.push({kind,x:point[0],z:point[1],label,marker,...extra});
  }
  function objective(text,hint){ui('objective').textContent=text;ui('guidance').textContent=hint||'跟随地面光环，走近后互动。';}
  function refresh(){
    clearTargets();ui('world').dataset.beat=String(beat);
    const status=encounter?.status;
    if(encounter && status==='active'){
      lastHint=getSagaCombatHint(encounter,playerId);
      objective(encounter.enemy?.name||'同队协作战斗',lastHint||(encounter.kind==='troll'?aidHint:'靠近练习场，使用基础攻击和角色技能。'));return;
    }
    if(encounter && (status==='won'||status==='lost') && (stage==='dungeon'||stage==='corridor'||arena)){
      const boss=encounter.kind==='troll'||arena,won=status==='won';
      const helperExit=boss&&won&&helper,spot=helperExit?places.target:won&&boss?places.exit:[0,4.8];
      const label=won?(boss?(helperExit?'返回加入前的章节':'穿过大门，进入下一章'):'返回回廊练习区'):'返回入口，重新集结';
      objective(label,won?'走入发光的出口，个人进度将随你保存。':'走近出口再试一次。');
      put('exit',spot,label,{cross:won});return;
    }
    if(volume){
      if(!trained&&beat===0){
        objective(volume.arrival,'走近'+volume.guide+'，了解本册课程。');
        put('lesson',places.npc,'听取指引 · '+volume.guide);
      }else if(!trained){
        const [spot,action,label]=volume.trial[beat-1];
        const casting=action==='cast'||action==='identify'&&volume.book===1;
        objective(label,casting?'走近目标，按 F 或点「施法」挥杖。':'走近物件，按 E 或点「互动」。');
        put(casting?'spell':'trial',places[spot],label,{trial:beat-1});
      }else{
        objective(cleared?'穿过出口，继续前往下一卷。':'前往副本入口，集合同伴挑战'+volume.boss+'。','已掌握'+volume.spell.name+'。可以和朋友结伴迎战。');
        put('entrance',cleared?places.target:places.exit,'进入副本 · '+volume.boss,{boss:volume.kind});
        if(cleared)put('advance',places.exit,'走入下一卷',{cross:true});
      }
      return;
    }
    if(arena){objective('等候队友进入副本。');return;}
    objective(goals[stage][beat]);
    if(stage==='station')beat===0?put('talk',places.target,'向韦斯莱夫人问路'):put('advance',places.exit,'穿过九又四分之三站台',{cross:true});
    if(stage==='train')put('advance',places.exit,'下车前往黑湖',{cross:true});
    if(stage==='lake'){
      if(beat===0)put('talk',places.npc,'请海格带路');
      if(beat===1||beat===2)put(beat===1?'follow':'board',beat===1?[escort.x,escort.z]:places.target,beat===1?'跟随海格':'登上海格的小船');
      if(beat===4)put('advance',places.exit,'走上通往城堡的石阶',{cross:true});
    }
    if(stage==='classroom'){
      if(beat===0)put('talk',places.npc,'请教漂浮咒');
      if(beat===1)put('spell',places.inspect,'挥杖托起羽毛');
      if(beat===2)put('advance',places.exit,'离开教室',{cross:true});
    }
    if(stage==='corridor'){
      put('practice',[-3.2,.2],'挑战走廊巡逻木偶',{level:'normal'});
      put('practice',[3.2,-2.6],'挑战失控的盔甲守卫',{level:'elite'});
      put('entrance',places.exit,'打开巨怪副本入口');
      if(cleared)put('continue',places.target,'前往第二章安全点',{cross:true});
    }
    if(stage==='dungeon')put('entrance',places.npc,'查看副本队伍');
    if(stage==='safe'){
      put('mentor',places.npc,'与麦格教授交谈');
      put('advance',places.exit,'前往三楼活板门',{cross:true});
    }
    if(stage==='epilogue'){
      put('ending',places.npc,'与麦格教授回忆霍格沃茨之战');
      put('replays',places.target,'在战役记录前邀请好友重返副本');
    }
  }
  function setBeat(next){beat=next;refresh();onChange();}
  function emit(action,done){
    if(pending||disposed)return;
    pending=true;
    Promise.resolve().then(()=>onAction(action)).then(()=>{if(!disposed)done?.();}).catch(e=>{if(!disposed)say('冒险手记',e?.message||'暂时无法提交，请重试。');}).finally(()=>{
      pending=false;blockedUntil=t+.45;
      if(action.type==='combat'&&action.action==='dodge')moveDodge=false;
    });
  }
  function castAt(x,z){
    control.cast();sound(612);if(glow)release(glow);glow=beam(x,z);beamTime=.45;
  }
  function castForward(){
    if(disposed||pending||trialEffect||lessonTimer>0||t<nextFreeCast)return;
    nextFreeCast=t+.45;
    if(!knowsMagic){control.cast();return;}
    const pose=control.getPose(),origin=new THREE.Vector3(pose.x,(pose.y||0)+1.1,pose.z);
    const ray=new THREE.Ray(origin,new THREE.Vector3(-Math.sin(pose.yaw),0,-Math.cos(pose.yaw)));
    const box=new THREE.Box3(),hit=new THREE.Vector3();
    let reach=5.8;
    for(const wall of world.walls||[]){
      box.min.set(wall.x-wall.w/2,0,wall.z-wall.d/2);
      box.max.set(wall.x+wall.w/2,wall.height??wall.h??Infinity,wall.z+wall.d/2);
      if(ray.intersectBox(box,hit))reach=Math.min(reach,origin.distanceTo(hit));
    }
    ray.at(reach,hit);castAt(hit.x,hit.z);
  }
  function activate(a){
    if(!a||disposed||pending||lessonTimer>0||trialEffect||t<blockedUntil)return;
    blockedUntil=t+.45;
    if(a.trial!==undefined){
      if(a.kind==='spell')castAt(a.x,a.z);
      sound(345+volume.book*32+a.trial*72);
      trialEffect={index:a.trial,elapsed:0};return;
    }
    switch(a.kind){
      case 'talk':
        if(stage==='station')say(ids.molly,'看到九号和十号站台之间的砖墙了吗？从这里直走。');
        if(stage==='lake')say(ids.hagrid,'一年级新生，跟我来！我在拐弯处等你们，一起上船。');
        if(stage==='classroom')say(ids.flitwick,'先让杖尖亮起来，找到羽毛，再一挥一抖，把它托起来。');
        setBeat(beat+1);break;
      case 'board':
        if(party){emit({type:'boardBoat'});break;}
        rideTime=0;setBeat(3);control.ride(world.setBoatRide(0),.016);say(ids.hagrid,'坐稳啦。看，霍格沃茨就在湖那边。');break;
      case 'spell':castAt(a.x,a.z);lessonTimer=2;break;
      case 'practice':emit({type:'practice',kind:a.level});break;
      case 'lesson':say(volume.guide,volume.lesson);sound(390);setBeat(1);break;
      case 'entrance':emit(a.boss?{type:'enterDungeon',kind:a.boss}:{type:'enterDungeon'});break;
      case 'exit':emit({type:'exitDungeon'});break;
      case 'ending':case 'replays':emit({type:a.kind});break;
      case 'advance':emit({type:'advance',from:stage,to:chapterStages[stage].next});break;
      case 'continue':emit({type:'advance',from:'corridor',to:'safe'});break;
      case 'mentor':say(ids.mcgonagall,'沿中央走廊向前，三楼的活板门已经打开。朋友也可以从这里邀请你重返旧副本。');break;
      case 'follow':say(ids.hagrid,'跟着我的提灯，我在前面等你。');break;
    }
  }
  function interact(kind){
    if(encounter?.status==='active'){
      if(pending)return;
      const casting=kind==='cast'||kind==='context'&&getSagaCue(encounter)?.action==='counter';
      const lifting=(kind==='cast'||kind==='context')&&encounter.kind==='troll'&&encounter.phase==='opening';
      const action=casting&&sagaBoss(encounter.kind)?'counter':lifting?'levitate':'attack';
      emit({type:'combat',action});return;
    }
    if(kind==='primary'||kind==='cast'){
      if(nearest?.kind==='spell'&&nearest.dist<=2.8)activate(nearest);
      else castForward();
      return;
    }
    if(nearest?.cross){if(nearest.dist>=.87)say('出口','继续走入光环。',1400);return;}
    if(nearest && nearest.dist<=(nearest.kind==='spell'?2.8:1.95)){
      if(kind==='context'||nearest.kind!=='spell'){activate(nearest);return;}
    }
    if(nearest)say('当前目标',nearest.label+' · '+Math.ceil(nearest.dist)+' 米',1600);
  }
  function setEncounter(next,flags={}){
    const previous=encounter;
    encounter=next||null;
    if('helper' in flags)helper=!!flags.helper;
    if('cleared' in flags)cleared=!!flags.cleared;
    if('knowsMagic' in flags)knowsMagic=!!flags.knowsMagic;
    if(volume&&'trained' in flags){
      trained=!!flags.trained;beat=trained?3:Math.min(beat,2);
    }
    if(flags.hero)currentHero=flags.hero;
    if('party' in flags)party=!!flags.party;
    const sig=[encounter?.kind,encounter?.status,encounter?.id,helper,cleared,trained].join('/');
    if(sig===signature)return;
    signature=sig;
    if(creature && (previous?.kind!==encounter?.kind||previous?.id!==encounter?.id)){release(creature.root);creature=null;dodgeKey='';}
    if(!creature && encounter && (stage==='corridor'||stage==='dungeon'||arena)){
      creature=sagaBoss(encounter.kind)?buildSagaBoss(encounter.kind):buildCreature(encounter.kind);
      creature.root.position.set(0,0,-2.2);area.add(creature.root);
    }
    if(warning&&encounter?.status!=='active')warning.visible=false;
    refresh();
  }
  function updateCourse(dt,pose,paused){
    if(!paused&&trialEffect)trialEffect.elapsed=Math.min(1,trialEffect.elapsed+dt/1.08);
    const collecting=volume.trial[0][1]==='collect';
    for(const [i,prop] of trialProps.entries()){
      const effect=trialEffect?.index===i?trialEffect.elapsed:0,done=beat>i+1;
      let carry=0;
      if(i===0&&collecting&&!trained){
        if(beat===2)carry=trialEffect?.index===1?1-trialEffect.elapsed:1;
        else if(trialEffect?.index===0)carry=effect;
      }
      prop.update(t,beat===i+1,done,carry,effect,pose);
    }
    if(trialEffect?.elapsed===1){
      const index=trialEffect.index;trialEffect=null;
      const finish=()=>{say(volume.guide,volume.trial[index][3]);sound(640+volume.book*24);};
      if(index===0){finish();setBeat(2);}
      else emit({type:'learnSaga',skillId:volume.spell.id},()=>{finish();trained=true;setBeat(3);});
    }
    if(!storyGuide)return;
    const p=storyGuide.root.position,[x,z]=places[volume.trial[0][0]];
    const dx=x-p.x,dz=z-p.z,dist=Math.hypot(dx,dz);
    const moving=!paused&&beat===1&&dist>1.34&&Math.hypot(p.x-pose.x,p.z-pose.z)<5.7;
    if(moving){
      const step=Math.min(dist-1.34,dt*1.52);
      p.x+=dx/dist*step;p.z+=dz/dist*step;storyGuide.root.rotation.y=Math.atan2(-dx,-dz);
    }else if(Math.hypot(p.x-pose.x,p.z-pose.z)<4.2)storyGuide.root.rotation.y=Math.atan2(p.x-pose.x,p.z-pose.z);
    storyGuide.animate(dt,{time:t,moving,speed:moving?1.52:0});
  }
  function updateAttackWarning(pose,paused){
    const cue=getSagaCue(encounter);
    const troll=encounter.kind==='troll'&&encounter.phase==='windup'&&encounter.target===playerId;
    const saga=cue?.action==='dodge'&&encounter.started;
    if(encounter.status!=='active'||!(troll||saga)){
      if(warning)warning.visible=false;
      dodgeOrigin=null;dodgeKey='';return;
    }
    const key=encounter.phaseUntil+'/'+encounter.phase;
    if(dodgeKey!==key){
      dodgeKey=key;dodgeOrigin={x:pose.x,z:pose.z};dodged=false;
      if(warning){warning.position.set(pose.x,.075,pose.z);sound(196);}
    }
    if(warning){warning.visible=!dodged;warning.material.opacity=.60+.28*Math.sin(t*8);}
    const remaining=encounter.phaseUntil-Date.now(),moved=Math.hypot(pose.x-dodgeOrigin.x,pose.z-dodgeOrigin.z);
    if(!paused&&!pending&&!dodged&&remaining>0&&(saga||remaining<=1550)&&moved>1.65){
      dodged=true;moveDodge=true;
      emit({type:'combat',action:'dodge'});
    }
  }
  function getTravel(){
    const pose=control.getPose(),snapshot={mode:'chapter',hero:currentHero,stage,sceneId:stage,chapterBeat:beat,x:pose.x,z:pose.z,yaw:pose.yaw};
    if(stage==='lake' && (beat===2||beat===3))Object.assign(snapshot,{chapterBeat:2,x:places.target[0],z:places.target[1],yaw:0});
    return snapshot;
  }
  function setBoat(packet){
    if(stage!=='lake'||!party||!Number.isFinite(packet?.serverNow))return;
    const trip=packet.boat;
    if(!Number.isFinite(trip?.departAt)||!Number.isFinite(trip?.arriveAt)||trip.arriveAt<=trip.departAt)return;
    if(sailing && (sailing.departAt>trip.departAt || sailing.departAt===trip.departAt&&sailing.lastSeen>=packet.serverNow))return;
    if((!sailing||sailing.departAt!==trip.departAt)&&packet.serverNow>=trip.departAt&&packet.serverNow<trip.arriveAt&&beat===2)
      say(ids.hagrid,'上一艘船已经离岸。等它靠岸后，在灯下呼叫下一班。',2400);
    serverOffset=packet.serverNow-Date.now();
    sailing={...trip,lastSeen:packet.serverNow};
  }
  function sitPassengers(pos,dt){
    const side=party?([-.38,.38,-.38,.38][seat]||0):0;
    const forward=party?(seat<2?.32:-.38):0;
    control.ride({...pos,x:pos.x+side*Math.cos(pos.yaw)+forward*Math.sin(pos.yaw),z:pos.z-side*Math.sin(pos.yaw)+forward*Math.cos(pos.yaw)},dt);
    guide.root.position.set(pos.x-.85*Math.sin(pos.yaw),pos.y,pos.z-.85*Math.cos(pos.yaw));guide.root.rotation.y=pos.yaw;
  }
  function update(dt,clock,pose,paused,peers){
    t=clock;peerViews=peers;
    if(gate){
      const up=encounter?.status==='won'&&!helper;
      gate.grille.position.y=THREE.MathUtils.damp(gate.grille.position.y,up?3.05:0,4.5,dt);
      if(gate.grille.position.y>1.9&&world.walls?.includes(gateWall))world.walls.splice(world.walls.indexOf(gateWall),1);
      else if(!up && world.walls&&!world.walls.includes(gateWall))world.walls.push(gateWall);
      returnGate.root.visible=encounter?.status==='won'&&helper;
      if(returnGate.root.visible)returnGate.grille.position.y=THREE.MathUtils.damp(returnGate.grille.position.y,3.05,4.5,dt);
    }
    if(stage==='lake'&&guide){
      let moving=false;
      const shoreline=peers.filter(p=>p.z>-5.05&&p.x>-3.2);
      const remote=shoreline.reduce((n,p)=>Number.isFinite(p.escort)?Math.max(n,p.escort):n,-1);
      if(party && remote>=0 && (beat===1||beat===0&&Math.hypot(pose.x-escort.x,pose.z-escort.z)<4.0) && !paused){
        if(beat===0)setBeat(1);
        catchUpEscort(escort,remote);
      }
      if(beat===1&&!paused){
        const companions=shoreline.filter(p=>Number.isFinite(p.escort));
        const result=walkEscort(escort,[pose,...companions],dt);moving=result.moving;
        guide.root.position.set(escort.x,0,escort.z);
        guide.root.rotation.y=result.waiting?Math.atan2(escort.x-pose.x,escort.z-pose.z):escort.yaw;
        if(targets[0]){targets[0].x=escort.x;targets[0].z=escort.z;targets[0].marker.position.set(escort.x,0,escort.z);}
        if(result.arrived){say(ids.hagrid,'船就在这儿。到我身旁来，我们就出发。');setBeat(2);}
      }
      const now=Date.now()+serverOffset;
      if(party && sailing && beat<3 && !paused && now<sailing.departAt && Math.hypot(pose.x-places.target[0],pose.z-places.target[1])<=1.95){
        const seats=[...new Set([playerId,...shoreline.map(p=>p.id).filter(Boolean)])].sort();
        seat=seats.indexOf(playerId);setBeat(3);say(ids.hagrid,'坐稳啦。等齐岸边的伙伴，我们就出发。');
      }
      if(beat===3 && (sailing || !paused)){
        rideTime=Math.min(4.6,rideTime+dt);
        const fraction=sailing?Math.min(1,Math.max(0,(now-sailing.departAt)/(sailing.arriveAt-sailing.departAt))):rideTime/4.6;
        sitPassengers(world.setBoatRide(fraction),dt);
        if(fraction>=1){control.setWorld(world,world.boatLanding);guide.root.position.set(-1.8,0,-10.4);setBeat(4);}
      }else if(party && sailing && beat<3){
        const progress=Math.max(0,(now-sailing.departAt)/(sailing.arriveAt-sailing.departAt));
        world.setBoatRide(progress>1?0:progress);
      }
      guide.animate(dt,{moving,speed:moving?1.65:0,time:t});
    }
    for(const item of actors){
      if(item.model===guide||item.model===storyGuide)continue;
      const p=item.model.root.position;
      if(Math.hypot(p.x-pose.x,p.z-pose.z)<4)item.model.root.rotation.y=Math.atan2(p.x-pose.x,p.z-pose.z);
      item.model.animate(dt,{time:t});
    }
    journal?.update(t);
    if(volume)updateCourse(dt,pose,paused);
    if(lessonTimer>0&&!paused){
      lessonTimer=Math.max(0,lessonTimer-dt);
      if(feather)feather.position.y=.703+.73*Math.min(1,(2-lessonTimer)*4,lessonTimer*4);
      if(lessonTimer===0){say(ids.flitwick,'很好！把课堂上学到的本领带到走廊里试试。');setBeat(2);}
    }
    if(glow){beamTime-=dt;glow.material.opacity=Math.max(0,beamTime/.45);if(beamTime<=0){release(glow);glow=null;}}
    if(creature){
      const other=peerViews.find(p=>p.id===encounter?.target);
      const point=encounter?.target===playerId?pose:other;
      updateAttackWarning(pose,paused);
      if(arena&&encounter.status==='active'){
        const hint=getSagaCombatHint(encounter,playerId);
        if(hint&&hint!==lastHint){lastHint=hint;ui('guidance').textContent=hint;}
      }
      creature.update(encounter,t,encounter?.phase==='windup'&&encounter.target===playerId?dodgeOrigin:point);
    }
    nearest=null;
    for(const a of targets){
      a.dist=Math.hypot(a.x-pose.x,a.z-pose.z);
      if(!nearest||nearest.dist>a.dist)nearest=a;
      const gem=a.marker.userData.gem;gem.rotation.y=t;gem.position.y=2.72+.12*Math.sin(t*2.6);
    }
    if(!paused&&nearest?.cross&&nearest.dist<.87)activate(nearest);
    return nearest;
  }
  function playAction(action){
    const p=control.getPose(),target=creature?.root.position;
    if(!target||!encounter||encounter.status!=='active')return false;
    if(['attack','levitate','special','signature','bait','counter','light'].includes(action)&&Math.hypot(target.x-p.x,target.z-p.z)>12){
      say('施法距离','再靠近对手一些，再出手。',1500);return false;
    }
    if(action==='dodge'||action==='rescue'){
      if(action==='dodge'&&!moveDodge&&control.dodge?.()===false){
        say('闪避','这边没有侧移空间，换个方向再闪身。',1500);return false;
      }
      if(action==='dodge')dodged=true;
      if(glow)release(glow);
      glow=new THREE.Mesh(new THREE.RingGeometry(.34,.64,32),new THREE.MeshBasicMaterial({color:action==='dodge'?0x86d4e1:0x94e7ac,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
      glow.rotation.x=-Math.PI/2;glow.position.set(p.x,.08,p.z);area.add(glow);beamTime=.45;sound(action==='dodge'?430:720);
    }else castAt(target.x,target.z);
    return true;
  }
  function dispose(){
    disposed=true;clearTargets();
    if(gateWall&&world.walls?.includes(gateWall))world.walls.splice(world.walls.indexOf(gateWall),1);
    for(const obj of actors){release(obj.tag);obj.model.dispose();}actors=[];
    for(const obj of props)release(obj);props=[];
    if(glow)release(glow);if(creature)release(creature.root);
  }
  setEncounter(data.instance||null);
  return {interact,update,setEncounter,setFlags:flags=>setEncounter(encounter,flags),setBoat,playAction,getTravel,dispose,get targets(){return targets;},get actors(){return actors;},get riding(){return stage==='lake'&&beat===3;},
    get escort(){return stage==='lake'&&(beat===1||beat===2)?escortProgress(escort):undefined;}};
}
