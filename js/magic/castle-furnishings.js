// Fitted furniture is placed in room-local coordinates, measured inward from
// the threshold. Its footprints feed the same collision data as the masonry.
const oak=0x694b37, oakLight=0x976b44, darkOak=0x493831, bronze=0xc29a5f;
const iron=0x444952, parchment=0xead9b4, stone=0xa49987, black=0x292b35;
const bookColors=[0x713e3f,0x355252,0x4b5067,0xa17f52,0x5e493b,0x73765c];
export const houseColors={
  gryffindor:['#793d3f','#dfb671'],hufflepuff:['#b69452','#342f30'],
  ravenclaw:['#374e70','#c39769'],slytherin:['#315d51','#b4c0b9'],
};
const houses=Object.keys(houseColors);

function prepareRoom(b, room, floor, solids) {
  const w=room.x2-room.x1,d=room.z2-room.z1,
    mid=(room.x1+room.x2)/2,dir=(room.z1+room.z2)/2>room.doorZ?1:-1;
  const worldZ=z=>room.doorZ+z*dir;
  const box=(x,y,z,width,h,depth,c,m)=>b.box(mid+x,y,worldZ(z),width,h,depth,c,m);
  const part=(shape,x,y,z,width,h,depth,c,m,rx=0,ry=0,rz=0)=>
    b.part(shape,mid+x,y,worldZ(z),width,h,depth,c,m,rx*dir,ry*dir,rz);
  const beam=(x1,y1,z1,x2,y2,z2,width,c)=>b.beam(mid+x1,y1,worldZ(z1),mid+x2,y2,worldZ(z2),width,c);
  const image=(key,content,x,y,z,width,h)=>b.image(key,content,mid+x,y,worldZ(z),width,h,-dir);
  const sideImage=(key,text,side,y,z,width,h)=>b.image(key,text,
    mid+side*(w/2-.19),y,worldZ(z),width,h,-side,'x');
  const solid=(x,z,width,depth,h)=>{
    solids.push({level:floor.level,x1:mid+x-width/2,x2:mid+x+width/2,
      z1:worldZ(z)-depth/2,z2:worldZ(z)+depth/2,y1:floor.y,y2:floor.y+h});
  };
  return {b,room,floor,w,d,mid,box,part,beam,image,sideImage,solid};
}

function candle(r,x,y,z,h=.39,ghost=false) {
  r.part('round',x,y+h*.5,z,.105,h,.105,ghost?0xb9cecb:0xffe6bb);
  r.part('orb',x,y+h+.075,z,.094,.18,.094,ghost?0xade6f2:0xffc466,'glow');
  r.part('halo',x,y+h+.08,z,.83,.83,1,ghost?0x9abff0:0xffffff,'halo');
}

function table(r,x,z,w,d,h=1.03) {
  r.box(x,h-.085,z,w,.17,d,oakLight);
  r.box(x,h-.20,z,w*.93,.13,d*.88,oak);
  for(const a of [-1,1]) for(const k of [-1,1])
    r.box(x+a*(w/2-.13),h*.43,z+k*(d/2-.13),.16,h*.86,.16,darkOak);
  r.solid(x,z,w,d,h);
}

function armchair(r,x,z,tint,back=1) {
  r.box(x,.47,z,1.4,.44,1.32,oak);
  r.box(x,.78,z,1.34,.32,1.26,tint);
  r.box(x,1.24,z+back*.56,1.43,1.15,.27,tint);
  for(const s of [-1,1]) {
    r.box(x+s*.65,.97,z,.25,.62,1.25,tint);
    r.box(x+s*.55,.18,z+.38,.18,.34,.18,darkOak);
  }
  r.solid(x,z,1.47,1.44,1.82);
}

function rack(r,x,z,w,style='books') {
  const depth=.69, height=style==='books'?3.85:2.62;
  r.box(x,height*.5,z+.22,w,height,.16,darkOak);
  for(const s of [-1,1]) r.box(x+s*(w-.14)/2,height*.5,z,.15,height,depth,oakLight);
  const levels=style==='books'?5:3;
  for(let row=0;row<levels;row++) {
    const y=.35+row*.71;
    r.box(x,y,z,w,.14,depth,oakLight);
    const n=Math.max(2,Math.floor((w-.45)/(style==='books'?.29:.49)));
    for(let i=0;i<n;i++) {
      const a=(i+.5)/n-.5, xx=x+a*(w-.4), hash=(row*17+i*13)%23;
      if(style==='books') {
        const h=.34+hash*.009;
        r.box(xx,y+.07+h/2,z-.055,.19+hash*.0018,h,.33,bookColors[(row*3+i)%bookColors.length]);
        if(i%3===0)r.box(xx,y+.16,z-.23,.17,.026,.014,bronze);
      } else {
        flask(r,xx,y+.08,z,.56+hash*.012);
      }
    }
  }
  r.box(x,height-.07,z,w+.12,.19,depth+.09,oakLight);
  r.solid(x,z,w,depth,height);
}

