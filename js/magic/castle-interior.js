// Hogwarts interiors share their measured floor plans with character and camera navigation.
import * as THREE from 'three';
import { castleFloors, castlePassages } from './castle-layout.js';
import { furnishCastleRoom } from './castle-furnishings.js';

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// A seamless original limestone/flagstone swatch. World-space UVs give stones the
// same size on a three-metre pier and the entire length of a corridor wall.
function masonry(floor) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d'), rand = randomSequence(floor ? 80 : 32);
  const rows = floor ? 5 : 9, columns = floor ? 5 : 4;
  const h = 512 / rows, w = 512 / columns;
  g.fillStyle = '#524f4c';
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < rows; row++) {
    let x = (row % 2 ? -.5 : -.18) * w;
    for (let col = 0; col < columns; col++) {
      const next = (col + 1 + (row % 2 ? -.5 : -.18) + (col === columns - 1 ? 0 : rand() * .24 - .12)) * w;
      const tint = Math.floor(rand() * 22), y = row * h;
      const warmth = Math.floor(rand()*14)-7, chip = 1+rand()*2, fissure = rand()>.60;
      const color = floor ? [118+warmth, 118, 113-warmth] : [138+warmth, 132, 121-warmth];
      for (const offset of [0, 512]) {
        const xx = x + offset;
        const variation=g.createLinearGradient(xx,y,xx+w*.7,y+h);
        variation.addColorStop(0, 'rgb('+color.map(v=>v+tint+8).join(',')+')');
        variation.addColorStop(.54, 'rgb('+color.map(v=>v+tint).join(',')+')');
        variation.addColorStop(1, 'rgb('+color.map(v=>v+tint-10).join(',')+')');
        g.fillStyle=variation;
        const x2=next+offset-1.0;
        g.beginPath();g.moveTo(xx+1,y+chip);g.lineTo(xx+chip,y+.75);
        g.lineTo(x2-3,y+1.1);g.lineTo(x2,y+3.2);g.lineTo(x2-.5,y+h-2.1);
        g.lineTo(xx+2.1,y+h-1);g.closePath();g.fill();
        if(fissure) {
          g.strokeStyle='rgba(82,77,68,.3)';g.lineWidth=.8;
          g.beginPath();g.moveTo(xx+w*.19,y+2.2);g.lineTo(xx+w*.26,y+h*.23);
          g.lineTo(xx+w*.22,y+h*.31);g.lineTo(xx+w*.32,y+h*.42);g.stroke();
        }
        g.fillStyle = 'rgba(255,242,213,.22)';
        g.fillRect(xx + 2, y + 1.5, next - x - 4, 1.3);
        g.fillStyle = 'rgba(42,38,37,.24)';
        g.fillRect(xx + 2, y + h - 3, next - x - 4, 1.4);
      }
      x = next;
    }
  }
  const pixels = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const u=((i/4)%512)/512*2*Math.PI, v=Math.floor(i/2048)/512*2*Math.PI;
    const grain=Math.sin(u*6+2*Math.sin(v*4))*2.1+Math.sin(u*9-v*3)*1.6+Math.cos(u*2+v)*2.4;
    const amount = (rand() - .5) * 16+grain;
    for (let c = 0; c < 3; c++) pixels.data[i + c] += amount;
  }
  g.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map, roughness: .93 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', [
      '#include <uv_vertex>',
      '#ifdef USE_INSTANCING',
      '  vec3 p = (instanceMatrix * vec4(position, 1.0)).xyz;',
      '  vec3 n = abs(normalize(mat3(instanceMatrix) * normal));',
      '  vMapUv = (n.y > 0.7 ? p.xz : n.x > 0.7 ? p.zy : p.xy) * 0.23;',
      '#endif',
    ].join('\n'));
  };
  return material;
}

