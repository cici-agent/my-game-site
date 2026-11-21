import {createTravelExpression} from '../js/magic/portrait-expression.js';
import * as THREE from 'three';
import {motionBlend} from './motion-blend.mjs';
import {sequenceFloor} from './sequence.mjs';
import {createGaitFloor} from './gait-floor.mjs';
import {GAME_GAIT_RATE} from '../js/magic/character-motion.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const el = id => document.getElementById(id);
const assets = await fetch('./scene.json').then(response => {
  if (!response.ok) throw new Error('工作室场景载入失败');
  return response.json();
});
const labels = {coat:'岔路斜襟短袍',wand:'岔路练习杖',boots:'岔路鞋靴'};
const portraitLabels={sequence:'连续动作',stance:'站姿全身',stride:'侧前全身',palm:'掌心侧',dorsal:'手背侧',gesture:'施法全身',head:'正脸',profile:'侧脸',nape:'后颈'};
const isFace=k=>['head','profile','nape'].includes(k);
const isHand=k=>k==='palm'||k==='dorsal';
let focusView = null, lastPortrait='stance';
const isPortrait=key=>Object.hasOwn(portraitLabels,key);
function pressed(selector, key, value) {
  for (const button of document.querySelectorAll(selector)) {
    button.setAttribute('aria-pressed',String(button.dataset[key]===value));
  }
}
function showReference(key,shot=lastPortrait) {
  const image=el('reference-image');
  const portrait=key==='portrait';
  if(portrait)lastPortrait=shot;
  if(!portrait)image.src=assets[key];
  image.alt=portrait?'上一版哈利的'+portraitLabels[shot]+'渲染':'五阶'+labels[key]+'设定原图';
  el('ref-frame').dataset.ref=key;
  el('ref-title').textContent=portrait?'上一版':'设定原图';
  el('reference-caption').textContent=portrait?'上一版 · '+portraitLabels[shot]+' · 动作同步':'五阶 · '+labels[key];
  document.querySelector('.grid').dataset.portrait=String(portrait);
  pressed('button[data-ref]','ref',key);
}
showReference('portrait');
for (const button of document.querySelectorAll('button[data-ref]')) {
  button.addEventListener('click',()=>{
    const key=button.dataset.ref;
    showReference(key);
    focusView?.(key==='portrait'?lastPortrait:key==='coat'?'front':key);
  });
}
const proof=el('proof-dialog');
if(assets.proof){
  el('proof-image').src=assets.proof;
  el('open-proof').addEventListener('click',()=>proof.showModal());
  el('close-proof').addEventListener('click',()=>proof.close());
  proof.addEventListener('click',event=>{if(event.target===proof)proof.close()});
}else{el('open-proof').hidden=true;}