function flask(r,x,y,z,size=1) {
  const colors=[0x548d83,0x9678a6,0xd0a562,0x7499aa];
  const c=colors[Math.abs(Math.round(x*7+z*3))%colors.length];
  r.part('orb',x,y+.20*size,z,.36*size,.42*size,.36*size,c);
  r.part('round',x,y+.44*size,z,.14*size,.26*size,.14*size,c);
  r.part('round',x,y+.59*size,z,.16*size,.07*size,.16*size,oakLight);
}

function cauldron(r,x,y,z,size=1) {
  r.part('orb',x,y+.27*size,z,.89*size,.62*size,.89*size,iron);
  r.part('round',x,y+.53*size,z,.79*size,.10*size,.79*size,black);
  r.part('round',x,y+.59*size,z,.63*size,.024*size,.63*size,0x719e8c);
  for(const sign of [-1,1]) r.part('ring',x+sign*.42*size,y+.4*size,z,.23*size,.23*size,.23*size,bronze);
}

function goblet(r,x,y,z,scale=1) {
  r.part('round',x,y+.03*scale,z,.23*scale,.06*scale,.23*scale,bronze);
  r.part('round',x,y+.15*scale,z,.07*scale,.25*scale,.07*scale,bronze);
  r.part('orb',x,y+.35*scale,z,.30*scale,.30*scale,.30*scale,bronze);
  r.part('round',x,y+.47*scale,z,.26*scale,.03*scale,.26*scale,0xd3a868);
}

function hearth(r,x,z) {
  r.box(x,1.95,z,3.05,3.9,.56,stone,'masonry');
  r.box(x,.95,z-.31,2.48,1.85,.08,0x332d2b);
  r.box(x,2.12,z-.18,3.46,.26,.88,0xac9c82);
  for(const sign of [-1,1]) r.box(x+sign*1.33,1.03,z-.16,.32,1.98,.7,stone);
  for(let i=0;i<5;i++) {
    const h=.56+.12*(i%3);
    r.part('cone',x+(i-2)*.29,.28+h/2,z-.44,.46,h,.32,i%2?0xffb459:0xee7f35,'glow');
  }
  r.solid(x,z,3.43,.86,3.9);
}

function banner(r,x,z,house,y=4.65,w=1.65,h=3.12) {
  r.box(x,y+h*.50,z,w+.26,.105,.13,bronze);
  r.image('banner:'+house,houseColors[house],x,y,z-.09,w,h);
}

const underwaterWindow=floor=>floor.level<0?'window:lake':'window:sky';
function windows(r,count=3) {
  const {w,d,room,floor}=r;
  for(let i=0;i<count;i++) {
    const x=((i+.5)/count-.5)*(w-1.1);
    const underwater=floor.level<0;
    r.image(underwater?'window:lake':'window:sky',null,x,4.60,d-.189,Math.min(6.05,w/count-.3),4.75);
    r.box(x,2.24,d-.31,Math.min(3.35,(w/count)*.59),.22,.51,stone);
  }
  const gap=d/Math.max(2,Math.round(d/6));
  for(let z=gap*.55;z<d-.45;z+=gap) {
    for(const sign of [-1,1]) {
      const x=sign*(w/2-.26);
      r.box(x,2.8,z,.37,5.6,.62,stone);
      r.box(x,.27,z,.62,.50,.85,stone);
      r.box(x,5.53,z,.65,.38,.86,stone);
      const timber=room.kind==='hall',m=timber?oak:stone;
      r.beam(x,5.40,z,sign*w*.42,6.74,z,timber?.37:.30,m);
      r.beam(sign*w*.42,6.74,z,sign*w*.29,7.57,z,timber?.34:.26,m);
      if(timber){
        r.box(sign*w*.46,5.42,z,w*.08,.32,.34,oakLight);
        r.beam(x,4.46,z,sign*w*.424,5.52,z,.28,oakLight);
        r.part('cone',sign*w*.424,5.15,z,.34,.62,.34,bronze,'plain',0,0,Math.PI);
      }
      if(['foyer','hall','astronomy','library','common','hospital'].includes(room.kind)) {
        r.sideImage(underwaterWindow(floor),null,sign,3.95,z+gap*.43,Math.min(5.85,gap*1.03),4.33);
        r.box(sign*(w*.5-.27),1.83,z+gap*.43,.47,.18,Math.min(3.12,gap*.58),stone);
      }
      if(room.kind==='foyer'){
        r.beam(sign*w*.29,7.52,z,0,7.75,z+gap*.45,.22,0xbaab93);
        r.beam(sign*w*.29,7.52,z,0,7.75,z-gap*.45,.22,0xbaab93);
        r.part('orb',0,7.71,z+gap*.45,.38,.30,.38,bronze);
      }
    }
  }
}

