import * as THREE from 'three';
import {rings, tailPatch, costumePart} from './avatar-parts.mjs';
import {sculptHair} from './avatar-hair.mjs';
import {createOutfit} from './avatar-outfit.mjs';
import {supportsWardrobe} from './wardrobe.mjs';
import {createAvatarMotion,createLimbRig,orientHeldProp} from './avatar-motion.mjs';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const RADIUS = .32;
const labels = {
  base: ['新生'], harry: ['哈利', 'harry'], ron: ['罗恩', 'ron'], hermione: ['赫敏','hermione'],
  molly: ['莫丽','韦斯莱夫人','molly'], neville: ['纳威','neville'], george:['乔治','george'],
  hagrid: ['海格','hagrid'], mcgonagall: ['麦格','mcgonagall'],
  flitwick: ['弗立维','flitwick'], draco: ['德拉科','draco'],
  dumbledore: ['邓布利多','dumbledore'], lupin:['卢平','lupin'], snape: ['斯内普','snape']
};
const costumes = {
  base: {hair:0x513931, scarf:0x4f7567, style:'part'},
  harry: {hair:0x292423, scarf:0x98383a, glasses:true, style:'swept'},
  ron: {hair:0xb95b2d, scarf:0x994137, freckles:true, style:'crop',size:1.045},
  hermione: {hair:0x674232, scarf:0x962e3f, style:'curls',size:.99},
  molly: {hair:0xa74529, robe:0x765047, scarf:0xb86e40, style:'bun', adult:true},
  neville: {hair:0x594133, scarf:0x8f423b},
  george: {hair:0xc1693c, scarf:0x9f4a35, freckles:true, style:'swept',size:1.07},
  draco: {hair:0xdbbe8c, scarf:0x2c624e, style:'swept'},
  hagrid: {hair:0x513b30, robe:0x73563f, scarf:0x80583b, style:'curls', beard:true, size:1.27},
  mcgonagall: {hair:0x5a554e, robe:0x294d40, scarf:0x41634d, style:'bun', hat:true, adult:true, glasses:true},
  flitwick: {hair:0x8e8678, robe:0x45434c, scarf:0x70465a, beard:true, glasses:true, size:.86},
  dumbledore: {hair:0xcfccbf, robe:0x62536e, scarf:0x8f7993, beard:true, longBeard:true, hat:true, glasses:true, adult:true},
  lupin: {hair:0x8f8176,robe:0x736751,scarf:0x59604c,style:'swept',adult:true},
  snape: {hair:0x252527, robe:0x2b3034, scarf:0x48504c, style:'long', adult:true}
};
const colorways = [0x367768,0x985144,0x566e9b,0x9b763c,0x725483];

function hash(text) {
  let n = 7;
  for (const c of text) n = (Math.imul(n,31) + c.charCodeAt(0)) >>> 0;
  return n;
}

