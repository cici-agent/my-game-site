import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import { createCharacterMotion } from '../../js/magic/character-motion.js';

const $ = selector => document.querySelector(selector);
const status = $('#status');
function message(text, error = false) {
  status.hidden = !text;
  status.textContent = text;
  status.dataset.error = String(error);
}
const unsupported = '请选择支持的 VRM 1.0 人形模型。';
function localAvatar(raw) {
  if (raw.byteLength < 28) throw new Error(unsupported);
  const header = new DataView(raw);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
      header.getUint32(8,true) !== raw.byteLength || header.getUint32(16, true) !== 0x4e4f534a) throw new Error(unsupported);
  const size = header.getUint32(12, true);
  if (!size || size > raw.byteLength - 20) throw new Error(unsupported);
  let model;
  try { model = JSON.parse(new TextDecoder().decode(new Uint8Array(raw,20,size))); }
  catch { throw new Error(unsupported); }
  if (model.extensions?.VRM && !model.extensions?.VRMC_vrm) throw new Error('这个文件是 VRM 0.x，请选择 VRM 1.0 模型。');
  if (model.extensions?.VRMC_vrm?.specVersion !== '1.0') throw new Error(unsupported);
  if ([...(model.buffers || []),...(model.images || [])].some(item => item.uri && !/^data:/i.test(item.uri))) {
    throw new Error('模型引用了外部文件，请改用已内嵌贴图和网格的 VRM。');
  }
}
function releaseScene(scene) {
  if (!scene) return;
  const images = new Set();
  scene.traverse(node => {
    for (const material of [].concat(node.material || [])) {
      for (const value of Object.values(material)) {
        if (value?.isTexture && value.image?.close) images.add(value.image);
      }
    }
  });
  scene.removeFromParent();
  VRMUtils.deepDispose(scene);
  for (const img of images) img.close();
}
const fromBase64 = value => Uint8Array.from(atob(value), c=>c.charCodeAt(0)).buffer;
const vec = () => new THREE.Vector3();
const motionNames = ['Idle','Walk','Run','Cast'];