function feast(r) {
  const {w,d,room}=r, ghost=room.id==='deathday';
  const tableCount=room.kind==='hall'&& !ghost?4:2;
  const lanes=(w-2.3)/tableCount, length=d-12.2;
  for(let lane=0;lane<tableCount;lane++) {
    const x=(lane+.5-tableCount/2)*lanes,z=5+length/2,tw=Math.min(1.65,lanes*.33);
    table(r,x,z,tw,length);
    for(const sign of [-1,1]) {
      const bx=x+sign*(tw/2+.52);
      r.box(bx,.5,z,.44,.23,length-.65,oak);
      for(const zz of [z-length*.42,z,z+length*.42]) r.box(bx,.22,zz,.39,.44,.35,darkOak);
      r.solid(bx,z,.44,length-.65,.64);
    }
    for(let i=0;i<Math.floor(length/1.9);i++) {
      const zz=5.9+i*1.9,sgn=i%2?1:-1;
      r.part('round',x+sgn*tw*.23,1.066,zz,.38,.045,.38,0xe1d5b7); goblet(r,x-sgn*tw*.2,1.04,zz,.79);
      candle(r,x+Math.sin(i*6.38+lane)*.65,4.05+((i*7+lane*3)%11)*.17,zz,.35+(i%4)*.09,ghost);
    }
    if(!ghost)banner(r,x,d-.38,houses[lane],5.1,2,3.2);
  }
  const tw=w*.74; table(r,0,d-2.5,tw,1.28,1.23);
  for(let i=0;i<9;i++){
    const x=(i-4)*tw/10,c=ghost?0x65777d:houses[i%4];
    goblet(r,x,1.24,d-2.65,.83);
    const z=d-1.25,h=i===4?2.74:2.06;
    r.box(x,.62,z,1.15,.30,.91,oak);
    r.box(x,h*.57,z+.46,1.16,h*.85,.18,darkOak);
    r.box(x,h*.62,z+.35,.89,h*.64,.075,ghost?c:houseColors[c][0]);
    for(const side of [-1,1]){
      r.part('round',x+side*.56,h/2,z+.42,.10,h,.10,oakLight);
      r.part('cone',x+side*.56,h+.15,z+.42,.19,.31,.19,bronze);
    }
    r.solid(x,z,1.25,1.04,h+.30);
  }
  for(let i=0;i<72;i++) {
    const x=(((i*37)%73)/73-.5)*(w-1),z=1+((i*29)%73)/73*(d-2);
    r.part('orb',x,7.78,z,.044+(i%4)*.024,.035,.044,0xffefd1,'glow');
  }
}

function commonRoom(r) {
  const {room,w,d}=r,house=houses.find(h=>room.id.startsWith(h)),tint=house?houseColors[house][0]:0x6c5947;
  hearth(r,0,d-.65);
  if(house) {
    for(const sign of [-1,1])banner(r,sign*w*.30,d-.42,house,4.9);
  }
  const n=Math.max(2,Math.floor(d/8));
  for(const sign of [-1,1])for(let i=0;i<n;i++) {
    const x=sign*w*.27,z=5+i*(d-10)/Math.max(1,n-1);
    armchair(r,x,z,tint,i%2?1:-1);
    r.part('round',x,z===5?.026:.027,z,2.62,.04,2.53,house?houseColors[house][1]:0x845d49);
  }
  rack(r,-w*.3,d-1.05,Math.min(3.25,w*.24));
  if(house==='hufflepuff')for(let i=0;i<3;i++) barrel(r,w*.38,4.5+i*1.5);
}

function beds(r,medical=false) {
  const {w,d,room}=r,house=houses.find(h=>room.id.startsWith(h)) || 'gryffindor';
  const col=Math.min(w*.31,w*.5-1.25),count=room.id==='gryffindor-boys'?5:Math.max(2,Math.floor(d/8)*2);
  const rows=Math.ceil(count/2),spread=(d-8)/Math.max(1,rows-1);
  for(let i=0;i<count;i++) {
    const x=(i%2?1:-1)*col,z=4.2+Math.floor(i/2)*spread, cloth=medical?0xf1e8d4:houseColors[house][0];
    r.box(x,.58,z,1.8,.62,2.85,medical?iron:oak); r.box(x,.97,z,1.73,.26,2.76,parchment);
    r.box(x,1.14,z-.36,1.75,.11,1.93,cloth);
    r.part('orb',x,1.14,z+.92,1.17,.3,.55,0xf1e6cf); r.solid(x,z,1.85,2.92,medical?1.18:2.94);
    for(const sign of [-1,1])for(const end of [-1,1]) {
      const h=medical?1.35:2.91;
      r.part('round',x+sign*.86,h/2,z+end*1.39,.105,h,.105,medical?iron:oak);
      if(!medical) r.box(x+sign*.74,1.89,z+end*1.22,.28,1.85,.39,cloth);
    }
    if(!medical)r.box(x,2.88,z,1.95,.17,3.02,cloth);
    if(medical)r.box(x,1.10,z+1.35,1.69,.58,.12,0xc7cbc0);
  }
}

