import * as THREE from 'three';
import {addDawnCeremony} from './ceremony.mjs';

const years = [
  {sky:'#928468',stone:'#766e66',floor:'#aa9480',trim:'#b19150',accent:'#d5b65d'},
  {sky:'#526969',stone:'#495e58',floor:'#75827b',trim:'#557e70',accent:'#8fc6a6'},
  {sky:'#4d627b',stone:'#56635e',floor:'#687565',trim:'#5f6853',accent:'#c8deeb'},
  {sky:'#585a6a',stone:'#666768',floor:'#696e5a',trim:'#688366',accent:'#a8c8a0'},
  {sky:'#526473',stone:'#404c55',floor:'#596775',trim:'#697f8a',accent:'#b9d9f1'},
  {sky:'#645f77',stone:'#6f6878',floor:'#8e858a',trim:'#ab9468',accent:'#e6cc91'},
  {sky:'#887e79',stone:'#6e6764',floor:'#9c9182',trim:'#9b795a',accent:'#edc18f'}
];
const leads = [
  [[-2.65,3.1],[2.75,-1.6],[-3.45,-4.2]],
  [[2.8,2.8],[-2.55,-2.1],[3.6,-4.25]],
  [[-2.85,2.7],[2.9,-1.8],[-3.35,-4.15]],
  [[2.6,3.0],[-2.9,-1.55],[3.4,-4.15]],
  [[-2.65,3.0],[2.65,-2.1],[-3.55,-4.15]],
  [[2.7,2.7],[-2.8,-1.8],[3.4,-4.3]],
  [[-2.75,2.9],[2.8,-1.55],[-3.45,-4.1]]
];

export function sagaLayout(id) {
  if(id==='epilogue')return {year:8,sky:'#bcc2ad',spawn:[0,6.8],bounds:[-6.7,6.7,-9,8.9],npc:[-2.8,2.8],inspect:[2.8,-1.8],target:[-3.5,-4.15],exit:[0,-8.15]};
  const match=/^(arena-)?year([1-7])$/.exec(id);
  if(!match)return null;
  const year=Number(match[2]),arena=!!match[1];
  const [npc,inspect,target]=arena?[[0,-2.2],[-2.7,-2.4],[4.4,4.25]]:leads[year-1];
  return {...years[year-1],year,arena,spawn:[0,6.8],bounds:[-6.7,6.7,-9,8.9],npc,inspect,target,exit:[0,-8.15]};
}

function rotateColumn(w,x,z,h,stone,trim){
  w.box(x,.18,z,.92,.36,.92,stone);
  w.cylinder(x,h*.50,z,.30,h-.28,stone,0,0,0,.83,8);
  w.cylinder(x,h-.11,z,.43,.20,trim,0,0,0,1.08,8);
  w.box(x,h+.04,z,.88,.15,.88,stone);
}

function vaultedCourt(w,m,height=5.1) {
  for(const side of [-1,1]){
    const x=side*7.65;
    w.box(x,height*.49,-.8,.72,height,21.2,m.stone);
    w.box(x-side*.36,.55,-.8,.20,1.05,21.1,m.trim);
    for(const z of [-9.8,-5.5,-1.2,3.1,7.4]){
      rotateColumn(w,x-side*.42,z,height,m.stone,m.trim);
      w.beam([x-side*.42,height,z],[side*4.35,height+1.04,z],.19,m.stone,.30);
      w.beam([side*4.35,height+1.04,z],[0,height+1.44,z],.16,m.stone,.27);
    }
  }
  w.box(0,height+.92,-.9,15.8,.22,22.3,m.stone);
  w.box(0,height*.48,-10.65,15.8,height,1,m.stone);
  const masonry=new THREE.Color(m.stone);
  const courses=[.94,1.05,1.13].map(gain=>masonry.clone().multiplyScalar(gain).getHex());
  for(let row=0;row<8;row++)for(let col=-5;col<=5;col++){
    const x=(col+row%2*.5)*1.42;
    if(Math.abs(x)<2.70||Math.abs(x)>7.21)continue;
    w.box(x,.32+row*.6,-10.13,1.37,.56,.070,courses[(col+row+6)%3]);
  }
  w.arch(0,2.4,-10.03,2.40,1.92,.33,m.trim);
  w.box(0,1.35,-10.12,4.2,2.7,.26,'#383a37');
}

