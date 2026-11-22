import * as THREE from 'three';
import {createAvatar} from './player.mjs';
import {createWorld} from './world.mjs';

const length=14.8;
const captions=['给哈利的第一封信，穿过了女贞路的门。','海格亲手把霍格沃茨录取通知书交给了哈利。','九月一日，国王十字车站。','开往霍格沃茨的列车，即将出发。'];
const clamp01=value=>Math.min(1,Math.max(0,value));
function ease(value) {const u=clamp01(value);return u*u*(3-2*u);}

// The small stage props share geometry and materials and are released together on skip or completion.
function studio(){
  const box=new THREE.BoxGeometry(),ball=new THREE.SphereGeometry(1,12,8);
  const wheels=new THREE.CylinderGeometry(1,1,1,14),faces=new Map();
  const seam=new THREE.BufferGeometry();
  seam.setAttribute('position',new THREE.Float32BufferAttribute([-.5,.31,0, 0,-.07,0, .5,.31,0],3));
  seam.computeVertexNormals();
  function piece(parent,geo,tint,x,y,z,width,height,depth,unlit=false){
    const key=tint+'|'+unlit;
    if(!faces.has(key)){
      faces.set(key,unlit?new THREE.MeshBasicMaterial({color:tint,side:THREE.DoubleSide}):
        new THREE.MeshStandardMaterial({color:tint,roughness:.80,side:geo===seam?THREE.DoubleSide:THREE.FrontSide}));
    }
    const mesh=new THREE.Mesh(geo,faces.get(key));
    mesh.position.set(x,y,z);mesh.scale.set(width,height,depth);parent.add(mesh);return mesh;
  }
  function envelope(parent){
    const note=new THREE.Group();parent.add(note);
    piece(note,box,'#f1dfa5',0,0,0,1,.62,.031);
    // The folded flap and deep red seal stay legible as the envelope turns towards the camera.
    piece(note,seam,'#d8b978',0,0,.019,.97,1,1);
    piece(note,ball,'#862f35',0,-.055,.029,.091,.087,.021);
    piece(note,ball,'#b05b4c',.017,-.04,.044,.038,.042,.012);
    const letters=[[-.26,.052,.18],[-.11,.052,.069],[-.23,-.021,.28],[-.20,-.09,.20]];
    for(const [x,y,w] of letters)piece(note,box,'#677051',-x,y,-.020,w,.012,.004);
    return note;
  }
  return {box,ball,wheels,piece,envelope,dispose(){for(const g of [box,ball,wheels,seam])g.dispose();for(const m of faces.values())m.dispose();}};
}

function lamplight(scene,sky='#bac9d5',hemi=1.15){
  scene.background=new THREE.Color('#564d47');
  scene.add(new THREE.HemisphereLight(sky,'#927553',hemi));
  const key=new THREE.DirectionalLight('#ffe0a6',2.00);key.position.set(-2.8,4.1,2.9);scene.add(key);
}

function doorway(s){
  const scene=new THREE.Scene();lamplight(scene,'#c5d7da',1.4);
  const b=(...args)=>s.piece(scene,s.box,...args);
  const door='#526655', inset='#3e5249', trim='#899380';
  b('#a39374',0,1.8,-.45,10,4,.3);
  b('#8a6c52',0,-.09,1.2,10,.18,6);
  for(const side of [-1,1]){
    b('#c7b18b',side*2.8,.62,-.25,3.2,1.28,.18);
    for(let i=0;i<6;i++)b('#a79573',side*(1.44+i*.31),.62,-.14,.025,1.24,.04);
    b('#b8a17c',side*2.55,1.32,-.13,2.9,.074,.13);
  }
  b(door,0,1.54,-.17,1.78,3.10,.18);
  for(const x of [-.94,.94])b(trim,x,1.59,-.10,.13,3.33,.27);
  b(trim,0,3.18,-.10,2,.15,.27);
  for(const x of [-.395,.395])for(const [y,h] of [[.63,.91],[2.10,1.04]]){
    b(inset,x,y,-.071,.57,h,.03);b('#607261',x,y,-.047,.49,h-.10,.035);
  }
  b('#a58a52',0,1.39,-.043,.69,.16,.057);
  b('#423e35',0,1.39,-.007,.56,.073,.025);
  const flap=b('#d0b473',0,1.43,.015,.60,.083,.027);
  s.piece(scene,s.ball,'#ae955d',.72,1.22,.037,.074,.074,.076);
  const notes=Array.from({length:7},()=>s.envelope(scene));
  return {scene,notes,flap};
}