function deskRoom(r) {
  const {w,d,room}=r;
  const office=room.kind==='office',defense=room.kind==='defense',empty=room.id==='empty';
  const boardColor=room.id==='umbridge'?0xa47980:0x374748;
  r.box(0,3.19,d-.30,Math.min(w*.55,5),2.1,.15,oakLight);
  r.box(0,3.19,d-.4,Math.min(w*.55,5)-.17,1.92,.085,boardColor);
  if(!office) {
    for(let i=0;i<5;i++)r.box(-.46+Math.sin(i)*.51,3.73-i*.23,d-.454,.95+(i%3)*.36,.026,.01,0xcbd0ac);
  }
  const rows=(office||empty)?1:Math.max(2,Math.floor((d-6)/5));
  for(const sign of [-1,1])for(let i=0;i<rows;i++) {
    const x=sign*Math.min(w*.28,w*.5-1.1),z=office?d-3.05:4.5+i*(d-10)/Math.max(1,rows-1);
    const tw=Math.max(1.3,Math.min(w*.31,3.4));
    table(r,x,z,tw,1.32);
    if(office) {
      armchair(r,x,z+1.65,room.id==='umbridge'?0xcb899a:0x6b4b3f);
      candle(r,x+.39,1.04,z,.51);
    } else {
      r.box(x,.49,z+1.05,tw*.73,.2,.48,oak); r.solid(x,z+1.05,tw*.73,.49,.6);
    }
    r.box(x-.23,1.07,z,.54,.08,.39,room.id==='ancient-runes'?stone:parchment);
    if(room.kind==='potions'||room.id==='snape') {
      cauldron(r,x+.60,1.03,z,.86); flask(r,x-.62,1.04,z,.9);
    } else if(room.id==='charms') {
      r.part('cone',x+.44,1.28,z,.09,.48,.09,parchment);
    } else if(room.id==='muggle-studies'){
      r.box(x+.42,1.28,z,.62,.43,.32,0x575e5a);r.part('round',x+.6,1.26,z-.17,.08,.06,.08,bronze);
    } else if(room.id==='transfiguration'){
      r.part('orb',x+.53,1.16,z,.27,.24,.46,0x9b9286);
      r.part('orb',x+.53,1.27,z-.18,.20,.18,.18,0xab9e93);
    }
  }
  if(!empty)rack(r,-w*.28,d-1,Math.min(w*.31,3.7),room.kind==='potions'||room.id==='snape'?'potions':'books');
  if(defense) cabinet(r,w*.31,d-1.37,Math.min(w*.25,2.55));
  if(room.id==='umbridge') {
    for(let i=0;i<7;i++) {
      const x=(i-3)*w*.105,y=5.14+Math.sin(i*.9)*.4;
      r.part('round',x,y,d-.27,.97,.055,.97,0xf0dbd0,'plain',Math.PI/2);
      r.part('orb',x,y,d-.32,.34,.30,.055,0xad817d);
    }
  }
}
function cabinet(r,x,z,w) {
  r.box(x,1.65,z,w,3.3,1.0,darkOak);
  for(const sign of [-1,1]){
    r.box(x+sign*w*.235,1.65,z-.52,w*.45,2.98,.1,oakLight);
    r.part('orb',x+sign*.13,1.56,z-.60,.09,.09,.09,bronze);
  }
  r.box(x,3.35,z,w+.18,.17,1.15,oakLight);r.solid(x,z,w+.16,1.14,3.44);
}
function barrel(r,x,z) {
  r.part('round',x,.68,z,1.02,1.36,1.02,oakLight);
  for(const y of [.2,.71,1.13])r.part('round',x,y,z,1.05,.084,1.05,iron);
  r.solid(x,z,1.03,1.03,1.37);
}

function library(r) {
  const {w,d,room}=r;
  for(const sign of [-1,1]) {
    const tw=Math.min(5.2,w*.38);
    for(let z=4.2;z<d-2;z+=4.2)rack(r,sign*w*.27,z,tw,room.kind==='pantry'?'potions':'books');
  }
  if(room.id==='restricted')for(const sign of [-1,1]) {
    const x=sign*(w/2-1.7);
    for(let i=0;i<4;i++)r.part('round',x+(i-1.5)*.46,1.39,2,.07,2.78,.07,iron);
    r.box(x,2.64,2,1.7,.1,.1,iron);r.solid(x,2,1.75,.16,2.78);
  }
}

function washroom(r) {
  const {w,d,room}=r;
  if(room.id==='prefects') {
    const bw=w*.66,bd=d*.59,z=d*.52,rim=.33;
    r.box(0,.16,z,bw,.32,bd,0xb7b2a6);
    r.box(0,.34,z,bw-.44,.03,bd-.44,0x5e999b);
    for(const sign of [-1,1]){
      r.box(sign*(bw-rim)/2,.42,z,rim,.84,bd,0xdacfb4);
      r.box(0,.42,z+sign*(bd-rim)/2,bw-.66,.84,rim,0xdacfb4);
      for(let i=0;i<6;i++){
        const xx=(i-2.5)*bw*.145,zz=z+sign*(bd/2-.27);
        r.part('round',xx,.94,zz,.115,.40,.115,bronze);
        r.part('orb',xx,1.16,zz,.20,.14,.20,bookColors[i%bookColors.length]);
        r.beam(xx,1.06,zz,xx,1.06,zz-sign*.3,.077,bronze);
      }
    }
    for(let i=0;i<11;i++)r.part('orb',Math.sin(i*.93)*bw*.33,.37,z+Math.cos(i*2.2)*bd*.38,.35+(i%3)*.24,.055,.36,0xd0e3d7);
    r.solid(0,z,bw,bd,.84);
    return;
  }
  for(const sign of [-1,1])for(let i=0;i<3;i++) {
    const x=sign*w*.31,z=4.5+i*(d-9)/2;
    r.part('round',x,.51,z,.48,1.02,.48,stone);r.part('orb',x,1.09,z,1.27,.38,.88,0xd4cebc);
    r.part('round',x,1.23,z,.87,.041,.62,0x94a9a4);r.beam(x,1.23,z+.36,x,1.49,z+.36,.07,bronze);
    r.solid(x,z,1.27,.88,1.5);
  }
}