function enchantedSky() {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const g=canvas.getContext('2d'),r=randomSequence(711);
  const wash=g.createLinearGradient(0,0,1024,512);
  wash.addColorStop(0,'#172332');wash.addColorStop(.53,'#34465a');wash.addColorStop(1,'#22253d');
  g.fillStyle=wash;g.fillRect(0,0,1024,512);
  for(let i=0;i<130;i++){
    const x=r()*1100-30,y=255+90*Math.sin(x/180)+(r()-.5)*160,sz=26+r()*65;
    const dust=g.createRadialGradient(x,y,0,x,y,sz);
    dust.addColorStop(0,'rgba(141,138,153,.055)');dust.addColorStop(1,'rgba(126,119,145,0)');
    g.fillStyle=dust;g.fillRect(x-sz,y-sz,sz*2,sz*2);
  }
  for(let i=0;i<840;i++){
    const x=r()*1024,y=r()*512,sz=.36+r()**5*1.75;
    g.fillStyle='rgba(255,241,212,'+(.22+r()*.74)+')';g.beginPath();g.arc(x,y,sz,0,Math.PI*2);g.fill();
    if(sz>1.65){g.fillRect(x-.33,y-sz*2,.66,sz*4);g.fillRect(x-sz*2,y-.33,sz*4,.66);}
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return new THREE.MeshBasicMaterial({map});
}
function lamplight() {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=64;
  const g=canvas.getContext('2d'),v=g.createRadialGradient(32,32,0,32,32,31);
  v.addColorStop(0,'rgba(255,219,154,.85)');v.addColorStop(.19,'rgba(254,185,99,.45)');
  v.addColorStop(.49,'rgba(232,143,67,.12)');v.addColorStop(1,'rgba(216,94,33,0)');
  g.fillStyle=v;g.fillRect(0,0,64,64);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,side:THREE.DoubleSide});
}

function paintWindow(g, submerged) {
  const path = new Path2D('M 31,123 L 31,55 Q 31,26 64,5 Q 97,26 97,55 L 97,123 Z');
  g.save();
  g.scale(2, 1);
  g.strokeStyle = '#b7a487'; g.lineWidth = 4; g.stroke(path);
  g.clip(path);
  const sky = g.createLinearGradient(0, 0, 0, 125);
  sky.addColorStop(0, submerged ? '#102f37' : '#2c385f');
  sky.addColorStop(.62, submerged ? '#397c72' : '#a5a7be');
  sky.addColorStop(1, submerged ? '#689483' : '#e9b782');
  g.fillStyle = sky; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e7d8bb';
  if (!submerged) {
    g.beginPath(); g.arc(79, 37, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#465063';
    g.beginPath(); g.moveTo(0, 118);
    for (let i = 0; i <= 128; i += 4) g.lineTo(i, 92+8*Math.sin(i*.085)+5*Math.cos(i*.17));
    g.lineTo(128,128); g.lineTo(0,128); g.fill();
  }
  g.strokeStyle = 'rgba(27,32,39,.52)'; g.lineWidth = 1;
  for (let x = -128; x < 256; x += 21) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 97, 129); g.stroke();
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 97, 129); g.stroke();
  }
  g.lineWidth = 2.3; g.strokeStyle = '#80786d';
  for (const x of [49, 64, 79]) { g.beginPath(); g.moveTo(x, 124); g.lineTo(x, 49); g.quadraticCurveTo(x, 38, 64, 24); g.stroke(); }
  g.fillRect(30, 82, 68, 1);
  g.restore();
}

function paintPortrait(g, index) {
  const palette = [['#463535','#935347','#ebb774'],['#273c3f','#53766d','#c9a27b'],['#344052','#67759b','#dcb693']];
  const [back,robe,skin] = palette[index % 3];
  g.fillStyle = '#64513b'; g.fillRect(0,0,256,128);
  g.fillStyle = '#c9a667'; g.fillRect(5,3,246,122);
  g.fillStyle = back; g.fillRect(10,6,236,116);
  g.fillStyle = '#b1a184'; g.globalAlpha=.22;
  g.beginPath(); g.ellipse(128,69,81,56,0,0,Math.PI*2); g.fill(); g.globalAlpha=1;
  g.fillStyle=robe;
  g.beginPath(); g.moveTo(54,120); g.quadraticCurveTo(60,80,123,71); g.quadraticCurveTo(197,80,203,120); g.fill();
  g.fillStyle='#352c2b'; g.beginPath(); g.ellipse(130,55,28,32,0,0,Math.PI*2); g.fill();
  g.fillStyle=skin; g.beginPath(); g.ellipse(128,56,20,24,-.12,0,Math.PI*2); g.fill();
  g.fillStyle=index % 2?'#a7a096':'#5a443b';
  g.beginPath(); g.moveTo(103,38); g.quadraticCurveTo(129,9,152,39); g.lineTo(131,36); g.lineTo(101,51); g.fill();
  g.fillStyle='#654a3f'; g.fillRect(116,52,5,2); g.fillRect(134,52,4,2); g.fillRect(125,67,9,1.6);
  g.fillStyle='#cfb993'; g.beginPath(); g.moveTo(106,80); g.lineTo(128,99); g.lineTo(148,80); g.lineTo(127,88); g.fill();
}