export function createAvatar({name='',variant='',color,isPlayer=false,equipment}={}) {
  const identity = (String(variant) + ' ' + name).toLowerCase();
  const person = Object.hasOwn(costumes,variant) ? variant : Object.keys(labels).find(key => labels[key].some(label=>identity.includes(label)));
  const modular = supportsWardrobe(person);
  const seed = hash(String(name) + String(variant)), design = costumes[person] || {};
  const scarf = color || design.scarf || colorways[seed%colorways.length];
  const faces = {base:0xc79778, harry:0xe0b398, ron:0xedbea0, hermione:0xc99578};
  const skin = faces[person] || [0xd3a485,0xe0b398,0xca9270,0xaf8063][person ? (person==='hagrid'?2:1) : seed%4];
  const hair = design.hair || [0x44302a,0x302a2c,0x684935,0x82553d][seed%4];
  const robe = design.robe || (isPlayer?0x293f49:0x38434d);
  const gold = 0xdcb773, shirt = 0xe5decc, shoe = 0x343136;
  const resources = [];
  const cloth = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide});
  const root = new THREE.Group();
  root.name = String(name);
  const body = new THREE.Group();
  body.name = 'Body';
  root.add(body);
  const figureScale = design.size || (design.adult ? 1.09 : 1);
  body.scale.setScalar(figureScale);
  const joint = (parent,x,y,z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x,y,z);
    parent.add(pivot);
    return pivot;
  };

  if (!modular) {
    const trunk = costumePart(body,cloth,resources);
    trunk.shape(rings([[.04,0],[.32,.02],[.35,.07],[.265,.34],[.235,.52],[.31,.75],[.265,.83],[.12,.87]]),
      robe,0,.48,0,1,1,.69);
    trunk.shape(tailPatch([[-.135,1.30,-.115],[.135,1.30,-.115],[0,1.03,-.18]]),shirt,0,0,0);
    trunk.shape(tailPatch([[-.037,1.27,-.135],[.032,1.27,-.135],[.038,1.115,-.176]]),scarf,0,0,0);
    trunk.shape(tailPatch([[-.17,1.32,-.12],[-.03,1.22,-.166],[-.19,.61,-.181]]),0x526063,0,0,0);
    trunk.shape(tailPatch([[.17,1.32,-.12],[.19,.61,-.181],[.03,1.22,-.166]]),0x526063,0,0,0);
    trunk.oval(scarf,0,1.335,-.007,.188,.068,.143);
    trunk.oval(scarf,.093,1.162,-.164,.061,.164,.03,-.05,0,-.09);
    trunk.oval(gold,.10,1.112,-.187,.056,.015,.012,0,0,-.08);
    trunk.oval(gold,.11,1.075,-.188,.052,.011,.012,0,0,-.08);
    // A loose scarf end remains visible from the player's normal over-the-shoulder view.
    trunk.oval(scarf,-.095,1.15,.159,.065,.196,.026,.07,0,-.14);
    trunk.oval(gold,-.113,1.037,.179,.058,.014,.01,0,0,-.14);
    trunk.oval(gold,-.117,1.002,.179,.052,.011,.01,0,0,-.14);
    trunk.oval(gold,-.155,1.16,-.155,.034,.041,.013);
    trunk.oval(0x344f48,-.155,1.165,-.168,.02,.028,.007);
    for(const side of [-1,1]) trunk.oval(0x30383d,side*.145,.57,-.179,.017,.055,.015,0,0,side*.29);
    trunk.finish();
  }

  const head = joint(body,0,modular?1.573:1.53,0);
  head.name='Head';
  const face = costumePart(head,cloth,resources);
  face.oval(skin,0,-.142,0,.088,.117,.083);
  face.oval(skin,0,.008,-.007,.181,.232,.164);
  for (const side of [-1,1]) {
    face.oval(skin,side*.176,.006,0,.039,.062,.044);
    if (modular) {
      const iris={harry:0x597657,ron:0x668698,hermione:0x6b4936,base:0x604b3b,neville:0x66583d,george:0x796c55}[person];
      face.oval(0xf2e8d6,side*.071,.03,-.152,.031,.020,.016);
      face.oval(iris,side*.071,.03,-.164,.016,.017,.009);
      face.oval(0x352d2a,side*.071,.03,-.170,.008,.013,.006);
      face.oval(0xf7eede,side*.071-.004,.035,-.176,.0037,.0037,.0025);
    } else face.oval(0x423631,side*.071,.032,-.155,.017,.021,.012);
    face.oval(hair,side*.071,.071,-.154,.044,.012,.016,0,0,side*.09);
    if(design.freckles) for(let i=0;i<5;i++) {
      const x=side*(.07+(i%3)*.019), y=-.008-.019*Math.floor(i/3);
      face.oval(0xad7556,x,y,-.157+(i%3)*.008,.005,.004,.005);
    }
    if(design.glasses) face.shape(new THREE.TorusGeometry(.055,.008,6,16),0x514442,side*.067,.03,-.166);
  }
  if(design.glasses) face.oval(0x514442,0,.03,-.168,.019,.006,.006);
  if(person==='harry') {
    // Two angled strokes of the lightning scar emerge between the fringe and eyebrow.
    patchScar(.028,.097,.052,-.53); patchScar(.035,.076,.035,.62);
    function patchScar(x,y,h,tilt) {
      face.shape(new THREE.BoxGeometry(.006,h,.006),0xa45c59,x,y,-.154,1,1,1,.22,0,tilt);
    }
    for(const side of [-1,1]) face.oval(0x514442,side*.129,.035,-.113,.007,.007,.061,0,side*.54,0);
  }
  face.oval(skin,0,-.003,-.164,.029,.032,.033);
  face.oval(0x9c6756,0,-.08,-.149,.036,.007,.008);
  if (modular) sculptHair(face,person==='neville'?'base':person==='george'?'ron':person,hair);
  else {
    face.oval(hair,0,.146,.014,.187,.126,.173);
    face.oval(hair,0,.04,.094,.183,.149,.106);
    const long = design.style === 'long' || design.style === 'curls';
    for (const side of [-1,1]) {
      face.oval(hair,side*.155,.058,.021,.044,long ? .192 : .078, long ? .101 : .073,0,0,side*.08);
    }
    if (design.style==='curls') {
      for(let i=0;i<11;i++){
        const a = -1.35+i*.27;
        face.oval(hair,.168*Math.sin(a),-.033+.02*Math.cos(i),.142*Math.cos(a),.071,.147,.077,.05,0,.12*Math.cos(i));
      }
    }
    if(design.style==='bun') face.oval(hair,0,.126,.184,.114,.106,.089);
    for(let i=0;i<4;i++) {
      const x = (i-1.5)*.064;
      const fringeY=.143+Math.abs(x)*.18;
      face.oval(hair,x,fringeY,-.107,.067,.09-(i%2)*.017,.061,.16,0,design.style === 'swept' ? .49 : .18);
    }
  }
  if(design.beard) {
    face.oval(hair,0,-.129,-.076,.143,design.longBeard ? .206 : .124,.113,-.10);
    for(const side of [-1,1]) face.oval(hair,side*.043,-.053,-.16,.061,.025,.023,0,0,side*.23);
  }
  if(design.hat) {
    const hat = design.robe || 0x364445;
    face.oval(hat,0,.211,0,.255,.026,.22,0,0,-.03);
    face.shape(rings([[.18,0],[.154,.085],[.099,.216],[.035,.308],[0,.322]],14),hat,-.01,.212,0,1,1,.94,0,0,.13);
    face.shape(rings([[.17,0],[.155,.042]],14),gold,-.007,.235,0,1,1,.94,0,0,.13);
  }
  face.finish();

  const arms = [], legs = [];
  for (const side of [-1,1]) {
    const arm = joint(body,side*.267,1.265,.004); arms.push(arm);
    arm.name=side===1 ? 'ArmR' : 'ArmL';
    const leg = joint(body,side*.112,.65,.014); legs.push(leg);
    leg.name=side===1 ? 'LegR' : 'LegL';
    if (modular) continue;
    const sleeve = costumePart(arm,cloth,resources);
    sleeve.shape(rings([[.096,0],[.107,.031],[.072,.193],[.087,.35],[.057,.392]]),robe,side*.048,-.375,0,1,1,.92,0,0,side*.1);
    if(person==='lupin')sleeve.oval(0x554a37,side*.105,-.21,.05,.055,.069,.028);
    sleeve.oval(skin,side*.06,-.397,-.004,.062,.078,.057);
    if (side===1) {
      const wand=costumePart(arm,cloth,resources);
      wand.shape(new THREE.CylinderGeometry(.019,.012,.34,8),0x6b4834,.068,-.398,-.139,1,1,1,Math.PI/2+.16);
      wand.oval(gold,.068,-.386,-.047,.023,.024,.025);
      const prop=wand.finish();orientHeldProp(prop.geometry,[.068,-.372,-.31]);prop.name='HeldWand';prop.userData.rigSlot='weapon';
    }
    sleeve.finish();
    const pants = costumePart(leg,cloth,resources);
    pants.oval(0x41434a,0,-.226,.002,.1,.24,.096);
    pants.oval(0x343944,0,-.451,-.003,.075,.153,.076);
    pants.oval(shoe,0,-.57,-.044,.085,.07,.136);
    pants.finish();
  }

  const armRigs=arms.map((arm,i)=>createLimbRig(arm,'arm',i*2-1));
  const legRigs=legs.map((leg,i)=>createLimbRig(leg,'leg',i*2-1));
  if(!modular)for(let i=0;i<2;i++){
    for(const mesh of [...arms[i].children].filter(node=>node.isMesh))armRigs[i].skin(mesh,mesh.userData.rigSlot||'legacy');
    for(const mesh of [...legs[i].children].filter(node=>node.isMesh))legRigs[i].skin(mesh,'legacy');
  }
  const glow = new THREE.Mesh(new THREE.OctahedronGeometry(.048),new THREE.MeshBasicMaterial({color:0xffdc8b,toneMapped:false}));
  armRigs[1].tip.add(glow); glow.position.copy(orientHeldProp(null,[.068,-.372,-.31])).sub(armRigs[1].tipOffset); glow.visible=false;
  glow.name='CastGlow';
  const outfit = modular ? createOutfit({variant:person,equipment,body,head,arms,legs,armRigs,legRigs,material:cloth,skin,glow}) : null;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1,24), new THREE.MeshBasicMaterial({color:0x262328,transparent:true,opacity:.20,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
  shadow.name='ContactShadow';
  shadow.rotation.x=-Math.PI/2;
  shadow.scale.set(.32*figureScale,.23*figureScale,1);
  shadow.position.y=.015;
  root.add(shadow);
  const motion=createAvatarMotion({body,head,arms,legs,armRigs,legRigs,glow,seed});
  function animate(dt,options={}) {
    motion.animate(dt,options);
    shadow.position.y=.015-Math.max(0,root.position.y);
    shadow.material.opacity=.20/(1+Math.max(0,root.position.y)*.68);
  }
  function dispose() {
    root.removeFromParent();
    outfit?.dispose();
    for(const rig of [...armRigs,...legRigs])rig.dispose();
    for(const geometry of resources) geometry.dispose();
    cloth.dispose();glow.geometry.dispose();glow.material.dispose();
    shadow.geometry.dispose();shadow.material.dispose();
  }
  function getWandTip(out=new THREE.Vector3()){root.updateWorldMatrix(true,true);return glow.getWorldPosition(out);}
  return {root,animate,dispose,setEquipment:equipment=>outfit?.setEquipment(equipment),
    playAction:motion.playAction,resetMotion:motion.reset,getMotionState:motion.getState,
    getWandTip,getCastOrigin:getWandTip
  };

}

function insideWall(x,z,box,radius) {
  const dx=x-clamp(x,box.x-box.w/2,box.x+box.w/2);
  const dz=z-clamp(z,box.z-box.d/2,box.z+box.d/2);
  return dx*dx+dz*dz < radius*radius;
}

function segmentHit(from,to,box) {
  let enter=0,leave=1;
  const margin=.14, h=box.height??box.h??9;
  for (const [axis,lo,hi] of [
    ['x',box.x-box.w/2-margin,box.x+box.w/2+margin],
    ['y',-.25,h+margin],
    ['z',box.z-box.d/2-margin,box.z+box.d/2+margin]
  ]) {
    const delta=to[axis]-from[axis];
    if (Math.abs(delta)<1e-5) {
      if (from[axis]<lo||from[axis]>hi) return 1;
    } else {
      let a=(lo-from[axis])/delta,b=(hi-from[axis])/delta;
      if (a>b) [a,b]=[b,a];
      enter=Math.max(enter,a);leave=Math.min(leave,b);
      if (enter>leave) return 1;
    }
  }
  return leave<0||enter>1?1:Math.max(0,enter-.012);
}

function wrappedTurn(current,desired,rate,dt) {
  let difference=(desired-current+Math.PI)%TAU;
  if (difference<0) difference+=TAU;
  return current+(difference-Math.PI)*(1-Math.exp(-rate*dt));
}

const actionKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','ShiftLeft','ShiftRight','KeyE','KeyF']);
const isTextInput=(node)=>node?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName);