function telescope(r,x,z,scale=1) {
  for(let i=0;i<3;i++) {
    const a=i*2*Math.PI/3;
    r.beam(x+.73*scale*Math.cos(a),.06,z+.73*scale*Math.sin(a),x,1.48*scale,z,.12,oakLight);
  }
  r.beam(x-.64*scale,1.37*scale,z-.44*scale,x+.85*scale,2.38*scale,z+.53*scale,.28,bronze);
  r.part('orb',x+.84*scale,2.37*scale,z+.55*scale,.29,.27,.29,0x91adb4);
  r.solid(x,z,1.5*scale,1.5*scale,2.45*scale);
}
function astronomy(r) {
  const {w,d}=r;
  for(const sign of [-1,1]){
    telescope(r,sign*w*.28,d*.34,1.08);telescope(r,sign*w*.28,d*.71,1.28);
  }
  r.image('window:sky',null,0,4.65,d-.23,9.1,5.75);
  for(let i=0;i<50;i++)r.part('orb',(((i*17)%61)/61-.5)*(w-1),7.77,1+((i*23)%51)/51*(d-2),.06,.04,.06,0xf6e4bb,'glow');
}
function divination(r) {
  for(const sign of [-1,1])for(let i=0;i<3;i++) {
    const x=sign*r.w*.28,z=4.7+i*(r.d-9.5)/2;
    r.part('round',x,.7,z,2.08,.20,2.08,0x944f59);
    r.part('round',x,.35,z,.41,.7,.41,oak);
    r.part('round',x,.84,z,.51,.11,.51,bronze);r.part('orb',x,1.13,z,.59,.59,.59,0xa0c0cf);
    r.part('orb',x-.39,.88,z-.32,.27,.20,.27,parchment);r.solid(x,z,2.1,2.1,1.43);
  }
}
function kitchen(r) {
  const {w,d}=r;
  for(const sign of [-1,1]) {
    const x=sign*w*.29,len=d*.48;
    table(r,x,d*.44,Math.min(w*.24,3.2),len);
    for(let i=0;i<6;i++) {
      const zz=d*.44+(i-2.5)*len/6;
      if(i%2)cauldron(r,x,1.04,zz);
      else r.part('orb',x,1.2,zz,.8,.32,.45,0xc48a4e);
    }
    hearth(r,sign*w*.28,d-.78);barrel(r,sign*(w*.5-1.0),2.4);
  }
}
function storeroom(r) {
  const {w,d,room}=r;
  if(room.id==='brooms'){
    for(const sign of [-1,1]) for(let i=0;i<6;i++){
      const x=sign*(w/2-1.15),z=3.5+i*(d-7)/5;
      r.beam(x,.16,z,x+sign*.43,2.75,z,.083,oakLight);
      r.part('cone',x,.48,z,.51,.91,.42,0x9c7950);r.solid(x,z,.62,.57,2.8);
    }
  } else for(const sign of [-1,1]) for(let i=0;i<3;i++) {
    const x=sign*w*.31,z=4+i*(d-8)/2;
    if(i===1) cabinet(r,x,z,2.45);
    else {
      r.box(x,.60,z,2.01,1.2,1.33,oakLight);r.box(x,1.18,z,2.12,.14,1.42,oak);
      r.box(x+.28,1.64,z,1.25,.82,.99,darkOak);r.solid(x,z,2.12,1.42,2.05);
    }
  }
}

function armor(r,x,z) {
  r.box(x,.18,z,1.05,.36,.91,stone);
  for(const side of [-1,1]) {
    r.part('round',x+side*.19,.72,z,.23,.73,.26,iron);
    r.part('orb',x+side*.42,1.74,z,.34,.32,.41,0x79828a);
    r.part('round',x+side*.45,1.38,z,.17,.59,.21,iron);
  }
  r.part('orb',x,1.48,z,.78,.84,.48,0x838c90);
  r.part('orb',x,2.04,z,.48,.55,.45,0x9d9e97);
  r.box(x,2.06,z-.21,.37,.075,.05,black);
  r.part('cone',x,2.38,z,.40,.25,.38,0x989b94);
  r.part('orb',x+.015,2.54,z+.055,.13,.30,.24,0x823e42,'plain',.4);
  r.part('round',x,1.24,z,.65,.14,.52,bronze);r.box(x,1.24,z-.265,.16,.10,.055,0xc5ad79);
  r.part('orb',x-.41,1.36,z-.16,.59,.79,.14,0x43525b);
  r.box(x-.41,1.36,z-.24,.07,.62,.035,bronze);
  r.box(x-.41,1.48,z-.24,.40,.062,.035,bronze);
  for(const side of [-1,1])r.part('orb',x+side*.19,.70,z-.12,.27,.24,.14,0x9b9c94);
  r.beam(x+.6,.38,z-.11,x+.6,2.33,z-.11,.055,bronze);
  r.solid(x,z,1.11,.92,2.4);
}

