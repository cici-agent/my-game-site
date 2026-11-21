import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createGaitFloor} from './gait-floor.mjs';
import {GAME_GAIT_RATE} from '../js/magic/character-motion.js';
import {createTravelExpression} from '../js/magic/portrait-expression.js';

const byId = id => document.getElementById(id);
const canvas = byId('portrait'), stage = canvas.parentElement;
const modes = {
  run: {clip:'Run', title:'跑步', angle:'side'},
  cast: {clip:'Cast', title:'施法', angle:'quarter'},
  face: {clip:'Idle', title:'面部特写', angle:'front'}
};
const angles = {front:0, quarter:29, side:-78};
const shotNames = {front:'正面', quarter:'侧前方', side:'侧面'};
const readMode = () => {
  const hash = location.hash.slice(1).toLowerCase();
  return Object.hasOwn(modes, hash) ? hash : 'run';
};
const setCurrent = mode => {
  for(const link of document.querySelectorAll('[data-mode]')) {
    link.setAttribute('aria-current',String(link.dataset.mode===mode));
  }
  byId('stage-mode').textContent = modes[mode].title;
};
setCurrent(readMode());

async function start({name, modelFile, wandName}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'high-performance'});
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.035;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer);
  const env = generator.fromScene(room,.04);
  room.dispose();generator.dispose();scene.environment=env.texture;scene.environmentIntensity=.44;
  scene.add(new THREE.HemisphereLight(0xfff8ed,0xb5afa5,.92));
  function directional(color,intensity,x,y,z) {
    const light=new THREE.DirectionalLight(color,intensity);
    light.position.set(x,y,z);scene.add(light);return light;
  }
  const key=directional(0xfff2df,1.82,-2.8,3.9,3.15);
  key.target.position.set(0,.78,0);scene.add(key.target);
  key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-1.8,right:1.8,top:1.8,bottom:-1.8,near:.1,far:12});
  key.shadow.camera.updateProjectionMatrix();key.shadow.radius=4.5;
  key.shadow.bias=-.00024;key.shadow.normalBias=.0018;
  directional(0xf1f3ff,.56,2.5,1.85,3.2);
  directional(0xffefdb,.83,1.2,2.75,-2.25);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.ShadowMaterial({opacity:.18,depthWrite:false}));
  shadow.material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 shadowPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nshadowPosition=position.xy;');
    shader.fragmentShader='varying vec2 shadowPosition;\n'+shader.fragmentShader.replace('opacity * ( 1.0 - getShadowMask() )','opacity * ( 1.0 - getShadowMask() ) * exp(-3.8*dot(shadowPosition,shadowPosition))');
  };
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.002;shadow.receiveShadow=true;scene.add(shadow);
  const floor = createGaitFloor();scene.add(floor);
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,30);
  const orbit = new OrbitControls(camera,canvas);
  orbit.enablePan=false;orbit.minZoom=.65;orbit.maxZoom=3.8;
  orbit.minPolarAngle=.15;orbit.maxPolarAngle=Math.PI*.52;orbit.rotateSpeed=.75;
  const model = await new GLTFLoader().loadAsync('../assets/3d/magic/characters/'+modelFile,e=>{
    if(!e.lengthComputable)return;
    const percent=Math.min(100,Math.floor(e.loaded*100/e.total));
    byId('status').textContent=percent<100?'正在载入'+name+' · '+percent+'%':'正在准备动作…';
  });
  const root = model.scene;scene.add(root);root.updateMatrixWorld(true);
  root.traverse(node => {
    if(!node.isMesh)return;
    if(node.isSkinnedMesh){node.frustumCulled=false;node.skeleton.update();}
    const name=node.material?.name || '';
    const detailed=/eyelid|eyelash|lash|iris|lip|catchlight|nail|silk|thread|stitch|glint/i.test(name);
    node.castShadow=!detailed && !node.material?.transparent;
    node.receiveShadow=!detailed;
  });
  const head = root.getObjectByName('Head');
  const footL = root.getObjectByName('FootL'),footR = root.getObjectByName('FootR');
  const mixer = new THREE.AnimationMixer(root),clips = new Map(model.animations.map(clip=>[clip.name,clip]));
  for(const {clip} of Object.values(modes)) {
    if(!clips.has(clip)) throw Error('缺少动作 '+clip);
  }
  // The guide is made from the animated tip of this wand in its own hand grip.
  function makeGuide() {
    const hand=root.getObjectByName('HandR'), wand=root.getObjectByName(wandName);
    if(!hand || !wand)return null;
    const wrist=hand.getWorldPosition(new THREE.Vector3());
    const vertex=new THREE.Vector3(),furthest=new THREE.Vector3();let span=0;
    wand.traverse(mesh=>{
      if(!mesh.isMesh)return;
      for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
        mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);
        const distance=vertex.distanceToSquared(wrist);
        if(distance>span){span=distance;furthest.copy(vertex);}
      }
    });
    if(!span)return null;
    const tip=hand.worldToLocal(furthest),clip=clips.get('Cast'),action=mixer.clipAction(clip);
    const phases=model.parser.json.animations.find(a=>a.name==='Cast')?.extras?.phases;
    const start=phases?.circleStart ?? clip.duration*12/76;
    const end=phases?.circleEnd ?? clip.duration*42/76;
    const points=[];action.play();
    for(let i=0;i<=60;i++){
      action.time=start+(end-start)*i/60;mixer.update(0);
      points.push(hand.localToWorld(tip.clone()));
    }
    action.stop();mixer.update(0);root.updateMatrixWorld(true);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({color:0xa45e2d,depthWrite:false,transparent:true}));
    scene.add(line);line.visible=false;
    return {line,start,end,count:points.length};
  }
  const guide=makeGuide();
  const height = new THREE.Box3().setFromObject(root,true).getSize(new THREE.Vector3()).y;
  const headFocus = new THREE.Vector3(),lastHead = new THREE.Vector3();
  const faceTravel = createTravelExpression(root);
  const vector = new THREE.Vector3(), shift = new THREE.Vector3();
  function getHeadFocus(out) {
    head.getWorldPosition(out);out.y+=.025*height;out.z+=.011*height;return out;
  }
  let mode,active,angle,paused=false,finished=false,groundTravel=0;
  const speed = byId('speed'),timeline = byId('timeline'),play = byId('play');
  const authorSpeed = model.parser.json.animations.find(a=>a.name==='Run')?.extras?.groundSpeed ?? 2.34;
  function resize() {
    if(!mode)return;
    const w=stage.clientWidth,h=stage.clientHeight,aspect=w/h;
    const frameHeight=(mode==='face'?.267:1.13)*height;
    const frameWidth=(mode==='face'?.204:mode==='cast'?.83:.58)*height;
    const half=Math.max(frameHeight/2,frameWidth/(2*aspect));
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.65,Math.sqrt(1750000/(w*h))));
    renderer.setSize(w,h,false);
  }
  new ResizeObserver(resize).observe(stage);
  function view(value) {
    angle=value;const close=mode==='face';
    const rad=THREE.MathUtils.degToRad(angles[value]);
    const target=orbit.target;
    if(close) {getHeadFocus(target);lastHead.copy(target);}
    else target.set(mode==='cast'?-.065:0,height*.493,mode==='cast'?.08:0);
    const elevation=close?.018:.084;
    vector.set(Math.sin(rad),elevation,Math.cos(rad)).normalize();
    camera.zoom=1;camera.position.copy(target).addScaledVector(vector,height*3.5);
    orbit.update();resize();
    for(const b of document.querySelectorAll('[data-angle]'))b.setAttribute('aria-pressed',String(b.dataset.angle===value));
    byId('shot').textContent=shotNames[value]+(close?'近景':'全身');
  }
  function labelPlayback(){
    play.textContent=finished?'重播施法':paused?'播放':'暂停';
    play.setAttribute('aria-label',play.textContent);
  }
  function select(next) {
    if(active)active.stop();
    faceTravel?.restore();
    mode=next;setCurrent(mode);active=mixer.clipAction(clips.get(modes[mode].clip));
    const once=mode==='cast';
    active.reset();active.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);
    active.clampWhenFinished=once;active.play();mixer.update(0);root.updateMatrixWorld(true);
    paused=false;finished=false;groundTravel=0;timeline.value='0';
    byId('trace-control').hidden=mode!=='cast'||!guide;
    floor.visible=mode!=='face';view(modes[mode].angle);labelPlayback();
  }
  mixer.addEventListener('finished',e=>{
    if(e.action===active && mode==='cast'){finished=true;paused=true;labelPlayback();}
  });
  function togglePlay() {
    if(finished){select(mode);return}
    paused=!paused;labelPlayback();
  }
  function scrub() {
    faceTravel?.restore();
    paused=true;finished=false;active.paused=false;active.enabled=true;
    const duration=active.getClip().duration;
    const progress=Number(timeline.value)/1000;
    active.time=Math.min(duration-.000001,progress*duration);
    mixer.update(0);
    if(mode==='run')groundTravel=active.time*authorSpeed;
    if(mode==='cast' && progress===1)finished=true;
    labelPlayback();
  }
  for(const b of document.querySelectorAll('[data-angle]'))b.addEventListener('click',()=>view(b.dataset.angle));
  orbit.addEventListener('start',()=>{
    for(const b of document.querySelectorAll('[data-angle]'))b.setAttribute('aria-pressed','false');
    byId('shot').textContent=mode==='face'?'自由近景':'自由视角';
  });
  for(const a of document.querySelectorAll('[data-mode]'))a.addEventListener('click',()=>{
    if(location.hash==='#'+a.dataset.mode)select(a.dataset.mode);
  });
  addEventListener('hashchange',()=>select(readMode()));
  play.addEventListener('click',togglePlay);
  canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();togglePlay();}});
  timeline.addEventListener('input',scrub);
  play.disabled=false;timeline.disabled=false;select(readMode());
  byId('status').hidden=true;
  let previous=performance.now();
  document.addEventListener('visibilitychange',()=>{previous=performance.now();});
  renderer.setAnimationLoop(now=>{
    const seconds=Math.max(0,Math.min((now-previous)/1000,.36))*Number(speed.value);previous=now;
    if(document.hidden)return;
    const running=mode==='run';
    if(!paused) {
      faceTravel?.restore();
      const dt=running?seconds*GAME_GAIT_RATE:seconds;mixer.update(dt);
      if(running){faceTravel?.apply(seconds,1,1);groundTravel+=dt*authorSpeed;}
      timeline.value=String(Math.round(1000*active.time/active.getClip().duration));
    }
    if(mode==='face') {
      getHeadFocus(headFocus);shift.copy(headFocus).sub(lastHead);
      orbit.target.add(shift);camera.position.add(shift);lastHead.copy(headFocus);
    }
    if(guide) {
      const {line,start,end,count}=guide,t=active.time;
      line.visible=mode==='cast' && byId('trace').checked && t>=start && t<end+.74;
      if(line.visible) {
        line.geometry.setDrawRange(0,1+Math.floor((count-1)*Math.min(1,(t-start)/(end-start))));
        line.material.opacity=.8*Math.min(1,Math.max(0,(end+.74-t)/.4));
      }
    }
    if(floor.visible) {
      const u=floor.material.uniforms;u.travel.value=groundTravel%9.6;
      footL.getWorldPosition(u.left.value);footR.getWorldPosition(u.right.value);
    }
    orbit.update();renderer.render(scene,camera);
  });
}
export function openCharacterStudio(character) {
  start(character).catch(error=>{
    const msg=byId('status');
    msg.hidden=false;
    msg.textContent=character.name+'的三维预览未能载入。';
    const retry=document.createElement('a');
    retry.href=location.href;retry.textContent='重新载入';
    msg.append(' ',retry);
    console.error(error);
  });
}