// Original heraldic silhouettes, embroidered on velvet in each house's colours.
const bearings={
  G:'M75 94L88 75 82 66 67 63 57 53 55 37 61 24 68 19 65 32 62 40 64 51 73 57 84 56 91 42 103 35 101 27 109 30 117 23 119 31 133 32 138 40 148 43 143 49 129 49 132 57 127 63 141 67 157 58 165 50 170 55 162 67 145 78 124 73 111 84 122 102 135 103 134 111 116 111 100 93 90 106 75 107 70 101Z',
  H:'M57 83L69 74Q66 62 82 54Q99 39 125 44L149 48 160 43 166 48 181 54 193 65 182 73 170 74 157 70 142 82 132 94 119 94 123 84 101 85 87 98 73 97 80 85 68 88Z',
  R:'M126 65Q95 54 83 19L81 33 65 18 72 40 54 30 67 50 54 45 74 64 94 73 106 75 98 92 87 102 102 99 113 110 117 99 124 105 134 90 143 77 157 71 170 56 172 50 182 49 176 44 164 42 158 45 154 53 146 55 151 42 158 18 148 27 147 13 133 35 130 51Z',
  S:'M64 99Q88 118 124 102Q152 89 132 75L108 59Q88 45 105 34Q115 28 131 35L142 41 153 40 158 36 169 37 179 31 168 25 158 24 148 18Q133 14 117 17Q81 18 83 43Q82 58 106 73L122 84Q131 92 117 98Q91 109 64 99Z'
};
function paintBanner(g, colors, emblem) {
  g.beginPath(); g.moveTo(9,4); g.lineTo(247,4); g.lineTo(247,98); g.lineTo(128,126); g.lineTo(9,98); g.closePath();
  g.fillStyle=colors[0]; g.fill(); g.strokeStyle=colors[1]; g.lineWidth=4; g.stroke();
  g.save();g.clip();
  const fold=g.createLinearGradient(0,0,256,8);
  for(let i=0;i<=8;i++)fold.addColorStop(i/8,i%2?'rgba(0,0,0,.25)':'rgba(255,255,245,.12)');
  g.fillStyle=fold;g.fillRect(0,0,256,128);
  g.fillStyle=colors[1];g.globalAlpha=.63;
  for(let i=16;i<246;i+=12){g.fillRect(i,11,5,1);g.fillRect(i+2,9,1,5);}
  for(let y=15;y<104;y+=9){g.fillRect(16,y,4,3);g.fillRect(236,y,4,3);}
  g.globalAlpha=.92;g.translate(5,1);g.scale(.98,.92);
  g.fill(new Path2D(bearings[emblem])); g.restore();
  g.fillStyle=colors[1];g.font='bold 7px Georgia, serif';g.textAlign='center';
  g.fillText({G:'GRYFFINDOR',H:'HUFFLEPUFF',R:'RAVENCLAW',S:'SLYTHERIN'}[emblem],128,106);
}