function mirror(r,x,z) {
  r.box(x,2.36,z,2.31,4.56,.28,bronze);
  r.box(x,2.38,z-.16,1.99,4.12,.075,0x829fa7);
  r.box(x,2.37,z-.21,1.79,3.91,.03,0x98adb0);
  for(const sign of [-1,1]){
    r.box(x+sign*1.13,.30,z-.08,.25,.60,.66,oakLight);
    r.part('cone',x+sign*1.04,4.87,z,.33,.66,.33,bronze);
  }
  r.part('cone',x,5.01,z,1.33,1,.31,bronze);
  r.solid(x,z,2.36,.69,5.5);
}

function gallery(r) {
  const {w,d,room}=r, portraits=['portraits','fat-lady','lockhart'].includes(room.id);
  if(room.id==='mirror-class')mirror(r,0,d-1.52);
  else if(room.id==='one-eyed'||room.id==='ravenclaw-gallery') {
    statue(r,0,d-1.87);
  } else if(portraits){
    for(let i=0;i<5;i++) {
      const x=(i-2)*(w-2)/5,h=i%2?2.24:2.74;
      r.image('portrait:'+(i%3),null,x,3.85-(i%2)*.8,d-.37,Math.min(3.18,w*.16),h);
    }
  } else if(room.id==='sorting'){
    r.box(-w*.23,.59,d*.63,.97,.20,.89,oak);
    for(const sign of [-1,1])r.box(-w*.23+sign*.35,.29,d*.63,.13,.58,.72,oak);
    r.part('round',-w*.23,.75,d*.63,.97,.08,.9,darkOak);
    r.part('cone',-w*.23,.99,d*.63,.67,.55,.63,oakLight,'plain',0,0,-.21);
    r.solid(-w*.23,d*.63,1.04,.98,1.43);
  }
  for(const sign of [-1,1]){
    if(room.id==='armor'||room.id==='tower-landing') {
      for(let i=0;i<3;i++)armor(r,sign*w*.31,3.5+i*(d-7)/2);
    } else {
      const x=sign*w*.34;
      r.box(x,.50,d*.47,.79,.22,3.05,oakLight);
      for(const s of [-1,1])r.box(x,.22,d*.47+s*1.14,.59,.42,.28,oak);
      r.solid(x,d*.47,.80,3.05,.63);
    }
  }
}
function statue(r,x,z) {
  r.box(x,.48,z,2.3,.96,1.76,stone,'masonry');
  r.part('cone',x,2.20,z,1.55,2.85,1.02,0x9eacaa);
  r.part('orb',x,3.7,z,.74,.96,.75,0xb2b9b0);
  r.part('orb',x,3.71,z-.33,.21,.24,.24,0xa7b2a9);
  r.solid(x,z,2.34,1.79,4.25);
}
function chamber(r) {
  const {room,w,d}=r;
  if(room.id==='mirror'||room.id==='secret-mirror')mirror(r,0,d-1.35);
  else if(room.id==='chamber'){
    statue(r,0,d-1.32);
    for(const side of [-1,1])for(let i=0;i<4;i++) {
      const x=side*w*.29,z=6+i*(d-12)/3;
      r.part('round',x,.22,z,1.65,.44,1.65,0x667e74);
      let px=x,py=.38,pz=z;
      for(let j=1;j<=5;j++) {
        const nx=x+Math.sin(j*1.12)*.39,ny=.38+j*.32,nz=z+Math.cos(j*1.12)*.29;
        r.beam(px,py,pz,nx,ny,nz,.33,0x6e8777);px=nx;py=ny;pz=nz;
      }
      r.part('orb',px,py,pz-.23,.44,.28,.57,0x7d9384);r.solid(x,z,1.68,1.68,2.34);
    }
  } else if(room.id==='keys'){
    for(let i=0;i<34;i++){
      const x=(((i*23)%37)/37-.5)*(w-2),z=2+((i*17)%37)/37*(d-4),y=3.82+(i%7)*.32;
      r.part('ring',x,y,z,.29,.29,.29,bronze);
      r.box(x,y-.26,z,.055,.31,.055,bronze);
      for(const sign of [-1,1])r.part('orb',x+sign*.19,y+.15,z,.30,.105,.06,parchment,'plain',0,0,sign*.48);
    }
  } else if(room.id==='forbidden') {
    const z=d-4;
    r.box(0,.028,z,2.34,.056,2.48,oak);r.box(-.64,.069,z,.18,.04,2.42,iron);
    r.box(.64,.069,z,.18,.04,2.42,iron);
  }
}
function chess(r) {
  const side=Math.min(r.w-3,r.d-4,17),tile=side/8,cz=r.d*.5;
  for(let row=0;row<8;row++)for(let col=0;col<8;col++) {
    const x=(col-3.5)*tile,z=cz+(row-3.5)*tile;
    r.box(x,.039,z,tile-.012,.078,tile-.012,(row+col)%2?0x4b4f54:0xd9d2b7);
    if(![0,1,6,7].includes(row)||(col===3||col===4))continue;
    const tint=row>3?0x655f65:0xd4cbb2, h=(row===1||row===6)?1.05:1.58;
    r.part('round',x,.20,z,.77,.24,.77,tint);r.part('cone',x,.37+h*.26,z,.54,h*.64,.54,tint);
    if((row===0||row===7)&&(col===0||col===7)){
      r.part('round',x,1.12,z,.55,.46,.55,tint);
      for(const k of [-1,1])r.box(x+k*.18,1.43,z,.14,.19,.33,tint);
    }else r.part('orb',x,.38+h*.60,z,.4,.49,.4,tint);
    r.solid(x,z,.80,.80,h+.1);
  }
}
function trophies(r) {
  for(const sign of [-1,1])for(let i=0;i<3;i++){
    const x=sign*r.w*.28,z=4+i*(r.d-8)/2,w=Math.min(3.43,r.w*.31);
    r.box(x,.68,z,w,1.36,1.03,oak); r.box(x,1.38,z,w+.1,.10,1.11,bronze);
    for(let j=-1;j<=1;j++)goblet(r,x+j*w*.27,1.44,z,(r.room.id==='cup-room'&&i===1&&j===0)?2.45:1.45+(j+1)*.18);
    r.solid(x,z,w+.1,1.13,2.54);
  }
}
function practice(r) {
  for(const sign of [-1,1])for(let i=0;i<3;i++){
    const x=sign*r.w*.28,z=4.8+i*(r.d-10)/2;
    r.part('round',x,.12,z,.95,.24,.95,oakLight);r.part('round',x,.92,z,.12,1.65,.12,oak);
    r.part('orb',x,1.59,z,.76,.90,.43,0xa88963);r.part('orb',x,2.21,z,.44,.45,.40,parchment);
    r.beam(x-.63,1.67,z,x+.63,1.67,z,.12,oak);
    r.solid(x,z,1.31,.96,2.44);
  }
}
function owlery(r) {
  for(const sign of [-1,1])for(let i=0;i<3;i++){
    const x=sign*r.w*.30,z=4.4+i*(r.d-9)/2;
    r.box(x,.14,z,1.05,.28,.93,oak);r.part('round',x,1.45,z,.15,2.89,.15,oakLight);
    r.box(x,2.74,z,2.01,.15,.19,oakLight);
    for(const side of [-1,1]) {
      const xx=x+side*.53,c=(i+side)%2?0xc4b79c:0x96816c;
      r.part('orb',xx,3.04,z,.37,.56,.36,c);r.part('orb',xx,3.32,z,.36,.33,.32,c);
      for(const s of [-1,1])r.part('orb',xx+s*.082,3.35,z-.13,.09,.10,.055,0xebc88a);
    }
    r.solid(x,z,1.05,.94,2.9);
  }
}
function garden(r) {
  for(const sign of [-1,1])for(let i=0;i<5;i++){
    const x=sign*r.w*.3,z=3+i*(r.d-6)/4;
    let px=x,py=.10,pz=z;
    for(let j=0;j<7;j++){
      const nx=x+Math.sin(j*1.41+i)*.73,ny=.12+j*.24,nz=z+Math.cos(j*1.4)*.72;
      r.beam(px,py,pz,nx,ny,nz,.16,0x3c5345);
      r.part('orb',nx+.13,ny+.11,nz,.48,.20,.26,0x537157,'plain',0,.4,.4);
      px=nx;py=ny;pz=nz;
    }
    r.solid(x,z,1.55,1.55,1.72);
  }
}
function foyer(r) {
  const {w,d}=r;
  for(const sign of [-1,1]) {
    // The oak doors mark the real lake-bridge exit.
    r.box(sign*1.14,2.22,d-.23,2.23,4.44,.13,darkOak);
    for(let i=0;i<5;i++)r.box(sign*(.27+i*.42),2.24,d-.32,.38,4.26,.105,oak);
    for(const y of [.82,3.40])r.box(sign*1.13,y,d-.39,2.13,.13,.09,iron);
    r.part('ring',sign*.36,1.66,d-.43,.30,.30,.30,bronze);
    const fx=sign*(w/2-1.3);
    armor(r,fx,2.6);armor(r,fx,d-2.8);
    // Geometric shafts and pendant pennants flank the view towards the grand staircase.
    for(let i=0;i<2;i++) {
      const x=sign*(w*.26+i*w*.13),house=houses[(sign<0?0:2)+i];
      const by=4.55,bh=3.25;
      r.box(x,by+bh*.5,.37,1.84,.11,.18,bronze);
      r.b.image('banner:'+house,houseColors[house],r.mid+x,by,r.room.doorZ+.42,1.65,bh,1);
    }
  }
  // A bronze crest and iron-bound oak leafs remain visible from the lake side.
  r.box(0,4.62,d-.23,4.80,.30,.32,stone);
  r.box(0,.025,d*.50,2.6,.05,d-.58,0x7d4140);
  for(const sign of [-1,1])r.box(sign*1.17,.056,d*.50,.052,.015,d-.8,bronze);
  const cy=5.8,cz=d*.44;
  r.part('ring',0,cy,cz,2.52,2.52,2.52,bronze,'plain',Math.PI/2);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    candle(r,Math.cos(a)*1.06,cy+.035,cz+Math.sin(a)*1.06,.39);
    if(i%2===0)r.beam(Math.cos(a)*1.0,cy,cz+Math.sin(a)*1.0,0,7.6,cz,.05,iron);
  }
}