function findMeshes(root, pattern) {
  const result=[];
  root.traverse(node=>{
    if (!node.isMesh) return;
    let ancestor=node;
    while (ancestor) {
      if (pattern.test(ancestor.name+' '+(ancestor.userData.wardrobeSlot || ''))) {
        result.push(node); return;
      }
      ancestor=ancestor.parent;
    }
  });
  return result;
}
function bounds(meshes) {
  const box=new THREE.Box3(), point=new THREE.Vector3();
  for (const mesh of meshes) {
    const pos=mesh.geometry.getAttribute('position');
    for (let i=0;i<pos.count;i++) {
      mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(point);
    }
  }
  return box;
}
// Orient the long shaft horizontally; use the widest cross-section to reveal the carved fork.
function wandDisplayRotation(meshes,center) {
  const points=[],gemPoints=[],accent=new THREE.Box3(),p=new THREE.Vector3();
  for(const mesh of meshes) {
    const detail=/garnet|brass|redwood|oxblood/i.test(mesh.material.name);
    const garnet=/garnet/i.test(mesh.material.name);
    const pos=mesh.geometry.getAttribute('position');
    for(let i=0;i<pos.count;i++) {
      mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
      points.push(p.clone());
      if(garnet) gemPoints.push(p.clone());
      if(detail) accent.expandByPoint(p);
    }
  }
  if(points.length<2)return new THREE.Quaternion();
  const farthest=from=>points.reduce((a,b)=>from.distanceToSquared(a)>from.distanceToSquared(b)?a:b);
  const a=farthest(center),b=farthest(a);
  const grip=accent.isEmpty()?center:accent.getCenter(new THREE.Vector3());
  const axis=a.clone().sub(b).normalize();
  if(a.distanceToSquared(grip)>b.distanceToSquared(grip))axis.negate();
  const first=new THREE.Vector3(0,1,0);
  if(Math.abs(first.dot(axis))>.9)first.set(0,0,1);
  first.addScaledVector(axis,-first.dot(axis)).normalize();
  const second=axis.clone().cross(first);
  let xx=0,yy=0,xy=0;
  // The two opposing inlays share a material. Their separation is normal to the decorated faces.
  const transverse=gemPoints.length?gemPoints:points;
  const mean=transverse.reduce((v,p)=>v.add(p),new THREE.Vector3()).divideScalar(transverse.length);
  for(const point of transverse) {
    const o=point.sub(mean),x=o.dot(first),y=o.dot(second);
    xx+=x*x;yy+=y*y;xy+=x*y;
  }
  const angle=.5*Math.atan2(2*xy,xx-yy);
  const wide=first.multiplyScalar(Math.cos(angle)).addScaledVector(second,Math.sin(angle));
  const normal=gemPoints.length?wide.normalize():axis.clone().cross(wide).normalize();
  if(normal.dot(new THREE.Vector3(.85,.17,.53))<0)normal.negate();
  const up=normal.clone().cross(axis).normalize();
  const basis=new THREE.Matrix4().makeBasis(axis,up,normal);
  return new THREE.Quaternion().setFromRotationMatrix(basis).invert();
}
async function start() {
  const stage=el('stage'), canvas=el('model');
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.13;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();
  const generator=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  const env=generator.fromScene(room,.04);
  scene.environment=env.texture;
  scene.environmentIntensity=.52;
  room.dispose(); generator.dispose();
  scene.add(new THREE.HemisphereLight(0xfffbef,0xc0b3a4,1.05));
  const key=new THREE.DirectionalLight(0xfff4df,2.05);
  key.position.set(-2.3,3.4,3.0);
  key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-1.65,right:1.65,top:2.35,bottom:-1.3,near:.1,far:12});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias=-.0002;key.shadow.normalBias=.0015;
  scene.add(key);
  const fill=new THREE.DirectionalLight(0xeaf1ff,.70);
  fill.position.set(2,1.8,2.1);scene.add(fill);
  const back=new THREE.DirectionalLight(0xffefd7,1.23);
  back.position.set(1,2.7,-2.4);scene.add(back);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.ShadowMaterial({opacity:.045}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);

  const gaitFloor=createGaitFloor();scene.add(gaitFloor);
  const gaitSpeed={Walk:1.09,Run:2.34};let distance=0;
  async function fetchBytes(path) {
    const response=await fetch(path);
    if (!response.ok) throw new Error('无法载入人物资源');
    return new Uint8Array(await response.arrayBuffer());
  }
  const [bytes,extra]=await Promise.all([
    fetchBytes('../assets/3d/magic/characters/harry-pathfinder.glb'),
    fetchBytes('./previous-model.delta')
  ]);
  const oldBytes=new Uint8Array(assets.previous.length);
  let dst=0;
  for(const [offset,size] of assets.previous.parts) {
    const source=offset<0?extra:bytes, start=offset<0?-1-offset:offset;
    oldBytes.set(source.subarray(start,start+size),dst);dst+=size;
  }
  delete assets.previous;
  const loader=new GLTFLoader();
  const [{scene:figure,animations},{scene:previous,animations:previousClips}]=await Promise.all([
    loader.parseAsync(bytes.buffer,''),loader.parseAsync(oldBytes.buffer,'')
  ]);
  scene.add(previous);previous.updateMatrixWorld(true);previous.visible=false;
  const previousMixer=new THREE.AnimationMixer(previous);
  let previousAction=null, previousLandmark=null;
  let traceEnabled=false;
  function prepareTrace(points) {
    const start=Math.round(12/76*(points.length-1)),end=Math.round(42/76*(points.length-1));
    const geometry=new THREE.BufferGeometry().setFromPoints(points.slice(start,end+1).map(p=>new THREE.Vector3(...p)));
    const material=new THREE.LineBasicMaterial({color:0xad602f,transparent:true,opacity:.92,depthTest:true,depthWrite:false});
    const line=new THREE.Line(geometry,material);line.visible=false;line.frustumCulled=false;scene.add(line);
    return {line,start,end,count:points.length};
  }
  const traces={current:prepareTrace(assets.cameras.traces.current),previous:prepareTrace(assets.cameras.traces.previous)};
  function updateTrace(entry,time,visible){
    const frame=Math.min(entry.count-1,Math.max(0,time*(entry.count-1)));
    entry.line.visible=visible&&traceEnabled&&frame>=entry.start&&time<.91;
    entry.line.material.opacity=.92*Math.min(1,Math.max(0,(.91-time)/.19));
    entry.line.geometry.setDrawRange(0,Math.max(0,Math.min(entry.end,Math.floor(frame))-entry.start+1));
  }
  const comparisonCanvas=el('previous-canvas');
  const comparisonContext=comparisonCanvas.getContext('2d',{alpha:true});
  const mount=new THREE.Group();
  scene.add(mount);mount.add(figure);mount.updateMatrixWorld(true);
  const meshes=[], materialPairs=[];
  function prepareMesh(n, current) {
    if (!n.isMesh) return;
    n.castShadow=true; n.receiveShadow=true; n.frustumCulled=false;
    n.skeleton?.update();
    if(current)meshes.push(n);
    const old=Array.isArray(n.material)?n.material:[n.material];
    for(const mat of old) {
      if(/^HF fibre /i.test(mat.name)){
        n.castShadow=false;n.receiveShadow=false;
        mat.transparent=true;mat.opacity=.72;mat.depthWrite=false;
      }
      if(/ink brown layered hair/i.test(mat.name)){
        n.castShadow=false;n.receiveShadow=false;
        mat.alphaTest=.035;mat.transparent=true;mat.depthWrite=false;
        if(mat.map){mat.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());mat.map.needsUpdate=true;}
      }
    }
    const replace=old.map(m=>{
      if (/skin|hair|eye|iris|brow|lacrimal|scar|cornea|glass|nail|lip|sclera|lash|lens|freckle|pupil/i.test(m.name)) return m;
      return new THREE.MeshStandardMaterial({color:0xb7b5ac,roughness:.93,metalness:0,
        side:m.side,alphaTest:m.alphaTest,alphaMap:m.alphaMap,transparent:m.transparent,opacity:m.opacity});
    });
    materialPairs.push([n,n.material,Array.isArray(n.material)?replace:replace[0]]);
  }
  figure.traverse(n=>prepareMesh(n,true));previous.traverse(n=>prepareMesh(n,false));
  if (!meshes.length) throw new Error('empty model');
  const whole=bounds(meshes), center=whole.getCenter(new THREE.Vector3());
  const size=whole.getSize(new THREE.Vector3()), h=size.y;
  floor.position.y=whole.min.y-.001;gaitFloor.position.y=floor.position.y+.0001;
  const feet=root=>['L','R'].map(s=>root.getObjectByName('Foot'+s));
  const currentFeet=feet(figure),oldFeet=feet(previous);
  function floorAt(pair){
    gaitFloor.visible=(!!gaitSpeed[select.value]||isSequence()||currentBlend.speed(gaitSpeed)>.005)&&!isolated&&(['sequence','stride','stance','gesture','front','back','side'].includes(viewKey));
    if(!gaitFloor.visible)return;
    const u=gaitFloor.material.uniforms;u.travel.value=distance;
    u.visibility.value=isSequence()?1:currentBlend.speed({Walk:1,Run:1});
    pair[0].getWorldPosition(u.left.value);pair[1].getWorldPosition(u.right.value);
  }
  const wandMeshes=findMeshes(figure,/wand|weapon|魔杖/i);
  const mainWand=findMeshes(figure,/Pathfinder_Wand_05/i);
  const equipment={coat:[],boots:[],wand:[]};
  for(const mesh of meshes) {
    let node=mesh,slot=null,names='';
    while(node){slot ||= node.userData.wardrobeSlot;names+=' '+node.name;node=node.parent;}
    if(slot==='weapon'||/Pathfinder_Wand/i.test(names))equipment.wand.push(mesh);
    if(slot==='shoes'||/Pathfinder_Boot/i.test(names))equipment.boots.push(mesh);
    if(['top','pants','shoes'].includes(slot)||/Outfit_robe|Pathfinder_(Trousers|Boot)/i.test(names))equipment.coat.push(mesh);
  }
  const handBone=figure.getObjectByName('HandR'),oldHandBone=previous.getObjectByName('HandR');
  const headBone=figure.getObjectByName('Head'),oldHeadBone=previous.getObjectByName('Head');
  function faceCenter(bone){
    const center=bone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.037,.016));
    return bone.worldToLocal(center);
  }
  const headLocal=faceCenter(headBone),oldHeadLocal=faceCenter(oldHeadBone);
  function gripAnchor(root,bone) {
    const nodes=[];
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      let n=mesh;
      while(n){if(n.userData.gripCameraTarget||/HF_Wand_Hand/i.test(n.name)){nodes.push(mesh);break}n=n.parent;}
    });
    if(!nodes.length)throw new Error('握杖主手网格缺失');
    const world=bounds(nodes).getCenter(new THREE.Vector3());
    return bone.worldToLocal(world);
  }
  const gripLocal=gripAnchor(figure,handBone),previousGripLocal=gripAnchor(previous,oldHandBone);
  const previousCamera=new THREE.OrthographicCamera();

  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,50);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.dampingFactor=.13;
  for(const surface of [canvas,comparisonCanvas]){
    const activate=()=>{if(controls.domElement!==surface&&controls.state===-1)controls.connect(surface);};
    surface.addEventListener('pointerenter',activate);
    surface.addEventListener('pointerdown',activate,{capture:true});
    surface.addEventListener('wheel',activate,{capture:true,passive:true});
  }
  controls.enablePan=true;controls.maxPolarAngle=Math.PI*.93;
  controls.minZoom=.22;controls.maxZoom=5;
  let needsRender=true;
  controls.addEventListener('change',()=>{needsRender=true;});
  let viewKey='stance', playbackRatio=1.35, slowFrames=0, cameraMove=null;
  let frameHeight=h, frameWidth=size.x;
  function resize(resetZoom=false) {
    const w=Math.max(1,stage.clientWidth),ph=Math.max(1,stage.clientHeight),aspect=w/ph;
    renderer.setSize(w,ph,false);
    // Baseline images use the same vertical frustum captured from the prior GLB.
    const portraitPixels=Math.min(ph/.45,w/.32)*.66;
    el('ref-frame').style.setProperty('--portrait-size',portraitPixels+'px');
    const half=Math.max(frameHeight/2,frameWidth/2/aspect);
    camera.left=-half*aspect; camera.right=half*aspect; camera.top=half; camera.bottom=-half;
    if(resetZoom) camera.zoom=1;
    camera.updateProjectionMatrix();
    needsRender=true;
  }
  const vector=(x,y,z)=>new THREE.Vector3(x,y,z);
  let followHand=null,isolated=false,preparedRef=null,selectedBox;
  const flashTrack=animations.find(c=>/cast/i.test(c.name))?.tracks.find(t=>/GarnetLight.*\.scale$/i.test(t.name));
  const garnet=figure.getObjectByName('GarnetLight');
  const flash=flashTrack&&garnet?flashTrack.createInterpolant(new Float32Array(3)):null;
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let flashStart=null;
  el('spark').addEventListener('click',()=>{flashStart=performance.now();});
  function prepareEquipment(ref) {
    if(preparedRef===ref)return;
    el('spark').hidden=ref!=='wand'||!flash;
    flashStart=ref==='wand'&&flash&&!reduceMotion?performance.now():null;
    mount.quaternion.identity();mount.position.set(0,0,0);
    mount.updateMatrixWorld(true);
    for(const n of meshes)n.skeleton?.update();
    const visible=new Set(equipment[ref]);
    for(const mesh of meshes)mesh.visible=visible.has(mesh);
    if(ref==='wand'){
      const center=bounds(equipment.wand).getCenter(new THREE.Vector3());
      mount.quaternion.copy(wandDisplayRotation(mainWand.length?mainWand:equipment.wand,center));
      mount.position.copy(center).sub(center.clone().applyQuaternion(mount.quaternion));
      mount.updateMatrixWorld(true);
      for(const n of equipment.wand)n.skeleton?.update();
    }
    selectedBox=bounds(equipment[ref]);
    floor.visible=ref!=='wand';
    preparedRef=ref;
  }
  const handPosition=new THREE.Vector3(),lastHand=new THREE.Vector3();
  focusView=key=>{
    cameraMove=null;viewKey=key;followHand=null;
    el('trace').hidden=key!=='gesture';
    const quality=isFace(key)?Math.max(1.5,Math.min(devicePixelRatio,2)):Math.min(devicePixelRatio,1.4);
    renderer.setPixelRatio(paused?quality:Math.min(quality,playbackRatio));
    // Commit any residual drag inertia before placing the camera at a preset.
    controls.enableDamping=false;controls.update();controls.enableDamping=true;
    pressed('button[data-view]','view',key);
    el('mobile-view').value=key;
    figure.updateMatrixWorld(true);
    for(const n of meshes) n.skeleton?.update();
    const aim=center.clone();
    let direction=vector(.00001,.015,1);
    frameHeight=h*1.10;frameWidth=Math.max(size.x,size.z)*1.17;
    if(key==='back') direction=vector(.00001,.016,-1);
    if(key==='side') direction=vector(-1,.015,.00001);
    if(isFace(key)) {
      // All portrait variants share a fixed world-space camera and listening height
      // so silhouette changes remain visible after a model's proportions change.
      headBone.localToWorld(aim.copy(headLocal));lastHand.copy(aim);
      const angle=THREE.MathUtils.degToRad({head:0,profile:90,nape:150}[key]);
      direction=vector(Math.sin(angle),.02,Math.cos(angle));
      frameHeight=key==='head'?.365:.45;frameWidth=key==='head'?.27:.32;
    }
    if(isHand(key)||['sequence','stance','stride','gesture'].includes(key)){
      const shot=assets.cameras[key==='gesture'&&previousLandmark===assets.cameras.phases.release?'release':key];
      const az=THREE.MathUtils.degToRad(shot.az),el=THREE.MathUtils.degToRad(shot.el);
      direction=vector(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));
      frameHeight=shot.height;frameWidth=shot.width;
      if(isHand(key)){followHand=gripLocal.clone();handBone.localToWorld(aim.copy(followHand));}
      else aim.fromArray(shot.target);
    }
    if(key==='wand'&&!isolated) {
      const box=bounds(wandMeshes);
      if(!box.isEmpty()) box.getCenter(aim);
      else if(handBone) handBone.getWorldPosition(aim);
      const wandSize=box.getSize(new THREE.Vector3());
      const reach=Math.max(wandSize.x,wandSize.y,wandSize.z);
      frameHeight=Math.max(.26*h,reach*1.45);
      frameWidth=Math.max(.24*h,reach*1.6);
      direction=vector(.85,.17,.53);
      if(handBone) followHand=handBone.worldToLocal(aim.clone());
    }
    if(key==='boots') {
      aim.y=whole.min.y+.11*h;
      direction=vector(-.30,.13,1);frameHeight=.30*h;frameWidth=Math.max(.25*h,size.x*.54);
    }
    if(isolated) {
      const ref=el('ref-frame').dataset.ref;
      prepareEquipment(ref);
      selectedBox.getCenter(aim);
      const dims=selectedBox.getSize(new THREE.Vector3());
      direction=vector(.00001,ref==='boots'?.13:.012,1);
      if(key==='side')direction=vector(-1,.05,.00001);
      if(key==='back')direction=vector(.00001,.03,-1);
      if(ref==='boots'&&key==='boots')direction=vector(-.44,.19,1);
      frameHeight=Math.max(dims.y*(ref==='wand'?2.5:1.12),.10);
      frameWidth=Math.max(dims.x,dims.z)*1.17;
      if(ref==='wand'){frameHeight=Math.max(dims.y*1.5,dims.x*.25);frameWidth=dims.x*1.16;}
    }
    if(followHand)lastHand.copy(aim);
    controls.target.copy(aim);
    camera.position.copy(aim).addScaledVector(direction.normalize(),3.7*h);
    camera.lookAt(aim);
    controls.update(); resize(true);
  };
  for(const button of document.querySelectorAll('button[data-view]')) {
    button.addEventListener('click',()=>{
      const key=button.dataset.view;
      if(isPortrait(key))showReference('portrait',key);
      else if(key==='boots'||key==='wand')showReference(key);
      else if(!isolated)showReference('coat');
      focusView(key);
    });
  }
  el('mobile-view').addEventListener('change',()=>document.querySelector('button[data-view='+el('mobile-view').value+']').click());
  controls.addEventListener('start',()=>{cameraMove=null;needsRender=true;});
  const observer=new ResizeObserver(()=>resize());observer.observe(stage);

  let clay=false;
  el('clay').addEventListener('click',()=>{
    clay=!clay;
    for(const [mesh,original,neutral] of materialPairs) mesh.material=clay?neutral:original;
    el('clay').setAttribute('aria-pressed',String(clay));
    needsRender=true;
  });
  const mixer=new THREE.AnimationMixer(figure), select=el('clip'),timeline=el('timeline');
  const currentBlend=motionBlend(),oldBlend=motionBlend();
  const travelExpression=createTravelExpression(figure);
  const travelWeights={Walk:1,Run:1},runWeights={Run:1};
  function samplePose(clipDt, expressionDt=0) {
    travelExpression?.restore();
    mixer.update(clipDt);
    if(expressionDt>0){
      const moving=currentBlend.speed(travelWeights);
      const runShare=moving?currentBlend.speed(runWeights)/moving:0;
      travelExpression?.apply(expressionDt,moving,runShare);
    }
  }
  let last=performance.now();
  const builtSequence=animations.find(c=>/^(sequence|performance|fullsequence|continuous)$/i.test(c.name));
  const seq=builtSequence?sequenceFloor(builtSequence.duration):null;
  const seqName=builtSequence?.name||'Sequence';
  let selected, paused=true, preferSolo=false,seqClock=0;
  const isSequence=()=>select.value===seqName;
  const grid=document.querySelector('.grid');
  function applySolo(){
    const missing=!!selected&&!previousAction;
    const solo=missing||preferSolo;
    grid.dataset.solo=String(solo);
    el('solo').disabled=missing||isolated;
    el('solo').setAttribute('aria-pressed',String(solo));
    el('solo').textContent=missing?(isSequence()?'连续动作 · 本版':'上一版没有跑步动作'):solo?'两版对照':'只看本版';
    needsRender=true;
  }
  el('solo').addEventListener('click',()=>{preferSolo=!preferSolo;applySolo();});
  function updatePause(){
    mixer.timeScale=paused?0:Number(el('speed').value);
    key.castShadow=paused;
    const quality=isFace(viewKey)?Math.max(1.5,Math.min(devicePixelRatio,2)):Math.min(devicePixelRatio,1.4);
    renderer.setPixelRatio(paused?quality:Math.min(quality,playbackRatio));resize();

    el('pause').setAttribute('aria-pressed',String(paused));
    el('pause').textContent=paused?'播放':'暂停';
  }
  function clipName(name) {
    if(name===seqName)return '连续动作';
    if (/head.?turn/i.test(name))return '转头';
    if (/idle/i.test(name))return '站立';
    if (/walk/i.test(name))return '走路';
    if (/run/i.test(name))return '跑步';
    if (/cast|spell/i.test(name))return '施法';
    return name;
  }
  const a11yOrder=['Idle','Walk','Run','Cast','HeadTurn',seqName];
  for(const clip of [...animations].sort((a,b)=>a11yOrder.indexOf(a.name)-a11yOrder.indexOf(b.name))) select.add(new Option(clipName(clip.name),clip.name));
  const gaitTransition=(from,to)=>['Idle','Walk','Run'].includes(from)&&['Idle','Walk','Run'].includes(to)&&from!==to;
  function cameraState(){return {position:camera.position.clone(),target:controls.target.clone(),zoom:camera.zoom,frameHeight,frameWidth};}
  function blendCamera(t){
    if(!cameraMove)return;
    const m=cameraMove,u=Math.min(1,t),w=u*u*(3-2*u);
    camera.position.lerpVectors(m.a.position,m.b.position,w);controls.target.lerpVectors(m.a.target,m.b.target,w);
    frameWidth=THREE.MathUtils.lerp(m.a.frameWidth,m.b.frameWidth,w);frameHeight=THREE.MathUtils.lerp(m.a.frameHeight,m.b.frameHeight,w);
    camera.zoom=THREE.MathUtils.lerp(m.a.zoom,m.b.zoom,w);controls.update();resize();if(u===1)cameraMove=null;
  }
  function settle(){currentBlend.finish();oldBlend.finish();blendCamera(1);samplePose(0);needsRender=true;}
  function setClip(name,smooth=false) {
    const clip=animations.find(c=>c.name===name);
    if(!clip) return;
    const previousName=selected?.getClip().name;
    const phase=smooth&&gaitSpeed[previousName]&&gaitSpeed[name]?selected.time/selected.getClip().duration:0;
    if(!smooth)distance=0;
    selected=mixer.clipAction(clip);currentBlend.select(selected,phase,smooth);seqClock=selected.time;
    const oldClip=previousClips.find(c=>c.name===name);previousAction=oldClip?previousMixer.clipAction(oldClip):null;
    oldBlend.select(previousAction,phase,smooth);last=performance.now();
    previousLandmark=null;
    applySolo();
    for(const b of document.querySelectorAll('[data-motion]')) b.setAttribute('aria-pressed',String(b.dataset.motion===name.toLowerCase()));
    el('phases').hidden=!/cast/i.test(name);

    samplePose(0);
    timeline.value=Math.round(phase*1000);
    needsRender=true;
  }
  if(animations.length){
    select.value=(animations.find(c=>/idle/i.test(c.name))||animations[0]).name;
    setClip(select.value);
  }else{
    select.add(new Option('静态',''));select.disabled=true;el('pause').disabled=true;timeline.disabled=true;
  }
  select.addEventListener('change',()=>{
    const name=select.value, route=name===seqName?'sequence':name.toLowerCase();
    if(Object.hasOwn(routeView,route))playRoute(route,true,isFace(viewKey)?viewKey:null);
    else {setClip(name);paused=false;updatePause();showReference('portrait','head');focusView('head');}
  });
  el('speed').addEventListener('change',updatePause);
  el('pause').addEventListener('click',()=>{paused=!paused;if(paused)settle();else{previousLandmark=null;last=performance.now();}updatePause()});
  timeline.addEventListener('input',()=>{
    if(!selected) return;
    settle();previousLandmark=null;paused=true;updatePause();
    // The last instant of a looping clip is the first instant of its next cycle.
    selected.time=(Number(timeline.value)/1000)*selected.getClip().duration*.999999;
    seqClock=selected.time;
    distance=isSequence()&&seq?seq.distance(seqClock*(seq.duration/selected.getClip().duration)):selected.time*(gaitSpeed[select.value]||0);
    samplePose(0);
    needsRender=true;
  });
  const isolation=el('isolate');
  let saved;
  isolation.addEventListener('click',()=>{
    const oldRef=el('ref-frame').dataset.ref;
    const ref=oldRef==='portrait'?(isHand(viewKey)||viewKey==='gesture'?'wand':'coat'):oldRef;
    if(!isolated&&!equipment[ref].length)return;
    for(const btn of document.querySelectorAll('[data-motion]')) btn.disabled=!isolated;
    el('cast-demo').disabled=!isolated;el('phases').hidden=!isolated||!/cast/i.test(select.value);
    if(!isolated){
      saved={name:select.value,time:selected?.time||0,distance,paused,ref,oldRef,
        shot:document.querySelector('#views [aria-pressed=true]')?.dataset.view,
        position:camera.position.clone(),target:controls.target.clone(),zoom:camera.zoom,
        frameHeight,frameWidth};
      const rest=animations.find(c=>/idle/i.test(c.name));
      if(rest){select.value=rest.name;setClip(rest.name);}
      paused=true;updatePause();isolated=true;
      if(oldRef==='portrait')showReference(ref);
    }else{
      isolated=false;preparedRef=null;mount.quaternion.identity();mount.position.set(0,0,0);
      flashStart=null;el('spark').hidden=true;
      mount.updateMatrixWorld(true);
      for(const n of meshes)n.visible=true;
      floor.visible=true;
      if(saved.name){select.value=saved.name;setClip(saved.name);selected.time=saved.time;seqClock=saved.time;distance=saved.distance;samplePose(0);}
      paused=saved.paused;updatePause();
      if(selected)timeline.value=Math.round(1000*selected.time/selected.getClip().duration);
    }
    applySolo();
    isolation.setAttribute('aria-pressed',String(isolated));
    isolation.textContent=isolated?'恢复穿戴':'仅看装备';
    document.querySelector('.grid').dataset.isolated=String(isolated);
    document.querySelector('[data-view=wand]').textContent=isolated?'魔杖':'持杖';
    for(const key of Object.keys(portraitLabels))document.querySelector('[data-view='+key+']').disabled=isolated;
    document.querySelector('button[data-ref=portrait]').disabled=isolated;
    for(const opt of el('mobile-view').options)opt.disabled=isolated&&isPortrait(opt.value);
    for(const name of ['coat','boots','wand']){
      document.querySelector('button[data-ref='+name+']').disabled=isolated&&!equipment[name].length;
      if(name!=='coat')document.querySelector('button[data-view='+name+']').disabled=isolated&&!equipment[name].length;
    }
    select.disabled=el('speed').disabled=el('pause').disabled=timeline.disabled=isolated||!animations.length;
    focusView(ref==='coat'?'front':ref);
    if(!isolated&&saved.ref===ref){
      if(saved.oldRef==='portrait'){
        showReference('portrait',isPortrait(saved.shot)?saved.shot:lastPortrait);
        focusView(saved.shot);
        renderer.setPixelRatio(Math.max(2,Math.min(devicePixelRatio,2.4)));
      }
      camera.position.copy(saved.position);controls.target.copy(saved.target);
      frameHeight=saved.frameHeight;frameWidth=saved.frameWidth;camera.zoom=saved.zoom;
      controls.update();resize();
      pressed('button[data-view]','view',saved.shot||'');el('mobile-view').value=saved.shot||'';
      if(!saved.shot)followHand=null;
    }
    needsRender=true;
  });
  updatePause();
  focusView('stance');
  function castView(play,frame) {
    const cast=animations.find(c=>/^cast$/i.test(c.name));
    if(!cast||isolated)return;
    select.value=cast.name;setClip(cast.name);paused=!play;updatePause();
    if(frame!==undefined){selected.time=cast.duration*frame/76;samplePose(0);timeline.value=Math.round(frame/76*1000);}
    previousLandmark=frame===undefined?null:frame;
    showReference('portrait','gesture');focusView('gesture');needsRender=true;
  }
  function toggleTrace(value){
    traceEnabled=value;el('trace').setAttribute('aria-pressed',String(value));needsRender=true;
  }
  el('trace').addEventListener('click',()=>toggleTrace(!traceEnabled));

  for(const button of document.querySelectorAll('[data-phase]')){
    button.addEventListener('click',()=>{
      if(button.dataset.phase==='circle')toggleTrace(true);
      castView(false,assets.cameras.phases[button.dataset.phase]);
    });
  }
  const routeView={idle:'stance',walk:'stride',run:'stride',cast:'gesture',face:'head',headturn:'head',sequence:'sequence'};
  function playRoute(route,writeHash=false,holdView=null) {
    if(!Object.hasOwn(routeView,route)||isolated)return;
    const name=route==='sequence'?seqName:route==='face'?'Idle':animations.find(c=>c.name.toLowerCase()===route)?.name;
    if(!name||![...select.options].some(o=>o.value===name))return;
    const hash=holdView?'face-'+route:route;
    if(writeHash&&location.hash!=='#'+hash)history.replaceState(null,'','#'+hash);
    if(route==='cast'&&!holdView){castView(true);return;}
    const smooth=writeHash&&route!=='face'&&gaitTransition(selected?.getClip().name,name);
    const cameraKey=holdView||routeView[route];
    const from=smooth&&!holdView&&!isFace(viewKey)&&cameraKey!==viewKey?cameraState():null;
    select.value=name;setClip(name,smooth);paused=false;updatePause();
    showReference('portrait',cameraKey);if(!holdView||cameraKey!==viewKey)focusView(cameraKey);
    if(from){cameraMove={a:from,b:cameraState(),elapsed:0};blendCamera(0);}

    if(route==='face')for(const b of document.querySelectorAll('[data-motion]'))b.setAttribute('aria-pressed',String(b.dataset.motion==='face'));
    if(route==='sequence')for(const b of document.querySelectorAll('[data-motion]'))b.setAttribute('aria-pressed',String(b.dataset.motion==='sequence'));

  }
  for(const btn of document.querySelectorAll('[data-motion]')){
    btn.disabled=btn.dataset.motion==='sequence'?!seq&&!builtSequence:btn.dataset.motion==='face'?false:!animations.some(c=>c.name.toLowerCase()===btn.dataset.motion);
    btn.addEventListener('click',()=>playRoute(btn.dataset.motion,true));
  }
  function openRoute(){
    const route=location.hash.slice(1).toLowerCase()||'idle';
    if(route.startsWith('face-'))playRoute(route.slice(5),false,'head');
    else playRoute(route);
  }
  window.addEventListener('hashchange',openRoute);openRoute();
  function drawBoth() {
    const clipTime=selected?selected.time/selected.getClip().duration:0;
    const traceEligible=viewKey==='gesture'&&!isolated&&/^cast$/i.test(select.value);
    traces.current.line.visible=false;traces.previous.line.visible=false;
    if(el('ref-frame').dataset.ref==='portrait'&&!isolated&&grid.dataset.solo!=='true'){
      const time=selected?selected.time/selected.getClip().duration:0;
      if(previousAction){
        oldBlend.each(a=>{if(a===previousAction)return;const c=animations.find(c=>c.name===a.getClip().name),master=c&&mixer.existingAction(c);
          if(master)a.time=master.time/master.getClip().duration*a.getClip().duration;});
        previousAction.time=previousLandmark!==null&&paused?Math.min(previousLandmark/24,previousAction.getClip().duration-.00001):Math.min(time,.999999)*previousAction.getClip().duration;
        previousMixer.update(0);
      }
      previous.updateMatrixWorld(true);
      previousCamera.copy(camera);
      if(isFace(viewKey)){
        const c=headBone.localToWorld(headLocal.clone()),o=oldHeadBone.localToWorld(oldHeadLocal.clone());
        previousCamera.position.add(o.sub(c));
      }
      if(isHand(viewKey)){
        const currentCenter=handBone.localToWorld(gripLocal.clone());
        const oldCenter=oldHandBone.localToWorld(previousGripLocal.clone());
        previousCamera.position.add(oldCenter.sub(currentCenter));
      }
      mount.visible=false;previous.visible=true;
      updateTrace(traces.previous,previousAction?previousAction.time/previousAction.getClip().duration:0,traceEligible);
      floorAt(oldFeet);renderer.render(scene,previousCamera);
      traces.previous.line.visible=false;
      if(comparisonCanvas.width!==canvas.width||comparisonCanvas.height!==canvas.height){
        comparisonCanvas.width=canvas.width;comparisonCanvas.height=canvas.height;
      }
      comparisonContext.clearRect(0,0,canvas.width,canvas.height);
      comparisonContext.drawImage(canvas,0,0);
      previous.visible=false;mount.visible=true;
    }
    updateTrace(traces.current,clipTime,traceEligible);
    floorAt(currentFeet);renderer.render(scene,camera);
  }
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  function draw(now) {
    const dt=Math.max(0,(now-last)/1000);
    if(!paused&&dt>.18)slowFrames++;else slowFrames=0;
    if(slowFrames>=3&&playbackRatio>.65){
      playbackRatio=playbackRatio>1?.92:.64;
      renderer.setPixelRatio(Math.min(devicePixelRatio,playbackRatio));resize();slowFrames=0;
    }
    last=now;
    if(!document.hidden) {
      if(!paused){
        const playbackDt=dt*(gaitSpeed[select.value]?GAME_GAIT_RATE:1);
        const delta=playbackDt*mixer.timeScale,old=seqClock,fromSpeed=currentBlend.speed(gaitSpeed);
        currentBlend.update(delta);oldBlend.update(delta);
        if(cameraMove){cameraMove.elapsed+=delta;blendCamera(cameraMove.elapsed/.36);}
        samplePose(playbackDt,dt*mixer.timeScale);seqClock=selected?.time||0;
        if(isSequence()&&seq){
          const duration=selected.getClip().duration,scale=seq.duration/duration;
          distance+=seq.distance(seqClock*scale)-seq.distance(old*scale)+Math.floor((old+delta)/duration)*seq.distance(seq.duration);
        }else distance+=delta*(fromSpeed+currentBlend.speed(gaitSpeed))*.5;
      }
      if(flashStart!==null&&flash){
        const duration=flashTrack.times[flashTrack.times.length-1];
        const time=Math.min(duration,(now-flashStart)/1000);
        garnet.scale.fromArray(flash.evaluate(Math.max(0,time)));
        needsRender=true;
        if(time>=duration)flashStart=null;
      }
      if (selected&&!paused) timeline.value=Math.round(1000*selected.time/selected.getClip().duration);
      if (followHand||isFace(viewKey)) {
        if(followHand)handBone.localToWorld(handPosition.copy(followHand));
        else headBone.localToWorld(handPosition.copy(headLocal));
        const shift=handPosition.clone().sub(lastHand);
        camera.position.add(shift);controls.target.add(shift);
        lastHand.copy(handPosition);
      }
      controls.update();
      if(needsRender||(!paused&&selected)){
        drawBoth();needsRender=false;
      }
    }
    requestAnimationFrame(draw);
  }
  drawBoth();
  el('poster')?.remove();el('status').hidden=true;
  requestAnimationFrame(draw);
}
start().catch(error=>{
  console.error(error);
  el('status').textContent='当前浏览器无法绘制三维画面。请用支持 WebGL 的桌面浏览器打开。';
  el('model').hidden=true;
  for(const n of document.querySelectorAll('#views button,.controls button,.controls select,.controls input')) n.disabled=true;
});