function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const rects = new Map();
  function tile(key, draw) {
    if (rects.has(key)) return rects.get(key);
    const i = rects.size, x = (i % 8) * 256, y = Math.floor(i / 8) * 128;
    g.save(); g.translate(x, y); g.beginPath(); g.rect(2,2,252,124); g.clip(); draw(g); g.restore();
    const rect = [(x+.5)/2048, 1-(y+127.5)/2048, (x+255.5)/2048,1-(y+.5)/2048];
    rects.set(key, rect); texture.needsUpdate = true; return rect;
  }
  const graphic = (key, content) => tile(key, g => {
    if (key.startsWith('window')) return paintWindow(g, key === 'window:lake');
    if (key.startsWith('portrait:')) return paintPortrait(g, Number(key.slice(9)));
    if (key.startsWith('banner:')) return paintBanner(g, content, key.slice(7,8).toUpperCase());
    g.fillStyle = '#302d29'; g.fillRect(2,15,252,98);
    g.strokeStyle = '#d0b176'; g.lineWidth = 3; g.strokeRect(6,19,244,90);
    g.fillStyle = '#f6e7c8'; g.font = 'bold 30px "Songti SC", "Noto Serif CJK SC", serif'; g.textAlign = 'center'; g.textBaseline='middle';
    g.fillText(content,128,65,223);
  });
  return { graphic, material:new THREE.MeshBasicMaterial({map:texture,alphaTest:.25,side:THREE.DoubleSide}) };
}

const object = new THREE.Object3D(), from = new THREE.Vector3(), to = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);
const color = new THREE.Color();
function makeBatch(group, kit) {
  const instances = new Map(), positions=[], texcoords=[], indices=[], stones=[], stoneColors=[];
  function emit(shape, mat, tint) {
    const key = shape + mat;
    if (!instances.has(key)) instances.set(key, {shape,mat,matrices:[],colors:[]});
    const batch=instances.get(key);
    object.updateMatrix(); batch.matrices.push(object.matrix.clone());
    color.set(tint); batch.colors.push(color.clone());
  }
  function part(shape,x,y,z,w,h,d,tint,mat='plain',rx=0,ry=0,rz=0) {
    object.position.set(x,y,z); object.rotation.set(rx,ry,rz); object.scale.set(w,h,d); emit(shape,mat,tint);
  }
  function beam(x1,y1,z1,x2,y2,z2,width,tint,mat='plain') {
    from.set(x1,y1,z1); to.set(x2,y2,z2).sub(from);
    const length=to.length(); if(length<.0001)return;
    object.position.copy(from).addScaledVector(to,.5);
    object.quaternion.setFromUnitVectors(up,to.multiplyScalar(1/length));
    object.scale.set(width,length,width); emit('round',mat,tint);
  }
  function image(key,content,x,y,z,w,h,facing=1,axis='z') {
    const [u1,v1,u2,v2]=kit.atlas.graphic(key,content), half=w*.5*facing;
    const i = positions.length/3;
    if(axis==='x') positions.push(x,y-h*.5,z+half,x,y-h*.5,z-half,x,y+h*.5,z-half,x,y+h*.5,z+half);
    else positions.push(x-half,y-h*.5,z,x+half,y-h*.5,z,x+half,y+h*.5,z,x-half,y+h*.5,z);
    texcoords.push(u1,v1,u2,v1,u2,v2,u1,v2); indices.push(i,i+1,i+2,i,i+2,i+3);
  }
  // Solid cut voussoirs are built in one vertex-coloured draw per floor.
  function stonePrism(points,z,depth,tint) {
    const front=points.map(([x,y])=>[x,y,z+depth/2]),back=points.map(([x,y])=>[x,y,z-depth/2]);
    function quad(a,b,c,d){
      stones.push(...a,...b,...c,...a,...c,...d);
      for(let i=0;i<6;i++)stoneColors.push(color.r,color.g,color.b);
    }
    color.set(tint);
    quad(...front);quad(back[3],back[2],back[1],back[0]);
    for(let i=0;i<4;i++)quad(front[i],back[i],back[(i+1)%4],front[(i+1)%4]);
  }
  function arch(cx,z,half,spring,rise,width,depth,spandrel=false) {
    for(const sign of [-1,1]){
      function edge(t,outer){
        const len=Math.hypot(rise,2*t*half);
        return [cx+sign*(half*(1-t*t)+outer*rise/len),spring+rise*t+outer*(2*t*half)/len];
      }
      for(let i=0;i<10;i++){
        const a=(i+.012)/10, c=(i+.988)/10;
        let q=[edge(a,0),edge(a,width),edge(c,width),edge(c,0)];
        if(sign<0)q.reverse();
        stonePrism(q,z,depth, [0xc9b798,0xbda98c,0xbfac90,0xb2a087][i%4]);
        if(spandrel){
          const p=edge(a,width),q2=edge(c,width);
          stonePrism([p,q2,[q2[0],7.9],[p[0],7.9]],z,.32,0x938673);
        }
      }
    }
  }
  function finish() {
    if(stones.length){
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(stones,3));
      geo.setAttribute('color',new THREE.Float32BufferAttribute(stoneColors,3));
      geo.computeVertexNormals(); group.add(new THREE.Mesh(geo,kit.carvingMaterial));
    }
    for(const {shape,mat,matrices,colors} of instances.values()) {
      const mesh=new THREE.InstancedMesh(kit.shapes[shape],kit.materials[mat],matrices.length);
      matrices.forEach((matrix,index)=>{mesh.setMatrixAt(index,matrix); mesh.setColorAt(index,colors[index]);});
      mesh.computeBoundingSphere(); group.add(mesh);
    }
    if(positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(texcoords,2)); geometry.setIndex(indices);
      group.add(new THREE.Mesh(geometry,kit.atlas.material));
    }
  }
  return {part, box:(...args)=>part('box',...args), beam,image,arch,finish};
}