function cottage(s){
  const scene=new THREE.Scene();lamplight(scene,'#adc0d4',.94);
  const b=(...args)=>s.piece(scene,s.box,...args);
  b('#665242',0,-.09,0,8,.18,7);b('#645d54',0,1.9,-2.5,8,3.8,.3);
  // Offset fieldstone courses, heavy roof timbers and a lit fireplace distinguish the hut from Privet Drive.
  for(let row=0;row<7;row++)for(let col=-4;col<=4;col++){
    const x=col*.91+row%2*.43;
    b(['#817a6a','#756d60','#89806c'][(row+col+5)%3],x,row*.45+.22,-2.31,.875,.423,.14);
  }
  for(const x of [-3,-1.02,2.95])b('#574637',x,1.64,-2.18,.16,3.32,.18);
  b('#534336',0,3.14,-2.1,8,.23,.28);
  for(let i=0;i<12;i++)b('#554333',-3.52+i*.63,.004,.34,.011,.008,5.8);
  b('#483f36',-1.75,1.04,-2.09,1.92,1.42,.25);
  b('#1c272b',-1.75,1.04,-1.94,1.62,1.17,.03);
  b('#73888c',-1.76,1.33,-1.89,1.56,.035,.04);
  b('#73888c',-1.78,1.04,-1.89,.038,1.15,.04);
  for(const side of [-1,1])b('#786d5e',1.7+side*.66,.55,-1.85,.24,1.1,.48);
  b('#443f3a',1.71,.52,-2.04,1.28,1.06,.19);
  b('#997a55',1.71,1.12,-1.86,1.78,.19,.68);
  b('#806f58',1.71,.076,-1.49,1.69,.13,.96);
  const flames=[];
  for(let i=0;i<7;i++){
    const flame=s.piece(scene,s.ball,i%2?'#f4ab4f':'#d7793b',1.42+(i%4)*.17,.24,-1.74+(i%2)*.08,.103,.17+i%3*.062,.081,true);
    flames.push(flame);
  }
  const fire=new THREE.PointLight('#ffbb70',7.4,6,2);fire.position.set(1.71,.90,-1.31);scene.add(fire);
  const harry=createAvatar({variant:'harry',name:'哈利'}),hagrid=createAvatar({variant:'hagrid',name:'海格'});
  hagrid.root.position.set(-.65,0,-.08);hagrid.root.rotation.y=-2.07;
  harry.root.position.set(.52,0,-.01);harry.root.rotation.y=2.10;
  scene.add(harry.root,hagrid.root);
  return {scene,flames,fire,harry,hagrid,note:s.envelope(scene)};
}

function trolley(s){
  const cart=new THREE.Group();
  const b=(...args)=>s.piece(cart,s.box,...args);
  b('#627877',0,.21,0,.79,.10,1.04);
  const wheels=[];
  for(const side of [-1,1]){
    b('#c5b081',side*.33,.61,.46,.047,.81,.047);
    for(const z of [-.34,.36]){
      const wheel=s.piece(cart,s.wheels,'#424b4b',side*.375,.153,z,.125,.066,.125);
      wheel.rotation.z=Math.PI/2;wheels.push(wheel);
      const cap=s.piece(cart,s.ball,'#ac9165',side*.411,.153,z,.021,.051,.051);
      cap.name='wheel cap';
    }
  }
  b('#92734a',0,1.02,.47,.78,.066,.063);
  for(const [x,y,z,w,h,d,color] of [[0,.47,-.04,.75,.43,.83,'#804939'],[-.026,.82,-.11,.57,.27,.61,'#6b7a60']]){
    b(color,x,y,z,w,h,d);
    for(const side of [-1,1])b('#b69a69',x+side*w*.30,y,z,.034,h+.015,d+.022);
    b('#dab47b',x,y+.05,z+d*.51,.075,.085,.023);
  }
  return {cart,wheels};
}

function arm(avatar,side){
  const shoulder=avatar.root.children[0].children.find(node=>node.isGroup&&side*node.position.x>.2&&node.position.y>1.1);
  const palm=new THREE.Vector3();
  return {pose(angle){if(shoulder)shoulder.rotation.x=angle;},
    hand(){
      if(shoulder)return shoulder.localToWorld(palm.set(side*.057,-.397,-.04));
      return avatar.root.localToWorld(palm.set(side*.27,1,-.32));
    }};
}

