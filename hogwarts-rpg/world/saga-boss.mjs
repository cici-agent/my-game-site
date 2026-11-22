import * as THREE from 'three';

const colors = {quirrell:'#d8acda',basilisk:'#d1cb65',dementor:'#b3dce8',graveyard:'#8ac8a7',prophecy:'#a1cbef',tower:'#ffaf63',voldemort:'#91dd88'};

// All meshes are children of root so the journey can release geometry and materials together.
function sculpt() {
  const root=new THREE.Group(),body=new THREE.Group(),shapes=new Map(),shades=new Map();
  root.add(body);
  function part(parent,type,color,x,y,z,sx,sy,sz,light=false){
    if(!shapes.has(type)){
      const geometry=type==='ball'?new THREE.SphereGeometry(1,14,10):
        type==='robe'?new THREE.CylinderGeometry(.42,1,1,12,3):
        type==='point'?new THREE.ConeGeometry(1,1,8):
        type==='ring'?new THREE.TorusGeometry(1,.063,7,36):
        type==='rod'?new THREE.CylinderGeometry(.83,1,1,9):new THREE.BoxGeometry(1,1,1);
      shapes.set(type,geometry);
    }
    const key=color+'|'+light;
    if(!shades.has(key))shades.set(key,light?new THREE.MeshBasicMaterial({color,toneMapped:false}):new THREE.MeshStandardMaterial({color,roughness:.82}));
    const mesh=new THREE.Mesh(shapes.get(type),shades.get(key));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
    parent.add(mesh);return mesh;
  }
  const group=(parent,x=0,y=0,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;};
  return {root,body,part,group};
}
const lean=(node,x,y,z)=>{node.rotation.set(x,y,z);return node;};

function groundShadow(width,depth){
  const vertices=[],tint=[],indices=[],steps=30;
  for(const [radius,alpha] of [[.04,.34],[.47,.28],[.81,.12],[1,0]]){
    for(let j=0;j<=steps;j++){
      const a=j*Math.PI*2/steps;
      vertices.push(Math.cos(a)*width*radius,.025,Math.sin(a)*depth*radius);
      tint.push(1,1,1,alpha);
    }
  }
  for(let ring=0;ring<3;ring++)for(let i=0;i<steps;i++){
    const a=ring*(steps+1)+i,b=a+steps+1;
    indices.push(a,b+1,b,a,a+1,b+1);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(tint,4));geo.setIndex(indices);
  return new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:'#1d2427',vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
}