const frameStone=0xab957a, iron=0x423d42, brass=0xc7a361;
function pilaster(b,x,z,h) {
  b.box(x,h/2,z,.65,h,.73,0xa99379,'masonry');
  for(const dx of [-.22,.22])for(const dz of [-.28,.28])
    b.part('round',x+dx,h*.50,z+dz,.27,h-.37,.27,0xac997f);
  for(const [y,w,d,height,tint] of [[.18,.90,.91,.36,0x887963],[.46,.78,.86,.19,frameStone],
    [h-.48,.81,.85,.18,0x948168],[h-.26,.98,.96,.25,frameStone],[h-.08,1.10,1.08,.17,0xbaa589]])b.box(x,y,z,w,height,d,tint);
}
function lamp(b,x,y,z,normal) {
  b.box(x,y-.25,z,.22,.72,.16,iron);
  b.beam(x,y-.47,z,x,y-.05,z+normal*.46,.09,brass);
  b.part('round',x,y,z+normal*.46,.42,.1,.42,brass);
  b.part('round',x,y+.18,z+normal*.46,.15,.34,.15,0xffdf9e);
  b.part('orb',x,y+.49,z+normal*.46,.13,.27,.13,0xffd18a,'glow');
  b.part('halo',x,y+.48,z+normal*.49,1.62,1.62,1,0xffffff,'halo');
}