function headmaster(r) {
  const {w,d}=r;
  const x=0,z=d*.72;
  table(r,x,z,5.4,1.68,1.22);armchair(r,x,z+1.72,0x7c4852);
  r.box(x-.5,1.28,z,.89,.09,.58,parchment);
  for(let i=0;i<4;i++) {
    const xx=x+1.42+i*.23;
    r.part('round',xx,1.28,z+.15,.21,.1,.21,bronze);
    r.part('ring',xx,1.57+i*.10,z+.15,.41,.41,.41,0xb7b8b2,'plain',0,.25*i);
  }
  rack(r,-w*.32,d-1,Math.min(5,w*.29));rack(r,w*.32,d-1,Math.min(5,w*.29));
  const px=-w*.29,pz=d*.40;
  r.part('round',px,.68,pz,.85,1.36,.85,stone);r.part('orb',px,1.56,pz,1.78,.61,1.78,stone);
  r.part('round',px,1.78,pz,1.38,.03,1.38,0xa5d3da,'glow');r.solid(px,pz,1.8,1.8,1.81);
  const fx=w*.30,fz=d*.45;
  r.part('round',fx,.09,fz,.89,.18,.89,bronze);r.part('round',fx,1.12,fz,.11,2.25,.11,bronze);
  r.box(fx,2.21,fz,1.72,.12,.17,bronze);
  r.part('orb',fx,2.70,fz,.42,.78,.45,0xb54a37,'plain',.12);
  r.part('orb',fx,3.10,fz-.08,.34,.35,.34,0xe5954f);
  r.part('cone',fx,3.22,fz,.18,.46,.16,0xc87941,'plain',.6);
  for(const side of [-1,1]){
    r.part('orb',fx+side*.22,2.65,fz+.06,.17,.60,.36,0xcb673a,'plain',.3,0,side*.17);
    r.part('orb',fx+side*.10,2.07,fz+.34,.17,1.1,.26,0xde9952,'plain',-.69,0,side*.11);
  }
  r.solid(fx,fz,1.72,.87,3.43);
  for(let i=0;i<7;i++)r.image('portrait:'+(i%3),null,(i-3)*w*.129,5.45+Math.sin(i)*.44,d-.24,2.12,2.55);
}
function potionRiddle(r) {
  const z=r.d*.69;
  table(r,0,z,5.8,1.30);
  const measures=[.82,.61,1.07,.49,.87,.58,.98];
  for(let i=0;i<7;i++)flask(r,(i-3)*.67,1.04,z,measures[i]*1.4);
  r.box(-2.32,1.08,z,.56,.06,.49,parchment);
  for(const sign of [-1,1])for(let i=0;i<7;i++) {
    const xx=sign*(r.w*.25+i*.39);
    r.part('cone',xx,.59,r.d-.52,.48,.97,.30,sign<0?0x947ed3:0xd98c50,'glow');
  }
}
function secretSink(r) {
  const z=r.d-3.05;
  r.part('round',0,.58,z,.67,1.16,.67,0xa7ada5);
  r.part('orb',0,1.28,z,1.65,.45,1.14,0xc6c9bc);
  r.part('round',0,1.46,z,1.23,.028,.82,0x728e89);
  r.beam(0,1.4,z+.45,.11,1.72,z+.36,.10,bronze);
  r.part('orb',.10,1.73,z+.25,.17,.12,.22,0x7c9b81);
  r.solid(0,z,1.65,1.16,1.8);
}
const furnish={
  hall:feast,foyer,common:commonRoom,dorm:r=>beds(r),hospital:r=>beds(r,true),
  office:deskRoom,classroom:deskRoom,defense:deskRoom,potions:deskRoom,library,archive:library,pantry:library,
  kitchen,bath:washroom,astronomy,divination,store:storeroom,gallery,chamber,chess,trophies,requirement:practice,owlery,garden,
};

export function furnishCastleRoom(batch,room,floor,solids) {
  const r=prepareRoom(batch,room,floor,solids);
  // All scaled furnishings fit even in the narrow upper-tower rooms.
  windows(r,room.kind==='foyer'?2:Math.max(2,Math.min(5,Math.round(r.w/7))));
  if(room.id==='dumbledore')headmaster(r);
  else if(room.id==='riddle')potionRiddle(r);
  else furnish[room.kind]?.(r);
  if(room.id==='myrtle')secretSink(r);
  if(room.id==='cup-room'){
    const x=r.w*.29,z=r.d-3.2;
    r.part('round',x,.59,z,.90,1.18,.90,stone);goblet(r,x,1.2,z,3.42);
    for(let i=0;i<4;i++)r.part('cone',x+Math.sin(i)*.16,3.05+i*.04,z+Math.cos(i)*.12,.31,.79,.3,0x8fd0ef,'glow');
    r.solid(x,z,1.14,1.14,3.62);
  }
}