function wizard(rig,kind) {
  const {body,part,group}=rig;
  const appearance={
    quirrell:{robe:'#6c4567',hem:'#9a7087',face:'#ba9678',hood:false},
    graveyard:{robe:'#414c50',hem:'#69746f',face:'#a8b0a3',hood:true},
    prophecy:{robe:'#394653',hem:'#70818a',face:'#c4c7b8',hood:true},
    tower:{robe:'#66575b',hem:'#9c7161',face:'#a0a19a',hood:true},
    voldemort:{robe:'#374e4c',hem:'#526966',face:'#cfceac',hood:false}
  }[kind];
  const {robe,hem,face,hood}=appearance;
  part(body,'robe',robe,0,.70,0,.56,1.33,.4);
  for(let i=0;i<7;i++){
    const a=i/6*2.7-1.35;
    lean(part(body,'robe',i%2?robe:hem,.365*Math.sin(a),.68,.256*Math.cos(a),.062,1.12,.047),0,0,-.10*Math.sin(a));
  }
  part(body,'ball',robe,0,1.53,0,.48,.48,.30);
  part(body,'rod',hem,0,1.08,0,.405,.12,.265);
  const head=group(body,0,2.13,0);
  if(hood){
    part(head,'ball',robe,0,.05,-.025,.35,.43,.34);
    part(head,'ball','#252c31',0,.0,.25,.265,.295,.115);
  }
  part(head,'ball',face,0,.00,hood?.29:.0,.25,.325,hood?.083:.23);
  const front=hood?.365:.207;
  for(const side of [-1,1]){
    lean(part(head,'ball',kind==='voldemort'?'#774233':'#33383c',side*.115,.045,front,.056,.025,.021),0,0,side*.12);
    lean(part(head,'ball',hood?'#697170':'#898775',side*.121,.091,front-.005,.083,.023,.023),0,0,side*.13);
  }
  if(kind==='voldemort'){
    for(const s of [-1,1])lean(part(head,'ball','#747a6a',s*.034,-.031,.229,.011,.044,.01),0,0,s*.31);
    part(head,'ball','#aa927d',0,-.141,.18,.077,.012,.016);
  }else{
    part(head,'ball',face,0,-.024,front+.028,.045,.057,.042);
    part(head,'ball',hood?'#667170':'#80685c',0,-.149,front-.006,.072,.012,.017);
  }

  if(kind==='quirrell'){
    part(head,'ball','#795271',0,.223,-.006,.344,.221,.286);
    for(let i=0;i<4;i++)lean(part(head,'ring',i%2?'#8b657c':'#a37b88',0,.164+i*.066,-.004,.313-i*.022,.265-i*.017,.24),Math.PI*.48,.03, (i%2?-.17:.13));
    part(head,'ball','#9c777d',.20,.205,.09,.112,.102,.10);
  }
  if(kind==='tower'){
    for(let i=0;i<3;i++)lean(part(body,'robe',i%2?robe:hem,-.40,.99+i*.16,-.14,.22,.93,.11),-.35,0,-.52);
  }
  const arms=[];
  for(const s of [-1,1]){
    const arm=group(body,s*.405,1.70,.015);
    lean(part(arm,'robe',robe,s*.09,-.26,0,.19,.62,.175),0,0,s*.15);
    part(arm,'ball',face,s*.13,-.56,.06,.095,.123,.09);
    arms.push(arm);
  }
  const tip=group(arms[1],.134,-.56,.065);
  lean(part(tip,'rod',kind==='voldemort'?'#c7ba99':'#786247',0,.022,.37,.025,.78,.025),Math.PI/2-.11,0,0);
  const spark=part(tip,'ball',colors[kind],0,.07,.75,.095,.095,.095,true);
  if(kind==='graveyard'){
    // The second apparition echoes the spell around the portkey.
    for(const side of [-1,1]){
      const echo=group(body,side*.87,.10,-.40);
      part(echo,'robe','#667976',0,.83,0,.26,1.26,.19);
      part(echo,'ball','#85948a',0,1.59,0,.18,.235,.16);
    }
  }
  if(kind==='prophecy'){
    const orb=part(arms[0],'ball','#b2daea',-.12,-.54,.25,.16,.16,.16,true);
    lean(part(arms[0],'ring','#7e999e',-.12,-.54,.25,.19,.19,.19),.85,.24,0);
    orb.rotation.y=.6;
  }

  return (state,t)=>{
    const windup=state.started&&state.phase==='windup',vulnerable=state.phase==='vulnerable';
    const lost=state.status==='won';
    arms[1].rotation.x=lost?.38:windup?-1.08+.07*Math.sin(t*5.2):vulnerable?.35:-.28+.045*Math.sin(t*1.7);
    arms[0].rotation.z=(windup?-.73:-.18)+.04*Math.sin(t*1.4);
    head.rotation.y=.09*Math.sin(t*1.03);
    body.rotation.z=lost?.88:vulnerable?-.12:.025*Math.sin(t);
    body.position.y=lost?-.47:.020*Math.sin(t*1.32);
    spark.visible=windup&&!lost;const glow=.080+.032*(1+Math.sin(t*7.2));spark.scale.setScalar(glow);
  };
}

function serpent(rig) {
  const {part,group,body}=rig,segments=[];
  for(let i=0;i<24;i++){
    const u=i/23,rad=.095+.28*Math.sin(u*Math.PI*.72);
    const bone=group(body);
    part(bone,'ball',i%3===0?'#67866a':'#556f55',0,0,0,rad,rad*.9,rad*1.22);
    if(i%2===0)part(bone,'ball','#94965e',0,rad*.73,-rad*.12,rad*.70,rad*.23,rad*.42);
    segments.push(bone);
  }
  const head=group(body);
  part(head,'ball','#647d57',0,.04,.03,.47,.34,.57);
  part(head,'ball','#7b8962',0,-.03,.49,.365,.17,.37);
  const jaw=group(head,0,-.21,.20);
  part(jaw,'ball','#9b9c72',0,0,.2,.34,.10,.41);
  for(const s of [-1,1]){
    part(head,'ball','#e6ca64',s*.30,.12,.405,.111,.073,.092,true);
    part(head,'ball','#303e34',s*.31,.126,.485,.019,.063,.018);
    lean(part(head,'ball','#586e53',s*.29,.191,.33,.16,.047,.12),0,0,s*.16);
    lean(part(head,'point','#eee5bd',s*.240,-.145,.59,.065,.26,.066),Math.PI,0,s*.09);
    part(head,'ball','#3e5546',s*.15,.028,.806,.034,.020,.025);
  }
  return (state,t)=>{
    const strike=state.started&&state.phase==='windup';
    const won=state.status==='won',weak=state.phase==='vulnerable';
    for(let i=0;i<segments.length;i++){
      const u=i/(segments.length-1),angle=u*6.70+t*.36;
      const breadth=1.65-u*1.24;
      const y=.18+Math.pow(u,2.4)*(won?.44:weak?1.54:2.34);
      segments[i].position.set(breadth*Math.sin(angle),y,-.63+breadth*Math.cos(angle)+u*.53);
    }
    head.position.copy(segments.at(-1).position);head.position.y+=.17;
    head.rotation.set(strike?-.18:weak?.20:0,.16*Math.sin(t*.72),.073*Math.sin(t*1.25));
    jaw.rotation.x=strike?.44+.08*Math.sin(t*4.7):.06;
  };
}