function floorTiles(w,m) {
  const alternate=new THREE.Color(m.floor).multiplyScalar(.88);
  const seam=new THREE.Color(m.floor).multiplyScalar(.64);
  const surface=w.texture('worn school flagstone',96,96,(c,W,H)=>{
    c.fillStyle='#f4f2ec';c.fillRect(0,0,W,H);
    for(let i=0;i<580;i++){
      const x=w.random()*W,y=w.random()*H;
      c.fillStyle=i%3?'rgba(93,79,69,.039)':'rgba(255,255,252,.64)';
      c.fillRect(x,y,.4+w.random()*3,.4+w.random()*1.36);
    }
    c.strokeStyle='rgba(90,87,77,.095)';c.lineWidth=.64;
    c.beginPath();c.moveTo(26,0);c.lineTo(28,6);c.lineTo(37,15);c.lineTo(34,20);c.stroke();
    c.beginPath();c.moveTo(96,68);c.lineTo(83,71);c.lineTo(77,81);c.stroke();
  });
  const tiles=[m.floor,alternate.getHex()].map((color,i)=>w.customMaterial('flagstone-'+i,{map:surface,color,roughness:.86}));
  w.box(0,-.17,0,16,.29,22,seam.getHex());
  for(let a=-4;a<4;a++)for(let b=-6;b<6;b++){
    const tint=tiles[Math.abs(a+b)%2];
    w.box(a*2+1,-.032,b*1.82+.72,1.983,.055,1.804,tint);
  }
}

function twilight(w,year){
  const shades={
    3:['#172b48','#364e6a','#7c969d'],
    4:['#29293c','#45495d','#848a80'],
    6:['#272c49','#474963','#938695']
  }[year];
  const sky=w.texture('twilight',512,256,(ctx,W,H)=>{
    const fill=ctx.createLinearGradient(0,0,0,H);
    fill.addColorStop(0,shades[0]);fill.addColorStop(.34,shades[1]);fill.addColorStop(.53,shades[2]);fill.addColorStop(1,shades[2]);
    ctx.fillStyle=fill;ctx.fillRect(0,0,W,H);
    for(let i=0;i<140;i++){
      const x=w.random()*W,y=w.random()*H*.48,r=.45+w.random()*.83;
      ctx.fillStyle='rgba(236,240,222,'+(.18+w.random()*.43)+')';ctx.fillRect(x,y,r,r);
    }
  });
  const air=w.customMaterial('evening sky',{map:sky,side:THREE.BackSide,depthWrite:false,fog:false},true);
  w.ball(0,0,0,60,55,60,air);
}

function grass(w,m) {
  const field=w.texture('night grass',128,128,(ctx,W,H)=>{
    ctx.fillStyle='#c7c5ae';ctx.fillRect(0,0,W,H);
    for(let i=0;i<1800;i++){
      ctx.fillStyle=i%3?'rgba(84,95,63,.14)':'rgba(244,231,184,.29)';
      ctx.fillRect(w.random()*W,w.random()*H,.5+w.random()*2.5,.6+w.random()*2.1);
    }
  });
  field.wrapS=field.wrapT=THREE.RepeatWrapping;field.repeat.set(7,9);
  w.box(0,-.18,0,17,.34,22,w.customMaterial('meadow',{color:m.floor,map:field,roughness:1}));
  const seed=w.geo('grass-blade',()=>new THREE.ConeGeometry(1,1,3));
  for(let i=0;i<126;i++){
    const side=i%2?1:-1,x=side*(4.55+w.random()*3.40),z=w.random()*21-10.9;
    for(let j=0;j<3;j++)w.place(seed,j%2?'#79866b':'#607158',x+.067*j,.09,z,.053,.18+w.random()*.18,.047,.13,0,(j-1)*.32);
  }
}