function buildFloor(floor, group, kit, solids, shaftOnly = false) {
  const b = makeBatch(group,kit), under = floor.level < 0;
  const wallColor=under ? 0x8e9a97 : 0xe1d6c2, tileColor=under?0x909d98:0xcacec7;
  const H=7.92;
  const stairwell=floor.surfaces.find(s=>s.kind==='landing');
  for(const s of floor.surfaces) {
    if(shaftOnly && s.kind==='room')continue;
    const w=s.x2-s.x1, d=s.z2-s.z1, x=(s.x1+s.x2)/2, z=(s.z1+s.z2)/2;
    if(s.kind==='stairs') {
      const count=Math.max(1,Math.ceil(Math.abs(s.y2-s.y1)/.2));
      for(let i=0;i<count;i++) {
        const dz=d/count, sy=s.y1+(s.y2-s.y1)*(i+.5)/count-floor.y;
        b.box(x,sy-.275,s.z1+(i+.5)*dz,w,.55,dz+.012,0xb8a78c,'floor');
      }
      for(const edge of [s.x1+.035,s.x2-.035]) {
        const y1=s.y1-floor.y,y2=s.y2-floor.y;
        b.beam(edge,y1+1,s.z1,edge,y2+1,s.z2,.105,brass);
        for(let i=0;i<=count;i+=3) {
          const f=i/count,sy=y1+(y2-y1)*f;
          b.box(edge,sy+.46,s.z1+d*f,.095,.92,.095,iron);
        }
      }
      for(const side of [-1,1]){
        const ex=x+side*(w/2-.13);
        b.beam(ex,s.y1-floor.y-.27,s.z1,ex,s.y2-floor.y-.27,s.z2,.36,0x806f5b);
      }
      continue;
    }
    const localY=s.y1-floor.y;
    b.box(x,localY-.06,z,w,.12,d,tileColor,'floor');
    if(s.kind!=='landing') {
      const room=floor.rooms.find(r=>r.id===s.roomId);
      const starCeiling=room?.id==='great-hall'||room?.id==='astronomy';
      b.box(x,H-.02,z,w,.15,d,starCeiling?0xffffff:under?0x514f50:0x665d51,starCeiling?'sky':'plain');
    }
  }
  for (const wall of floor.walls) {
    const x=(wall.x1+wall.x2)/2, z=(wall.z1+wall.z2)/2;
    if(shaftOnly && !(Math.abs(z)<=4 || (stairwell && Math.abs(x)<=stairwell.x2+.01 && z<0)))continue;
    const w=Math.abs(wall.x2-wall.x1),d=Math.abs(wall.z2-wall.z1);
    b.box(x,H*.5,z,w+.30,H,d+.30,wallColor,'masonry');
    for(const [y,height] of [[.26,.48],[6.62,.2],[7.68,.30]])
      b.box(x,y,z,w+.42,height,d+.42,under?0x777a74:0xb5a58e);
  }
  for(const room of shaftOnly ? [] : floor.rooms) {
    const inward=(room.z1+room.z2)/2>room.doorZ?1:-1;
    if(room.secret){furnishCastleRoom(b,room,floor,solids);continue;}
    const doorWidth=room.doorWidth;
    // The door's centre stays clear below the spring line on both faces.
    for(const sign of [-1,1]) {
      pilaster(b,room.doorX+sign*(doorWidth*.5+.20),room.doorZ,4.03);
      lamp(b,room.doorX+sign*(doorWidth*.5+.8),2.35,room.doorZ-.20*inward,-inward);
    }
    b.arch(room.doorX,room.doorZ,doorWidth*.5-.11,4.01,1.82,.52,1.03,true);
    b.arch(room.doorX,room.doorZ,doorWidth*.5+.38,4.03,2.25,.14,1.14);
    b.box(room.doorX,6.16,room.doorZ,.41,.66,1.13,0xc5ac86);
    b.image('label:'+room.id,room.name,room.doorX,6.76,room.doorZ-.70*inward,3.15,.78,-inward);
    furnishCastleRoom(b,room,floor,solids);
  }
  const stairVestibule=stairwell;
  if(stairVestibule){
    const farLanding=floor.surfaces.find(s=>s.kind==='landing' && s!==stairVestibule);
    const z=farLanding?.z1??stairVestibule.z1;
    if(farLanding){
      b.image('window:sky',null,0,5.86,z+.18,5.5,4.66);
      for(const sign of [-1,1]){
        b.image('portrait:'+(Math.abs(floor.level)%3),null,sign*4.1,5.93,z+.19,1.83,2.2);
        lamp(b,sign*2.5,4.25,z+.2,1);
      }
    }
    // A carved arcade reveals the upper and lower flights through a broad opening.
    for(const sign of [-1,1])pilaster(b,sign*5.79,stairVestibule.z2-.38,4.9);
    b.arch(0,stairVestibule.z2-.38,5.59,4.88,2.11,.45,.82);
  }
  for(const p of shaftOnly ? [] : castlePassages.filter(p=>p.level===floor.level)) {
    // A flush brass rosette marks the magical threshold without blocking it.
    b.part('round',p.x,.025,p.z,1.65,.04,1.65,brass);
    b.part('round',p.x,.052,p.z,1.35,.015,1.35,0x36515a);
    for(let i=0;i<4;i++) b.part('box',p.x,.068,p.z,1.14,.012,.055,brass,'plain',0,i*Math.PI/4,0);
  }
  const corridor=floor.surfaces.find(s=>s.kind==='corridor');
  if(corridor) {
    const cz=(corridor.z1+corridor.z2)/2;
    b.box((corridor.x1+corridor.x2)/2,.014,cz,corridor.x2-corridor.x1-.45,.025,2.55,under?0x344e47:0x77413f);
    for(const dz of [-1.15,1.15]) b.box((corridor.x1+corridor.x2)/2,.031,cz+dz,corridor.x2-corridor.x1-.7,.012,.045,brass);
    for(let x=corridor.x1+3;x<corridor.x2-1;x+=6) {
      for(const side of [-1,1]) {
        b.beam(x,5.7,cz+side*(corridor.z2-corridor.z1)*.46,x,7.60,cz+side*.56,.19,frameStone);
      }
      b.part('orb',x,7.56,cz,.34,.24,.34,brass);
    }
  }
  b.finish();
}