export function createController({camera,element,joystick,jumpButton,actionButton,onAction,avatar}) {
  let root=avatar.root;
  const keys=new Set();
  const cleanups=[];
  let world=null,enabled=true,riding=false,grounded=true,speedY=0,castTimer=0,elapsed=0;
  let yaw=0,pitch=.32,distance=4.65,joyX=0,joyY=0,joyPointer=null,viewPointer=null,lastX=0,lastY=0;
  let jumpBuffer=0,grace=0,moving=false,speed=0,dashTime=0,nextDodge=0;
  let aimClick=null,combat={active:false,guarded:false,downed:false};
  const dash=new THREE.Vector2();
  const velocity=new THREE.Vector2(), input=new THREE.Vector2();
  const goal=new THREE.Vector3(), focus=new THREE.Vector3(), desiredCamera=new THREE.Vector3();
  function bind(target,event,fn,options) {
    if (!target) return;
    target.addEventListener(event,fn,options);
    cleanups.push(()=>target.removeEventListener(event,fn,options));
  }
  function clearInput() {
    keys.clear();joyPointer=null;viewPointer=null;aimClick=null;joyX=0;joyY=0;jumpBuffer=0;dashTime=0;velocity.set(0,0);moving=false;speed=0;
    joystick?.style.setProperty('--joy-x','0px');joystick?.style.setProperty('--joy-y','0px');
  }
  function requestJump() { if (enabled && !riding) jumpBuffer=.15; }
  function action(type='interact') { if(enabled && !riding) onAction?.(type); }
  function canReceiveKeys(event) {
    return enabled && !riding && !event.defaultPrevented && !event.isComposing && !event.metaKey && !event.ctrlKey &&
      !event.altKey && !isTextInput(event.target) && !document.querySelector('dialog[open]');
  }
  bind(window,'keydown',event=>{
    if(!actionKeys.has(event.code)||!canReceiveKeys(event)) return;
    event.preventDefault();keys.add(event.code);
    if(!event.repeat && event.code==='Space') requestJump();
    if(!event.repeat && event.code==='KeyE') action('interact');
    if(!event.repeat && event.code==='KeyF') action('cast');
  });
  bind(window,'keyup',event=>keys.delete(event.code));
  bind(window,'blur',clearInput);
  bind(document,'visibilitychange',()=>{ if(document.hidden) clearInput(); });

  function sampleJoystick(event) {
    const b=joystick.getBoundingClientRect(), radius=Math.max(10,Math.min(b.width,b.height)*.36);
    joyX=(event.clientX-b.left-b.width/2)/radius;
    joyY=(event.clientY-b.top-b.height/2)/radius;
    const len=Math.hypot(joyX,joyY);
    if(len>1){joyX/=len;joyY/=len;}
    joystick.style.setProperty('--joy-x',(joyX*radius).toFixed(1)+'px');
    joystick.style.setProperty('--joy-y',(joyY*radius).toFixed(1)+'px');
  }
  bind(joystick,'pointerdown',e=>{
    if(!enabled||riding||joyPointer!==null)return;
    e.preventDefault();joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);sampleJoystick(e);
  });
  bind(joystick,'pointermove',e=>{if(e.pointerId===joyPointer)sampleJoystick(e);});
  function releaseStick(e) {
    if(e.pointerId!==joyPointer)return;
    joyPointer=null;joyX=0;joyY=0;joystick.style.setProperty('--joy-x','0px');joystick.style.setProperty('--joy-y','0px');
  }
  for(const type of ['pointerup','pointercancel','lostpointercapture'])bind(joystick,type,releaseStick);
  for(const [node,fn] of [[jumpButton,requestJump],[actionButton,()=>action('context')]]) {
    bind(node,'pointerdown',event=>{if(event.button===0){event.preventDefault();fn();}});
    bind(node,'click',event=>{if(event.detail===0)fn();});
  }
  bind(element,'pointerdown',event=>{
    if(!enabled||riding||viewPointer!==null||event.button!==0 && event.button!==2)return;
    viewPointer=event.pointerId;lastX=event.clientX;lastY=event.clientY;
    aimClick=event.pointerType==='mouse'&&event.button===0?{x:lastX,y:lastY,at:performance.now()}:null;
    element.setPointerCapture(viewPointer);
  });
  bind(element,'pointermove',event=>{
    if(viewPointer!==event.pointerId||!enabled||riding)return;
    if(aimClick&&Math.hypot(event.clientX-aimClick.x,event.clientY-aimClick.y)>5)aimClick=null;
    yaw-=(event.clientX-lastX)*.005;
    pitch=clamp(pitch+(event.clientY-lastY)*.004,.10,1.04);
    lastX=event.clientX;lastY=event.clientY;
  });
  function releaseLook(event){
    if(event.pointerId!==viewPointer)return;
    if(aimClick&&event.type==='pointerup'&&performance.now()-aimClick.at<420&&Math.hypot(event.clientX-aimClick.x,event.clientY-aimClick.y)<=5)action('primary');
    viewPointer=null;aimClick=null;
  }
  for(const type of ['pointerup','pointercancel','lostpointercapture'])bind(element,type,releaseLook);
  bind(element,'contextmenu',event=>event.preventDefault());
  bind(element,'wheel',event=>{
    if(!enabled)return;
    event.preventDefault();distance=clamp(distance+clamp(event.deltaY,-150,150)*.007,2.8,7.8);
  },{passive:false});
  if(joystick) joystick.style.touchAction='none';
  element.style.touchAction='none';

  function updateCamera(dt,snap=false) {
    const cos=Math.cos(yaw),sin=Math.sin(yaw), arm=distance*Math.cos(pitch);
    goal.set(root.position.x,.97+root.position.y*.78,root.position.z);
    if(snap) focus.copy(goal); else focus.lerp(goal,1-Math.exp(-14*dt));
    desiredCamera.set(focus.x+sin*arm,focus.y+distance*Math.sin(pitch),focus.z+cos*arm);
    let fraction=1;
    for (const wall of world.walls||[]) fraction=Math.min(fraction,segmentHit(focus,desiredCamera,wall));
    desiredCamera.lerpVectors(focus,desiredCamera,fraction);
    if(snap||fraction<.98)camera.position.copy(desiredCamera);
    else camera.position.lerp(desiredCamera,1-Math.exp(-15*dt));
    // Test the smoothed path as well, when the player turns around a corner.
    let safe=1;
    for (const wall of world.walls||[])safe=Math.min(safe,segmentHit(focus,camera.position,wall));
    if(safe<1)camera.position.lerpVectors(focus,camera.position,safe);
    camera.lookAt(focus.x-sin*.48,focus.y+.10,focus.z-cos*.48);
    root.visible=camera.position.distanceToSquared(focus)>.31;
  }
  function setWorld(next,point) {
    clearInput();riding=false;world=next;speedY=0;grounded=true;castTimer=0;grace=.1;avatar.resetMotion?.();
    const p=point||next.spawn;
    const x=Array.isArray(p)?p[0]:p.x;
    const z=Array.isArray(p)?p[p.length>2?2:1]:p.z;
    const y=Array.isArray(p)?(p.length>2?p[1]:0):(p.y||0);
    root.position.set(x,y,z);
    const poi=next.landmarks?.npc||next.landmarks?.inspect;
    if(Number.isFinite(point?.yaw))yaw=point.yaw;
    else if(Number.isFinite(next.facing))yaw=next.facing;
    else if(poi && Math.hypot(poi[0]-x,poi[1]-z)>.05)yaw=Math.atan2(x-poi[0],z-poi[1]);
    else yaw=0;
    root.rotation.y=yaw;pitch=.32;distance=4.65;
    grounded=y<=.01;updateCamera(0,true);
  }
  function floorAt(x,z,previousHeight) {
    let y=world.floorHeightAt?.(x,z) || 0;
    for(const wall of world.walls||[]) {
      const height=wall.height??wall.h;
      if(Number.isFinite(height)&&previousHeight>=height-.04&&insideWall(x,z,wall,RADIUS*.85)) y=Math.max(y,height);
    }
    return y;
  }
  function clearAt(x,z) {
    return !(world.walls||[]).some(wall=>root.position.y<(wall.height??wall.h??Infinity)-.04 && insideWall(x,z,wall,RADIUS));
  }
  function ride(pose,dt) {
    if(!world || !pose) return;
    if(!riding) clearInput();
    riding=true;
    dt=clamp(Number(dt)||0,0,.08);
    elapsed+=dt;speedY=0;grounded=true;castTimer=0;grace=0;
    root.position.set(pose.x,pose.y,pose.z);
    if(Number.isFinite(pose.yaw)) {
      root.rotation.y=pose.yaw;
      yaw=wrappedTurn(yaw,pose.yaw,3.4,dt);
    }
    avatar.animate(dt,{moving:false,speed:0,jump:0,casting:false,time:elapsed});
    updateCamera(dt);
  }
  function update(dt) {
    if(!world||riding)return;
    dt=clamp(Number(dt)||0,0,.08);elapsed+=dt;castTimer=Math.max(0,castTimer-dt);
    const left=keys.has('KeyA')||keys.has('ArrowLeft'),right=keys.has('KeyD')||keys.has('ArrowRight');
    const up=keys.has('KeyW')||keys.has('ArrowUp'),down=keys.has('KeyS')||keys.has('ArrowDown');
    input.set((Number(right)-Number(left))+(Math.abs(joyX)>.08?joyX:0),(Number(up)-Number(down))-(Math.abs(joyY)>.08?joyY:0));
    if(!enabled)input.set(0,0);
    if(input.lengthSq()>1)input.normalize();
    const running=keys.has('ShiftLeft')||keys.has('ShiftRight')||Math.hypot(joyX,joyY)>.90;
    const stride=running?5.65:3.35, sin=Math.sin(yaw), cos=Math.cos(yaw);
    const vx=(cos*input.x-sin*input.y)*stride,vz=(-sin*input.x-cos*input.y)*stride;
    const response=grounded?20:8;
    if(dashTime>0){
      const duration=Math.min(dt,dashTime);
      velocity.copy(dash).multiplyScalar(8.5*duration/Math.max(.001,dt));
      dashTime-=duration;
    }else velocity.set(damp(velocity.x,vx,response,dt),damp(velocity.y,vz,response,dt));
    if(input.lengthSq()<.001&&velocity.lengthSq()<.008)velocity.set(0,0);
    if(grounded)grace=.1;else grace=Math.max(0,grace-dt);
    if(jumpBuffer>0&&grace>0){speedY=6.65;grounded=false;grace=0;jumpBuffer=0;}
    jumpBuffer=Math.max(0,jumpBuffer-dt);
    const startX=root.position.x,startZ=root.position.z;
    const [minX,maxX,minZ,maxZ]=world.bounds;
    const substeps=Math.max(1,Math.ceil(dt/.016));
    const step=dt/substeps;
    for(let i=0;i<substeps;i++) {
      const x=clamp(root.position.x+velocity.x*step,minX+RADIUS,maxX-RADIUS);
      if(clearAt(x,root.position.z))root.position.x=x;
      const z=clamp(root.position.z+velocity.y*step,minZ+RADIUS,maxZ-RADIUS);
      if(clearAt(root.position.x,z))root.position.z=z;
      const floor=floorAt(root.position.x,root.position.z,root.position.y);
      speedY-=15.4*step;
      root.position.y+=speedY*step;
      if(root.position.y<=floor&&speedY<=0){root.position.y=floor;speedY=0;grounded=true;}
      else grounded=false;
    }
    const dx=root.position.x-startX,dz=root.position.z-startZ;
    speed=dt?Math.hypot(dx,dz)/dt:0;moving=speed>.12;
    if(moving)root.rotation.y=wrappedTurn(root.rotation.y,Math.atan2(-dx,-dz),15,dt);
    avatar.animate(dt,{moving,speed,jump:grounded?0:Math.max(.18,root.position.y),grounded,verticalVelocity:speedY,casting:castTimer>0,time:elapsed,combat:combat.active,guarded:combat.guarded,downed:combat.downed});
    updateCamera(dt);
  }
  function getPose() {
    return {x:root.position.x,y:root.position.y,z:root.position.z,yaw:root.rotation.y,moving,casting:castTimer>0};
  }
  return {
    setWorld,ride,update,getPose,
    setAvatar(next){
      next.root.position.copy(root.position);next.root.rotation.copy(root.rotation);
      avatar=next;root=next.root;
    },
    setEnabled(value){enabled=Boolean(value);if(!enabled)clearInput();},
    cast(action='bolt'){const timing=avatar.playAction?.(action);castTimer=timing?.duration??.57;return timing??{duration:.57,release:.14};},
    setCombat(value={}){combat={...combat,...value};},
    dodge(){
      if(!world||!enabled||riding||elapsed<nextDodge)return false;
      const side=input.lengthSq()>.02?input.x:1,forward=input.lengthSq()>.02?input.y:0;
      const sin=Math.sin(yaw),cos=Math.cos(yaw);
      dash.set(cos*side-sin*forward,-sin*side-cos*forward).normalize();
      const x=root.position.x+.26*dash.x,z=root.position.z+.26*dash.y;
      const [minX,maxX,minZ,maxZ]=world.bounds;
      if(!clearAt(x,z)||x<minX+RADIUS||x>maxX-RADIUS||z<minZ+RADIUS||z>maxZ-RADIUS)return false;
      dashTime=.235;nextDodge=elapsed+.62;avatar.playAction?.('dodge');
      return true;
    },
    dispose(){clearInput();for(const cleanup of cleanups)cleanup();}
  };
}