function flame(w,x,z,h,color) {
  w.cylinder(x,.10,z,.30,.20,'#45433c');
  w.cylinder(x,h*.5,z,.065,h-.12,'#675b50');
  w.cylinder(x,h,z,.26,.15,'#998264',0,0,0,1.4);
  w.ball(x,h+.21,z,.105,.24,.10,color);
}

function chess(w,x,z,tint,index){
  w.cylinder(x,.13,z,.46,.26,tint,0,0,0,.88);
  w.cylinder(x,.52,z,.32,.64,tint,0,0,0,.61);
  w.cylinder(x,.89,z,.31,.13,tint);
  if(index%2===0){
    w.ball(x,1.20,z,.31,.38,.24,tint);
    w.box(x,1.49,z,.091,.32,.09,tint);w.box(x,1.50,z,.25,.085,.09,tint);
  }else{
    w.cylinder(x,1.17,z,.31,.46,tint,0,0,0,1.13,8);
    for(let i=0;i<4;i++)w.box(x+Math.cos(i*Math.PI/2)*.24,1.45,z+Math.sin(i*Math.PI/2)*.24,.14,.19,.14,tint);
  }
}

function mirrorRoom(w,m) {
  vaultedCourt(w,m,5.15);
  for(const side of [-1,1])for(const [i,z] of [-7,-3.3,.4,4.1,7.8].entries()){
    chess(w,side*(m.arena?6.2:5.7),z,side>0?'#46474a':'#cec5ae',i);
    if(!m.arena)w.bufferWall(side*5.7,z,.83,.83,1.6);
  }
  const z=-9.92;
  w.box(0,2.88,z,2.45,4.91,.23,'#514832');
  w.box(0,2.84,z+.14,2.17,4.49,.06,'#7d9b95');
  for(const side of [-1,1]){
    w.cylinder(side*1.18,2.72,z+.18,.105,4.84,'#b89a59');
    w.cylinder(side*1.18,5.40,z+.18,.17,.64,'#c6ab69',0,0,0,.03,8);
    flame(w,side*3.6,z+1.45,1.47,w.flame);
  }
  w.arch(0,4.83,z+.18,1.16,.98,.13,'#b89a59');
  if(!m.arena){
    for(let i=0;i<9;i++){
      const x=-4.7+i*1.18,y=3.15+.52*Math.sin(i*1.36),z=-5.8+i%3*.64;
      w.cylinder(x,y,z,.034,.42,'#d6b45a',0,0,.78);
      w.arch(x-.09,y+.07,z,.17,.10,.03,'#dbe5d9');w.arch(x+.10,y+.07,z,.17,.10,.03,'#dbe5d9');
    }
  }
}

function snakeMarker(w,x,z,scale){
  const green='#6f8c77';
  w.cylinder(x,.19*scale,z,.48*scale,.38*scale,green,0,0,0,.89,10);
  for(let i=0;i<7;i++){
    const t=i/6;
    w.ball(x+Math.sin(t*5)*.22*scale,(.42+t*.75)*scale,z,.22*scale,.20*scale,.21*scale,green);
  }
  w.ball(x-.20*scale,1.32*scale,z+.11*scale,.29*scale,.17*scale,.43*scale,green);
  for(const s of [-1,1])w.ball(x+(-.20+s*.16)*scale,1.37*scale,z+.34*scale,.046*scale,.037*scale,.04*scale,'#c8c987');
}