export function createOpening({renderer,canvas,onCaption=()=>{},onEnd=()=>{}}){
  const s=studio(),door=doorway(s),hut=cottage(s);
  const stationScene=new THREE.Scene(),station=createWorld('platform',stationScene);
  const traveler=createAvatar({variant:'harry',name:'哈利'}),{cart,wheels}=trolley(s);
  const travelerArms=[arm(traveler,-1),arm(traveler,1)],giver=arm(hut.hagrid,-1),receiver=arm(hut.harry,1);
  stationScene.add(traveler.root,cart);
  const camera=new THREE.PerspectiveCamera(36,1,.05,95);
  const look=new THREE.Vector3();
  let time=0,shot=-1,done=false,disposed=false;

  function render(dt=0){
    if(done||disposed)return;
    time=Math.min(length,time+Math.max(0,Number.isFinite(dt)?dt:0));
    const next=time<3.65?0:time<8.2?1:time<11.9?2:3;
    if(next!==shot){shot=next;onCaption(captions[shot]);if(disposed)return;}
    const width=canvas.clientWidth||canvas.width||1,height=canvas.clientHeight||canvas.height||1;
    camera.aspect=width/height;
    const lens=[36,40,42,45][shot];
    // Keep a useful horizontal view on portrait phones without cropping the exchange.
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(lens/2))*Math.max(1,1.05/camera.aspect)));
    camera.updateProjectionMatrix();
    let frame;
    if(shot===0){
      frame=door.scene;const p=time/3.65;
      camera.position.set(.49-p*.53,1.34+p*.14,2.98-p*.63);look.set(0,1.35,.03);
      door.flap.rotation.x=-.70*Math.sin(Math.PI*clamp01((time-.16)/1.3));
      for(const [i,note] of door.notes.entries()){
        const v=time-(i===0?.18:1.03+i*.23);
        note.visible=v>=0;
        if(!note.visible)continue;
        const q=clamp01(v/(i===0?2.45:1.98)),curve=Math.sin(q*Math.PI);
        note.scale.setScalar(i===0?.51:.42);
        note.position.set((i===0?-.31:(i%2?.9:-.9)*(1+i*.08))*q+.09*curve*Math.sin(v*3+i),
          1.41+(i===0?.25:.64)*curve-.22*q,.05+(i===0?1.73:1.18)*q);
        note.rotation.set(-1.31*(1-ease(q*2.0))+.13*curve,.50*curve*Math.sin(i+v),.20*Math.sin(v*2.3+i));
      }
    }else if(shot===1){
      frame=hut.scene;const t=time-3.65,q=ease(t/4.55);
      camera.position.set(.47-q*.85,1.56-q*.13,3.39-q*.29);look.set(-.02,1.34,.02);
      hut.hagrid.animate(dt,{time});hut.harry.animate(dt,{time});
      const offer=ease((t-.20)/1.25),reach=ease((t-.88)/.92),take=ease((t-2.05)/.66),release=ease((t-2.96)/1.15);
      hut.hagrid.root.position.x=-.65+offer*.10-release*.10;
      hut.harry.root.position.x=.52-reach*.085;
      giver.pose(.18+offer*.69-release*.50);receiver.pose(.12+reach*1.21-release*.40);
      hut.note.position.copy(giver.hand()).lerp(receiver.hand(),take).z+=.087;
      hut.note.scale.setScalar(.36);hut.note.rotation.set(-.22+take*.09,.20-take*.69,-.24+take*.36);
      hut.flames.forEach((f,i)=>{f.scale.y=.17+i%3*.046+.044*Math.sin(time*9+i);});
      hut.fire.intensity=7.4+.45*Math.sin(time*7);
    }else{
      frame=stationScene;
      const t=time-8.2,travel=clamp01(t/5.9);
      const place=4.50-travel*6.45;
      traveler.root.position.set(-.65,0,place);traveler.root.rotation.y=0;
      traveler.animate(dt,{moving:true,speed:2.2,time});
      travelerArms.forEach(a=>a.pose(1.06));
      cart.position.set(-.65,0,place-.69);
      wheels.forEach(wheel=>{wheel.rotation.x=-travel*25;});
      station.update(dt,time);
      if(shot===2){
        const q=ease(t/3.7);
        camera.position.set(2.67-q*.73,1.32+q*.33,place-2.91-q*.24);look.set(-.77,1.10,place-.40);
      }else{
        const q=ease((time-11.9)/2.9);
        camera.position.set(1.75+q*1.28,2.05+q*1.15,5.72+q*1.78);
        look.set(-3.49-q*.94,1.49+q*.24,-2.04-q*.86);
      }
    }
    camera.lookAt(look);camera.updateMatrixWorld();renderer.render(frame,camera);
    if(time===length&&!disposed){done=true;onEnd();}
  }

  return {render,dispose(){
    if(disposed)return;disposed=true;
    hut.hagrid.dispose();hut.harry.dispose();traveler.dispose();station.dispose();s.dispose();
    for(const frame of [door.scene,hut.scene,stationScene])frame.clear();
  }};
}