// Builds floors as they enter view. Usage starts in the entrance hall, and only
// the tower currently being climbed needs to be resident on a student's phone.
export function buildCastleInterior() {
  const group=new THREE.Group(), solids=[];
  group.name='HogwartsCastleInterior';
  const kit={
    atlas:makeAtlas(),
    carvingMaterial:new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.88}),
    shapes:{box:new THREE.BoxGeometry(1,1,1),round:new THREE.CylinderGeometry(.5,.5,1,12),
      orb:new THREE.SphereGeometry(.5,12,8),cone:new THREE.ConeGeometry(.5,1,12),
      ring:new THREE.TorusGeometry(.42,.075,6,24),halo:new THREE.PlaneGeometry(1,1)},
    materials:{plain:new THREE.MeshStandardMaterial({roughness:.76}),
      glow:new THREE.MeshBasicMaterial({color:0xffffff}),halo:lamplight(),sky:enchantedSky(),masonry:masonry(false),floor:masonry(true)},
  };
  const built=new Map(), stairwells=new Map();
  function realize(floor, shaftOnly=false) {
    const cache=shaftOnly?stairwells:built;
    if(cache.has(floor))return cache.get(floor);
    const g=new THREE.Group(); g.position.y=floor.y; g.name=floor.name;
    buildFloor(floor,g,kit,solids,shaftOnly); group.add(g); cache.set(floor,g); return g;
  }
  const warm=new THREE.PointLight(0xffbe7d,32,22,1.7);
  group.add(warm);
  const localFill=new THREE.HemisphereLight(0xd9e0f6,0x847765,.92); group.add(localFill);
  const lampLights=Array.from({length:3},(_,i)=>{
    const light=new THREE.PointLight(i===2?0xadc5ff:0xffb568,i===2?63:48,i===2?25:16,1.6);
    group.add(light);return light;
  });
  let lastFloor=null, lastNeighbor=null;
  function update(position,time=0) {
    let index=0;
    for(let i=1;i<castleFloors.length;i++) if(castleFloors[i].y<=position.y+.0001)index=i;
    const floor=castleFloors[index], belowStair=castleFloors[index-1], aboveStair=castleFloors[index+1];
    const nearWell=Math.abs(position.x)<17 && position.z<21 && position.z>-32;
    if(lastFloor!==floor||lastNeighbor!==nearWell) {
      realize(floor);
      if(nearWell && belowStair)realize(belowStair,true);
      if(nearWell && aboveStair)realize(aboveStair,true);
      for(const [f,g] of built)g.visible=f===floor;
      for(const [f,g] of stairwells)g.visible=nearWell&&(f===belowStair||f===aboveStair);
      lastFloor=floor; lastNeighbor=nearWell;
    }
    const room=floor.rooms.find(r=>position.x>r.x1 && position.x<r.x2 && position.z>r.z1 && position.z<r.z2);
    const width=room?room.x2-room.x1:12, cx=room?(room.x1+room.x2)/2:position.x;
    const sign=room?Math.sign(room.doorZ):1, front=room?room.doorZ:position.z;
    const far=room?(sign>0?room.z2:room.z1):front-13;
    for(let i=0;i<2;i++) {
      const x=room?cx+(i?1:-1)*Math.min(width*.28,5.4):cx+(i?4:-4);
      lampLights[i].position.set(x,floor.y+3.15,front+sign*(room?2.45:-3));
      lampLights[i].intensity=67+1.3*Math.sin(time*3+i);
    }
    lampLights[2].position.set(cx,floor.y+5.6,far-sign*2.5);
    warm.position.set(position.x,position.y+3.7,position.z+.9);
    warm.intensity=26+Math.sin(time*2.12)*.65;
  }
  update({x:0,y:0,z:12});
  return {group,solids,update};
}