function chamber(w,m) {
  vaultedCourt(w,m,4.55);
  for(const side of [-1,1]){
    w.box(side*6.45,.008,-.6,1.12,.02,19.45,'#527a74');
    for(const [i,z] of [-7.5,-3.3,.9,5.3].entries()){
      snakeMarker(w,side*5.85,z,m.arena?1.38:1.04);
      w.bufferWall(side*5.85,z,1.1,1.0,2.0);
      if(!m.arena)w.cylinder(side*7.05,2.4+i*.16,z,.22,3.4,'#747e66',Math.PI/2);
    }
  }
  if(m.arena){
    w.ball(0,3.35,-10,2.13,2.08,.62,'#6b7c68');
    for(const s of [-1,1]){
      w.box(s*.78,3.70,-9.52,.85,.18,.19,'#3d5447',0,0,s*.22);
      w.ball(s*.76,3.45,-9.46,.24,.115,.13,'#9eac81');
      for(let i=0;i<3;i++)w.cylinder(s*(.32+i*.30),1.91-i*.1,-9.60,.19,1.2+i*.13,'#647461');
    }
    w.ball(0,3.09,-9.42,.255,.43,.32,'#78866e');
  }else{
    for(let i=0;i<7;i++){
      const a=i*Math.PI*2/7;
      const x=Math.cos(a)*1.32,y=2.28+Math.sin(a)*1.32;
      w.beam([x*.28,2.28+(y-2.28)*.28,-9.82],[x,y,-9.82],.15,'#a3a085');
      w.ball(x,y,-9.71,.18,.13,.19,'#7d947c');
    }
  }
}

function pine(w,x,z,h){
  w.cylinder(x,h*.22,z,.15,h*.44,'#51483d');
  for(let i=0;i<3;i++)w.cylinder(x,h*(.39+i*.18),z,h*(.28-i*.047),h*.49,i%2?'#334e45':'#3f5a4f',0,i*.74,0,.02,7);
}
function moon(w,x,y,z){
  const glow=w.customMaterial('saga-moon',{color:'#e4e8cd',fog:false},true);
  w.ball(x,y,z,1.47,1.47,1.47,glow);
}
function shore(w,m){
  grass(w,m);
  w.box(0,-.34,-22,70,.29,27,'#405e6e');
  for(let i=0;i<54;i++){
    w.box((i%11-5)*3.2+.8*Math.sin(i),-.18,-11.8-i%7*1.94,1.37+i%4,.015,.04+(i%3)*.03,i%3?'#739097':'#92a6a6');
  }
  for(const side of [-1,1])for(let i=0;i<10;i++){
    const z=9.0-i*2.3,x=side*(8.25+(i%3)*.83);
    pine(w,x,z,3.7+(i%4)*.63);
    w.ball(side*7.15,.28,z+.5,.65,.50,.85,'#677167');
  }
  for(let i=0;i<12;i++)w.ball(-28.0+i*5.0,.4,-30-i%4,4.1,2.8+i%3,3.3,'#566b70');
  moon(w,-11,10,-30);
  if(!m.arena){
    for(let i=0;i<4;i++){
      w.box(-4.9,.06,-5.4+i*.50,2.07,.13,.46,'#96836a');
    }
    for(const s of [-1,1])w.cylinder(-4.9+s*.79,.48,-5.55,.075,1.02,'#55544d');
  }else{
    for(const side of [-1,1])for(let i=0;i<4;i++)
      w.cylinder(side*(6.3+i*.15),.54,-5-i*.5,.036,1.08,'#a4a47c',0,0,side*(.1+i*.06));
  }
}