function flock(rig) {
  const {body,group,part}=rig,figures=[];
  for(const [i,x] of [-1.05,0,1.05].entries()){
    const ghost=group(body,x,i===1?.34:.0,i===1?.15:-.55);
    if(i!==1)ghost.scale.setScalar(.73);
    part(ghost,'robe','#394850',0,1.16,0,.42,1.51,.34);
    part(ghost,'ball','#404f57',0,2.07,0,.36,.48,.32);
    part(ghost,'ball','#202d33',0,2.01,.225,.25,.29,.14);
    part(ghost,'ball','#6b7776',0,1.97,.313,.13,.16,.055);
    part(ghost,'ball','#263237',0,1.93,.365,.055,.075,.021);
    for(let j=0;j<7;j++){
      const a=j*2*Math.PI/7;
      lean(part(ghost,'point',j%2?'#39464c':'#4b5b60',.255*Math.sin(a),.48,.22*Math.cos(a),.104,.73,.066),Math.PI-.16,0,.21*Math.sin(a));
    }
    const arms=[];
    for(const s of [-1,1]){
      const arm=group(ghost,s*.35,1.58,.01);
      lean(part(arm,'robe','#435159',s*.099,-.24,0,.146,.60,.145),0,0,s*.23);
      part(arm,'ball','#86918c',s*.14,-.53,.04,.089,.080,.081);
      for(let j=0;j<3;j++)part(arm,'rod','#88908d',s*(.11+j*.031),-.62,.04+j*.018,.013,.19,.014);
      arms.push(arm);
    }
    figures.push({ghost,arms,x,i});
  }
  return (state,t)=>{
    const wind=state.started&&state.phase==='windup',won=state.status==='won';
    for(const {ghost,arms,x,i} of figures){
      const a=t*1.15+i*1.93;
      ghost.position.x=x+Math.sin(a*.80)*.12;
      ghost.position.y=(i===1?.32:0)+.15*Math.sin(a)+(won?.8:0);
      ghost.rotation.z=(won?.50:.08)*Math.sin(a);
      ghost.scale.setScalar((i===1?1:.73)*(won?.23:state.phase==='vulnerable'?.77:1));
      arms[0].rotation.z=wind?-.93:-.32+.12*Math.sin(a);
      arms[1].rotation.z=wind?.84:.38+.12*Math.cos(a);
      for(const arm of arms)arm.rotation.x=wind?-.85:-.35+.10*Math.sin(a);
    }
  };
}

export function buildSagaBoss(kind) {
  if(!Object.hasOwn(colors,kind))throw new RangeError('Unknown saga encounter '+kind);
  const rig=sculpt(),{root,body}=rig;
  const animate=kind==='basilisk'?serpent(rig):kind==='dementor'?flock(rig):wizard(rig,kind);
  root.name=kind;
  const indicator=new THREE.Mesh(new THREE.RingGeometry(1.18,1.31,48),new THREE.MeshBasicMaterial({color:'#ea8c64',transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));
  indicator.rotation.x=-Math.PI/2;root.add(indicator);
  const shield=new THREE.Mesh(new THREE.TorusGeometry(1,.028,7,60),new THREE.MeshBasicMaterial({color:colors[kind],transparent:true,opacity:.73,depthWrite:false}));
  shield.scale.setScalar(1.12);shield.position.y=1.43;root.add(shield);
  const wide=['basilisk','dementor','graveyard'].includes(kind);
  const shade=groundShadow(wide?1.78:.82,wide?1.11:.56);root.add(shade);
  const fallback={phase:'windup',started:false,status:'active'};
  return {root,update(state,t,point){
    state??=fallback;
    if(point&&Number.isFinite(point.x)&&Number.isFinite(point.z))body.rotation.y=Math.atan2(point.x-root.position.x,point.z-root.position.z);
    animate(state,t);
    indicator.visible=state.status==='active'&&state.started&&state.phase==='windup';
    indicator.position.set(point?point.x-root.position.x:0,.056,point?point.z-root.position.z:0);
    const pulse=.94+.075*Math.sin(t*5.5);indicator.scale.setScalar(pulse);
    shield.visible=state.status==='active'&&(state.phase==='opening'||state.phase==='vulnerable');
    shield.rotation.set(.92+Math.sin(t*.82)*.17,t*.74,.17);
    shield.material.opacity=state.phase==='opening'?.63:.30;
  }};
}