async function main() {
  const canvas = $('#stage');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'}); }
  catch { $('#choose').disabled = true; throw new Error('浏览器未能启用 3D 显示，请在支持 WebGL 2 的浏览器中打开。'); }
  renderer.setPixelRatio(Math.min(1.6, window.devicePixelRatio || 1));
  renderer.setClearColor(0,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32,1,.01,1000);
  const orbit = new OrbitControls(camera,canvas);
  orbit.enableDamping = true;
  orbit.enablePan = false;
  orbit.minPolarAngle = Math.PI * .21;
  orbit.maxPolarAngle = Math.PI * .50;
  orbit.dampingFactor = .14;
  scene.add(new THREE.HemisphereLight(0xfff3da,0xcdd3bf,.68));
  const key = new THREE.DirectionalLight(0xfff1db,1.15);
  key.position.set(-2,4,3);
  const fill = new THREE.DirectionalLight(0xe2edff,.30);
  fill.position.set(3,2,-1);
  scene.add(key,fill);

  // A finite patch with fading lines gives a scale and direction reference
  // when testing new avatars, without adding a horizon behind the character.
  const gridMat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, uniforms:{travel:{value:0},spacing:{value:.25},radius:{value:3}},
    vertexShader:'varying vec3 stage; void main(){stage=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 stage; uniform float travel,spacing,radius; void main(){vec2 uv=(stage.xy+vec2(0.,-travel))/spacing; vec2 edge=abs(fract(uv-.5)-.5)/max(fwidth(uv),vec2(.001)); float line=1.-min(min(edge.x,edge.y),1.); float fade=1.-smoothstep(radius*.22,radius,length(stage.xy)); gl_FragColor=vec4(.40,.48,.36,line*fade*.30);}'
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(100,100),gridMat);
  grid.rotation.x = -Math.PI/2;
  scene.add(grid);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 96;
  const ctx = shadowCanvas.getContext('2d');
  const radial = ctx.createRadialGradient(48,48,0,48,48,48);
  radial.addColorStop(0,'rgba(44,52,36,.31)');radial.addColorStop(.48,'rgba(45,54,38,.18)');radial.addColorStop(1,'rgba(45,54,38,0)');
  ctx.fillStyle=radial;ctx.fillRect(0,0,96,96);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.001;scene.add(shadow);

  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url=>{
    if (!/^(blob:|data:)/i.test(url)) throw new Error('已阻止外部资源，请使用自包含的 VRM 文件。');
    return url;
  });
  const loader = new GLTFLoader(manager);
  loader.register(parser=>new VRMLoaderPlugin(parser));
  loader.register(parser=>new VRMAnimationLoaderPlugin(parser));
  const element = $('#assets'), assets = JSON.parse(element.textContent);
  element.remove();
  const motions = await Promise.all(motionNames.map(async name=>{
    const parsed = await loader.parseAsync(fromBase64(assets[name]),'');
    return parsed.userData.vrmAnimations[0];
  }));
  let current = null;
  let choice = 'Walk', paused = false, view = 'angle', token = 0;
  const orbitAngles = {front:0,angle:.47,side:Math.PI*.49};
  function frame() {
    if(!current) return;
    const {height,width} = current;
    const tan = Math.tan(camera.fov*Math.PI/360);
    const distance = 1.15*Math.max(height*.53/tan,width*.6/(tan*camera.aspect));
    const yaw = orbitAngles[view] ?? .47;
    orbit.target.set(0,height*.50,0);
    camera.position.set(Math.sin(yaw)*distance,height*.57+distance*.06,Math.cos(yaw)*distance);
    camera.near=Math.max(.004,height*.006);camera.far=height*50;camera.updateProjectionMatrix();
    orbit.minDistance=height*.6;orbit.maxDistance=height*6;orbit.update();
  }
  function resize() {
    const bounds=canvas.parentElement.getBoundingClientRect();
    renderer.setSize(bounds.width,bounds.height,false);
    camera.aspect=bounds.width/Math.max(1,bounds.height);camera.updateProjectionMatrix();
    if(current) frame();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);resize();
  function stateMotion(name) {
    choice=name;
    for(const button of document.querySelectorAll('[data-motion]'))button.setAttribute('aria-pressed',String(button.dataset.motion===name));
  }
  function setPause(value) {
    paused=value;
    $('#pause').setAttribute('aria-pressed',String(value));
    $('#pause').textContent=value?'继续播放':'暂停';
  }
  function dispose(model) {
    if(!model) return;
    model.mixer.stopAllAction();model.mixer.uncacheRoot(model.vrm.scene);
    model.group.removeFromParent();
    releaseScene(model.vrm.scene);
  }
  function build(gltf) {
    const vrm=gltf.userData.vrm;
    if(!vrm || vrm.meta.metaVersion!=='1') throw new Error(unsupported);
    const bone=n=>vrm.humanoid.getRawBoneNode(n);
    for(const name of ['hips','head','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']) {
      if(!bone(name)) throw new Error('模型缺少必需的人形骨骼，请检查头部和双腿的绑定。');
    }
    if(vrm.lookAt) {
      const proxy=new VRMLookAtQuaternionProxy(vrm.lookAt);
      proxy.name='VRMLookAtQuaternionProxy';vrm.scene.add(proxy);
    }
    const clips=motions.map((motion,i)=>{
      const clip=createVRMAnimationClip(motion,vrm);
      clip.name=motionNames[i];
      return clip;
    });
    vrm.scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(vrm.scene,true);
    const size=bounds.getSize(vec()),middle=bounds.getCenter(vec());
    const a=bone('leftUpperLeg').getWorldPosition(vec()),b=bone('leftLowerLeg').getWorldPosition(vec()),c=bone('leftFoot').getWorldPosition(vec());
    const height=size.y, leg=a.distanceTo(b)+b.distanceTo(c);
    if(!(leg>0) || !(height>0) || !Number.isFinite(height+size.x+leg)) throw new Error('模型的人形尺寸无法读取，请检查模型的绑定姿态。');
    // Hips and head frame the body even when a rest T-pose spreads wide arms.
    const group=new THREE.Group();
    group.position.set(-middle.x,-bounds.min.y,-middle.z);
    group.add(vrm.scene);
    const mixer=new THREE.AnimationMixer(vrm.scene);
    const ratio=leg/.7627;
    const gait=createCharacterMotion(mixer,clips,[{name:'Walk',extras:{groundSpeed:1.09*ratio}},{name:'Run',extras:{groundSpeed:2.34*ratio}}]);
    const cast=mixer.clipAction(clips.find(clip=>clip.name==='Cast'));
    cast.setLoop(THREE.LoopRepeat,Infinity);
    return {vrm,mixer,gait,cast,castWeight:0,group,height,width:Math.min(size.x,height*.65),speed:0};
  }
  async function load(file) {
    const ticket=++token;
    message(file?'正在读取本地角色…':'正在载入示例…');
    let candidate,gltf;
    try {
      const raw=file?await file.arrayBuffer():fromBase64(assets.sample);
      if(ticket!==token)return;
      localAvatar(raw);
      gltf=await loader.parseAsync(raw,'');
      if(ticket!==token){releaseScene(gltf.scene);return;}
      candidate=build(gltf);
      const old=current;current=candidate;candidate=null;
      dispose(old);
      scene.add(current.group);
      current.isSample=!file;
      const meta=current.vrm.meta;
      $('#name').textContent=file?(meta.name || file.name):'示例角色';
      $('#credit').textContent=file?file.name:'pixiv · VRM 1.0';
      $('#footnote').textContent=file?(meta.authors?.length?'模型作者 · '+meta.authors.slice(0,3).join('、'):'本地模型'):'示例模型 © 2022 pixiv Inc.';
      $('#restore').disabled=!file;
      const h=current.height;
      gridMat.uniforms.radius.value=1.75*h;gridMat.uniforms.spacing.value=h*.14;
      gridMat.uniforms.travel.value=0;shadow.scale.set(h*.53,h*.43,1);
      frame();setPause(false);
      message('');
    }catch(e){
      if(candidate)dispose(candidate);else if(gltf?.scene && current?.vrm.scene!==gltf.scene)releaseScene(gltf.scene);
      if(ticket===token)message(e.message?.match(/[\u4e00-\u9fff]/)?e.message:'读取失败，请选择完整的 VRM 1.0 文件。',true);
    }
  }
  $('#choose').addEventListener('click',()=>$('#file').click());
  $('#file').addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';if(file)load(file);});
  $('#restore').addEventListener('click',()=>load(null));
  for(const button of document.querySelectorAll('[data-motion]'))button.addEventListener('click',()=>{
    stateMotion(button.dataset.motion);setPause(false);
  });
  $('#pause').addEventListener('click',()=>setPause(!paused));
  for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{
    view=button.dataset.view;frame();
    for(const item of document.querySelectorAll('[data-view]'))item.setAttribute('aria-pressed',String(item===button));
  });
  orbit.addEventListener('start',()=>{
    for(const item of document.querySelectorAll('[data-view]'))item.setAttribute('aria-pressed','false');
  });
  await load(null);
  let last=performance.now();
  renderer.setAnimationLoop(time=>{
    const dt=Math.min(.06,Math.max(0,(time-last)/1000))*Number($('#tempo').value);
    last=time;if(document.hidden)return;
    if(current && !paused) {
      const g=current.gait,target=choice==='Run'?g.runSpeed:choice==='Walk'?g.walkSpeed:0;
      const previous=current.speed;
      current.speed=target+(previous-target)*Math.exp(-8*dt);
      if(current.speed<.0001)current.speed=0;
      const delta=.5*(current.speed+previous)*dt;
      const casting=choice==='Cast';
      const priorWeight=current.castWeight;
      // One mixer owns all four clips. Its gait layer yields as the reusable
      // cast starts and resumes from its current stride when the user switches.
      current.castWeight=THREE.MathUtils.clamp(priorWeight+(casting?1:-1)*dt/.22,0,1);
      if (casting && !priorWeight) current.cast.reset().play();
      current.cast.setEffectiveWeight(current.castWeight);
      if (!current.castWeight && priorWeight) current.cast.stop();
      g.update(dt,delta,1-current.castWeight);
      current.vrm.update(dt);
      gridMat.uniforms.travel.value=(gridMat.uniforms.travel.value+delta*(1-current.castWeight))%gridMat.uniforms.spacing.value;
    }
    orbit.update();renderer.render(scene,camera);
  });
}
main().catch(e=>message(e.message || '无法打开角色预览。',true));