function hedge(w,x,z,l,side){
  w.box(x,.92,z,side?.95:l,1.85,side?l:.95,'#425946');
  for(let i=0;i<Math.ceil(l);i++){
    const off=i-(Math.ceil(l)-1)*.5;
    w.ball(x+(side?0:off),1.77+.09*Math.sin(i*6.1),z+(side?off:0),side?.52:.66,.44,side?.66:.52,'#577054');
  }
}
function memorial(w,x,z,s){
  w.box(x,.13*s,z,.96*s,.26*s,.72*s,'#53595a');
  w.box(x,.77*s,z,.58*s,1.12*s,.28*s,'#858981');
  w.ball(x,1.31*s,z,.31*s,.27*s,.15*s,'#858981');
  w.box(x,.86*s,z+.16*s,.35*s,.043*s,.02*s,'#5f6660');
}
function tournament(w,m){
  grass(w,m);
  if(!m.arena){
    for(const side of [-1,1]){
      hedge(w,side*7.2,-.4,20,true);
      for(const z of [-6.0,-.9,4.9]){
        hedge(w,side*5.9,z,2.25,false);
        w.bufferWall(side*5.9,z,2.25,1.03,2.2);
      }
      for(const z of [1,7]){
        w.cylinder(side*6,2.1,z,.06,4.2,'#86735c');
        w.box(side*6,3.13,z,.08,1.6,.69,side>0?'#976c38':'#5a7382');
      }
    }
    w.cylinder(0,.68,-9.70,.46,1.36,'#827e69');
    w.cylinder(0,1.55,-9.70,.28,.47,'#c7aa6c',0,0,0,1.7);
    for(const side of [-1,1]){
      w.arch(side*.37,1.54,-9.70,.19,.23,.048,'#ceae69');
      for(const [i,z] of [-7.4,-9.1,-11.0].entries())memorial(w,side*(4.85+i*.51),z,.93+i*.13);
    }
    for(let i=0;i<5;i++)pine(w,-11.80+i*5.9,-16-i%2*1.4,4.12+i%2*.75);
  }else{
    for(const side of [-1,1])for(const [i,z] of [-8.3,-5.8,-2.1,.35,3.7,7.2].entries()){
      memorial(w,side*(5.7+i%2*.58),z, .92+i%3*.16);
    }
    w.box(0,.20,-10.15,3,.40,1.64,'#424b4b');
    w.box(0,.72,-10.15,2.58,.71,1.36,'#747a6d');
    w.ball(0,1.65,-10.2,.46,.85,.36,'#686f68');
    for(const s of [-1,1])w.ball(s*.51,1.87,-10.2,.23,.82,.27,'#757c71');
    for(let i=0;i<6;i++)pine(w,-16+i*5.8,-15.4-i%3,3.8+i%3);
    moon(w,12,8,-32);
  }
}
function prophecyHall(w,m){
  const wood='#55483e',metal='#687d81';
  for(const side of [-1,1])for(const z of [-7.5,-2.5,2.5,7.5]){
    const x=side*6.0;
    for(const dz of [-1.87,1.87])w.box(x,2.05,z+dz,.74,4.1,.13,wood);
    for(let row=0;row<4;row++){
      const y=.48+row*.96;
      w.box(x,y,z,.74,.12,3.84,wood);
      for(let j=-2;j<=2;j++){
        const zz=z+j*.66;
        w.cylinder(x-side*.13,y+.12,zz,.13,.14,metal);
        w.ball(x-side*.13,y+.32,zz,.20,.20,.20,(row+j)%3===0?'#b7d0ca':'#7b99a7');
      }
    }
    w.bufferWall(x,z,.83,3.84,4.1);
  }
  w.box(0,1.7,-10.15,16,3.42,.67,m.stone);
  for(const s of [-1,1])rotateColumn(w,s*2.0,-9.88,3.45,m.stone,m.trim);
  w.arch(0,3.49,-9.88,2,1.48,.37,m.trim);
  if(m.arena){
    w.box(0,1.65,-9.77,3.6,3.3,.11,'#34393e');
    for(let i=-3;i<=3;i++)w.box(i*.43,1.66,-9.69,.10,3.22,.045,'#404b54',0,0,i*.025);
  }
}
function observatory(w,m){
  for(const side of [-1,1]){
    w.box(side*7.55,.74,0,.72,1.48,21,m.stone);
    for(let i=0;i<11;i++)w.box(side*7.55,1.58,9.7-i*1.92,.85,.49,1.05,m.stone);
    for(const z of [-7.05,3.16,8.34])rotateColumn(w,side*7.1,z,m.arena?1.78:4.04,m.stone,m.trim);
    for(const z of [-4.1,6.1]){
      const x=side*5.5;
      w.cylinder(x,1.52,z,.13,1.56,'#b89c61',1.09,side*.28,0,1.15);
      for(const shift of [-.32,.32])w.beam([x+shift,.05,z+.20],[x,1.37,z],.075,'#675c4d');
      w.beam([x,.05,z-.52],[x,1.37,z],.075,'#675c4d');
      w.bufferWall(x,z,.75,.70,1.9);
    }
  }
  w.box(0,.73,-10.28,16,1.47,.80,m.stone);
  for(let i=-4;i<=4;i++)w.box(i*1.72,1.51,-10.28,.90,.47,.83,m.stone);
  if(!m.arena){
    const ring=w.geo('saga-armillary',()=>new THREE.TorusGeometry(1,.045,8,44));
    for(let i=0;i<3;i++)w.place(ring,'#c1a973',0,2.23,-9.54,1.30,1.30,1.30,.68+i*.43,i*.85,0);
    w.ball(0,2.23,-9.54,.24,.24,.24,'#bc9660');
  }
  for(let i=-4;i<=4;i++){
    const x=i*4.20+1.40,z=-18-i%2*3,h=2.9+(i*i%4)*.7;
    w.cylinder(x,h/2-1.5,z,1.12,h,'#635e6d');
    w.cylinder(x,h+.22-1.5,z,1.50,1.63,'#424656',0,0,0,.04,8);
  }
  moon(w,-10,9.1,-34);
}
function greatHall(w,m,restored=false){
  const stone=restored?'#a9997f':m.stone;
  for(const side of [-1,1]){
    w.box(side*7.71,2.46,-.6,.66,4.9,22,stone);
    for(const [i,z] of [-8.7,-5.1,-1.5,2.1,5.7,9.3].entries()){
      const h=restored?4.8:(i+side+3)%3===0?2.6:4.8;
      rotateColumn(w,side*7.14,z,h,stone,m.trim);
      w.box(side*7.32,2.85,z+1.57,.12,2.66,1.38,'#7a9091');
      for(const dz of [-.5,0,.5])w.box(side*7.24,2.88,z+1.57+dz,.06,2.66,.055,'#746e62');
      if(h>4){
        w.beam([side*7.1,h,z],[side*4.5,h+1.0,z],.24,stone);
        w.beam([side*4.5,h+1.0,z],[0,h+1.6,z],.17,stone);
      }else{
        w.box(side*5.72,.34,z,1.7,.62,.88,stone,0,side*.52,.19);
        w.bufferWall(side*5.72,z,1.54,.88,.7);
      }
    }
  }
  w.box(0,2.43,-10.64,16,4.85,.72,stone);
  for(let i=-2;i<=2;i++){
    const x=i*2.31;
    w.box(x,3.03,-10.23,1.53,2.85,.12,'#81999b');
    w.arch(x,3.86,-10.12,.78,.86,.16,m.trim);
    w.box(x,3.0,-10.10,.08,2.76,.10,m.trim);
  }
  if(!m.arena||restored){
    for(const side of [-1,1])for(const z of [-5.8,0,5.8]){
      w.box(side*5.3,.77,z,.98,.15,3.1,'#936c4c');
      for(const dz of [-1.15,1.15])w.box(side*5.3,.39,z+dz,.72,.72,.17,'#735640');
      w.bufferWall(side*5.3,z,1.15,3.15,.85);
    }
  }
}

export function buildSagaMap(w,m) {
  if(m.year===8){
    const morning={...years[6],floor:'#bcad91',trim:'#ba9a60',arena:false};
    floorTiles(w,morning);greatHall(w,morning,true);
    for(const side of [-1,1])for(const z of [-6.5,.6,7.4]){
      const x=side*6.62;w.cylinder(x,2.43,z,.042,4.86,'#8e7b55');
      w.box(x,3.35,z,.95,1.33,.06,side>0?'#8e4853':'#697461');
      w.lamp(x-side*.35,2.12,z+.9,.7,true);
    }
    addDawnCeremony(w);
    return;
  }
  if([3,4,6].includes(m.year))twilight(w,m.year);
  if(m.year!==3&&m.year!==4)floorTiles(w,m);
  [mirrorRoom,chamber,shore,tournament,prophecyHall,observatory,greatHall][m.year-1](w,m);
  if(![3,4,6].includes(m.year))for(const side of [-1,1])for(const z of [-5.6,5.8]){
    flame(w,side*4.98,z,1.49,w.flame);
  }
}
