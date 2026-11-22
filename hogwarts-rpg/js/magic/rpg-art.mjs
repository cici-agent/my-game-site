// Painted at a constant height. Long backgrounds extend into panoramic cards.
const DARK = '#102a28', INK = '#102725', GOLD = '#d6af6c', PAPER = '#ecdeb1';
const sceneImages = { 'intro-3': 'station', 'kings-cross': 'station', platform: 'platform', express: 'train' };
const imageCache = new Map();
const tau = Math.PI * 2;

function rect(c, x, y, w, h, color) {
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
function line(c, points, color, width = 1) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function poly(c, points, color, edge, width = 1) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath(); c.fillStyle = color; c.fill();
  if (edge) { c.strokeStyle = edge; c.lineWidth = width; c.stroke(); }
}
function oval(c, x, y, rx, ry, color, edge, width = 1) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, tau);
  if (color) { c.fillStyle = color; c.fill(); }
  if (edge) { c.strokeStyle = edge; c.lineWidth = width; c.stroke(); }
}
function path(c, commands, fill, stroke, w = 1) {
  const p = new Path2D(commands);
  if (fill) { c.fillStyle = fill; c.fill(p); }
  if (stroke) { c.lineWidth = w; c.strokeStyle = stroke; c.stroke(p); }
}
function gradient(c, y, y2, colors) {
  const g = c.createLinearGradient(0, y, 0, y2);
  colors.forEach((color,i) => g.addColorStop(i / (colors.length - 1), color));
  return g;
}
function sky(c, ...colors) { rect(c,-1800,-100,4600,740,gradient(c,0,500,colors)); }
function halo(c,x,y,r,rgb,a=.35) {
  const g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,'rgba('+rgb+','+a+')'); g.addColorStop(1,'rgba('+rgb+',0)');
  rect(c,x-r,y-r,r*2,r*2,g);
}
function seeded(seed) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
}
function lamp(c,x,y,s=1) {
  c.save(); c.translate(x,y); c.scale(s,s);
  halo(c,0,-48,73,'255,204,112',.25);
  rect(c,-3,-20,6,121,INK); rect(c,-7,88,14,15,INK);
  poly(c,[-14,-54,14,-54,9,-28,-9,-28],PAPER,INK,3);
  poly(c,[-20,-57,0,-71,20,-57],INK); line(c,[0,-54,0,-29],INK,2);
  c.restore();
}
function clock(c,x,y,r) {
  rect(c,x-3,y-r-80,6,85,DARK);
  oval(c,x+1,y+3,r+6,r+6,INK,GOLD,1.4); oval(c,x,y,r,r,PAPER,'#736644',2);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    line(c,[x+Math.sin(a)*r*.78,y-Math.cos(a)*r*.78,x+Math.sin(a)*r*.91,y-Math.cos(a)*r*.91],DARK,i%3===0?3:1.5);
  }
  line(c,[x-r*.44,y+r*.21,x,y,x+r*.08,y-r*.69],INK,3.5);
  oval(c,x,y,2.5,2.5,INK);
}
function person(c,x,y,s=1,coat='#233e38') {
  c.save(); c.translate(x,y); c.scale(s,s);
  oval(c,0,-46,5,6.5,coat);
  path(c,'M-5 -39 Q0 -42 6 -38 L10 -13 5 -12 5 0 1 0 -1 -12 -3 0 -7 0 -6 -13 -11 -13 Z',coat);
  c.restore();
}
function suitcase(c,x,y,w,h,col='#875837') {
  rect(c,x+w*.35,y-5,w*.3,6,INK); rect(c,x,y,w,h,col);
  for(const at of [.18,.77]){rect(c,x+w*at,y,w*.045,h,'#c09a61');rect(c,x+w*at-1,y+h*.32,w*.045+2,4,PAPER);}
  line(c,[x,y+2,x+w,y+2],GOLD,1.3);
}
function girder(c,x,far=0) {
  const y=150+far;
  path(c,'M '+(x-12)+' 540 L '+(x-12)+' '+y+' Q '+(x-10)+' 28 '+(x+148)+' -34 L '+(x+162)+' -34 Q '+(x+10)+' 35 '+(x+9)+' '+(y+15)+' L '+(x+9)+' 540 Z', '#223b33');
  path(c,'M '+(x+2)+' '+(y-8)+' Q '+(x+3)+' 55 '+(x+123)+' -13',null,'#989773',2);
}
function railRoof(c) {
  for(let i=-9;i<18;i++){
    const x=i*134;
    line(c,[x,-30,660+(x-400)*.26,180],'#4c6354',3.5);
    line(c,[x+55,-8,660+(x-320)*.28,170],'#a6a780',1);
  }
  for(let i=0;i<4;i++) line(c,[-1200,20+i*37,2150,34+i*33],'#62745f',2);
  for(const x of [-790,-415,-40,340,730,1095,1460]) {
    path(c,'M '+x+' 145 Q '+(x+124)+' -46 '+(x+308)+' -25',null,'#334e41',8);
    path(c,'M '+x+' 153 Q '+(x+126)+' -32 '+(x+309)+' -19',null,'#c3aa71',1.3);
  }
}
function locomotive(c) {
  // Perspective is anchored on the smokebox door. Carriages recede toward the right.
  for(const [x1,y1,x2,y2] of [[668,220,802,207],[792,209,902,202],[897,202,994,197]]) {
    const h=(1002-x1)*.24+14;
    poly(c,[x1,y1,x2,y2,x2,y2+h*.65,x1,y1+h], '#702f2a',INK,3);
    poly(c,[x1-4,y1,x1+5,y1-10,x2,y2-5,x2+4,y2+1], '#1d302b');
    for(let j=0;j<7;j++){
      const q=(j+.15)/7,xx=x1+(x2-x1)*q,yy=y1+(y2-y1)*q;
      rect(c,xx+2,yy+6,(x2-x1)/9,h*.29*(1-q*.3),j%3===0?'#d5a765':'#a67f54');
    }
    line(c,[x1,y1+h*.67,x2,y2+h*.48],'#d8a25d',2);
  }
  poly(c,[395,303,686,254,695,306,418,390,357,369],'#192d27','#151e1c',3);
  const wheels=[[427,354,38],[480,346,41],[550,328,33],[615,311,24],[667,300,18]];
  for(const [x,y,r] of wheels){
    oval(c,x,y,r*.68,r,'#202922','#b29570',3);oval(c,x,y,r*.52,r*.80,'#763c30');
    for(let i=0;i<9;i++){const a=tau*i/9;line(c,[x,y,x+Math.cos(a)*r*.48,y+Math.sin(a)*r*.73],'#b58e5e',1.7);}
    oval(c,x,y,4,4,'#ceaa73');
  }
  line(c,[426,359,482,351,549,332,615,316],'#d2b388',5);
  poly(c,[592,215,625,206,672,214,674,275,617,299,596,271],'#954736','#2e3228',3);
  poly(c,[601,219,624,213,625,235,602,242], '#243a32','#c0985f',2);
  poly(c,[635,213,656,215,656,236,635,240], '#deb26d',INK,2);
  poly(c,[585,214,597,204,628,196,678,207,676,213,626,206],'#252f29');
  path(c,'M397 226 Q447 190 528 201 L602 216 Q624 227 610 260 L441 322 382 303 Z',gradient(c,192,327,['#ce7350','#963e32','#642f28']),INK,3);
  for(const [x,y,s] of [[453,203,1],[502,203,.87],[558,211,.7]]){
    path(c,'M '+x+' '+y+' Q '+(x+45*s)+' '+(y+15*s)+' '+(x+41*s)+' '+(y+81*s),null,'#e0a05d',3);
  }
  poly(c,[479,206,480,189,497,184,509,190,510,203], '#b8783e',INK,2);
  poly(c,[427,221,428,170,423,162,423,152,453,147,465,154,464,163,458,173,461,214], '#2d4035',INK,3);
  line(c,[423,154,453,149,463,154],GOLD,3);
  oval(c,398,271,57,66,'#7e5137','#302f25',4);
  oval(c,394,272,49,58,'#263b32',GOLD,2.5);oval(c,390,270,38,45,'#21362e','#79836b',2);
  for(let i=0;i<12;i++){const a=tau*i/12;oval(c,394+Math.cos(a)*44,272+Math.sin(a)*52,1.6,1.6,'#c0ae78');}
  line(c,[380,270,405,270],GOLD,3);oval(c,391,270,4,4,'#bd945b');
  rect(c,373,299,42,10,'#793d2f'); line(c,[377,305,409,305],GOLD,1.4);
  poly(c,[323,340,425,352,456,333,454,345,425,369,324,354], '#924a3b',INK,3);
  oval(c,334,354,9,7,INK,GOLD,1);oval(c,416,364,10,8,INK,GOLD,1);
  halo(c,368,234,38,'255,204,100',.42);oval(c,368,234,7,8,PAPER,INK,2);
}
function poster(c) {
  sky(c,'#36564c','#a3ac89','#d8b276','#526158');
  halo(c,737,200,220,'255,207,119',.55);oval(c,757,202,33,33,'#e9c786');
  const random=seeded(931);
  for(let i=-20;i<70;i++){const x=i*32,hh=18+random()*43;rect(c,x,259-hh,35,hh,'#607567');if(i%4===0)rect(c,x+10,242-hh,6,20,'#607567');}
  railRoof(c);
  poly(c,[-1500,248,1630,229,2200,600,-1500,600],gradient(c,244,500,['#8f9279','#34483d']));
  for(let i=0;i<21;i++){
    const q=i/20,yy=250+q*q*320;
    line(c,[-800,yy+38,1890,yy-15],'#5f6e5d',1+q*1.3);
  }
  for(const x of [-320,40,409,673,1450]) line(c,[920,237,x,510], '#cfb281',3);
  poly(c,[-1400,320,799,243,615,295,-1400,600],'#7c816a');
  poly(c,[-1400,522,606,296,819,245,590,306,-1400,580],'#e1bc7d');
  locomotive(c);
  for(const [x,y,s] of [[188,326,.85],[207,326,.71],[238,317,.66],[277,307,.52]]) person(c,x,y,s);
  suitcase(c,180,316,23,15);suitcase(c,163,331,36,19);
  girder(c,80); girder(c,1050);
  path(c,'M71 40 Q171 53 216 95 L216 105',null,INK,5);
  clock(c,217,126,29);
  line(c,[-400,14,1080,14],'#b19e70',2);
}
function originalRailImage(c,picture,x,y,w,h) {
  if(!picture) return;
  const s=Math.max(w/picture.width,h/picture.height),sw=w/s,sh=h/s;
  c.drawImage(picture,(picture.width-sw)/2,(picture.height-sh)/2,sw,sh,x,y,w,h);
}
function station(c,kind,picture){
  if(kind==='platform'){
    if(picture){
      sky(c,'#26433c','#748475','#b09b78');
      originalRailImage(c,picture,-140,-18,1280,540);
      rect(c,-1300,0,3600,510,gradient(c,0,510,['#16342e88','#aabd8a21','#36544348']));
      c.save();c.translate(255,93);c.scale(.81,.87);locomotive(c);c.restore();
      person(c,422,368,.86);person(c,456,356,.74);suitcase(c,397,364,29,20);
    }else{
      poster(c);
    }
    rect(c,637,61,155,58,'#163c36');line(c,[639,63,791,63,791,117,639,117,639,63],GOLD,2);
    line(c,[654,0,654,60,773,60,773,0],'#33463a',3);
    c.fillStyle=PAPER;c.textAlign='center';c.font='bold 43px Georgia,serif';c.fillText('9¾',715,105);
    return;
  }
  sky(c,'#334c47','#a79b79','#816e53');
  if(picture)originalRailImage(c,picture,-180,-25,1430,540);
  else{railRoof(c);rect(c,-500,160,2100,210,'#a7805c');}
  rect(c,-1100,0,3400,500,gradient(c,0,500,['#19332d6b','#788f6d15','#31463740']));
  girder(c,131,-30);girder(c,890,-25);clock(c,747,133,52);
  person(c,551,365,.87); person(c,577,367,.70);person(c,628,352,.75);
  suitcase(c,484,352,61,40);suitcase(c,488,331,47,22,'#92734c');
  if(kind==='intro-3'){
    c.save();c.translate(287,368);c.rotate(-.13);
    rect(c,3,5,247,109,'#283b2fa8');rect(c,0,0,247,109,'#e5cc91');
    line(c,[9,9,238,9,238,100,9,100,9,9],'#826b42',2);
    c.fillStyle='#534535';c.font='bold 36px Georgia,serif';c.fillText('9¾',18,73);
    line(c,[82,24,82,89],'#947a4c',2);
    for(let i=0;i<4;i++)line(c,[96,30+i*12,218-(i%2)*18,30+i*12],'#907547',i===0?3:1.3);
    c.restore();
  }
}
function street(c){
  sky(c,'#1c353c','#71847c','#b1a282');
  oval(c,715,102,35,35,'#d5d1af');halo(c,715,102,105,'230,224,170',.26);
  for(let i=-5;i<12;i++){
    const x=i*120-15;rect(c,x,260,119,133,'#40534a');
    poly(c,[x-15,263,x+54,202+(i%3)*8,x+131,263],'#30473f');
    rect(c,x+80,212,13,38,'#344940');rect(c,x+40,280,18,32,i%3===0?'#b99b64':'#263e37');
    rect(c,x+74,285,18,29,'#293e38');
  }
  rect(c,-1200,378,3400,160,gradient(c,380,500,['#66776b','#293f3a']));
  c.save();c.translate(0,-35);
  poly(c,[364,379,364,218,490,153,645,216,645,382],'#536256');
  poly(c,[347,221,483,133,657,215,648,226,487,157,361,233],'#293d37');
  rect(c,525,189,18,38,'#394c41');rect(c,471,260,49,103,'#2b4239');rect(c,480,271,29,31,'#bcaa71');
  for(const x of [390,554]){rect(c,x,251,47,56,'#d4ad6e');line(c,[x+24,251,x+24,307],'#56634e',4);line(c,[x,278,x+47,278],'#56634e',4);}
  c.restore();lamp(c,302,286,1.6);
  poly(c,[372,420,492,334,524,334,456,420],'#a39b79');
  for(let x=-300;x<1600;x+=24){rect(c,x,393,6,48,'#273e38');poly(c,[x,394,x+3,385,x+6,394], '#273e38');}
  rect(c,-600,400,2050,5,'#334a3e');
}
function serpent(c){
  sky(c,'#152e2b','#425e50','#9a8c63');
  rect(c,168,45,668,369,'#263e35','#112');
  rect(c,177,54,650,349,gradient(c,58,407,['#526e57','#899375','#485e45']));
  halo(c,614,127,235,'228,212,152',.41);
  for(let i=0;i<14;i++){
    const x=187+i*47,hh=22+(i%4)*17;
    path(c,'M '+x+' 405 Q '+(x-23)+' '+(397-hh)+' '+(x-8)+' '+(374-hh)+' Q '+(x+20)+' '+(395-hh)+' '+x+' 405', '#48654c');
  }
  path(c,'M266 329 Q286 308 361 304 Q471 303 537 324 Q580 340 621 329 Q648 319 661 292 C684 249 644 229 645 201 Q648 181 670 182 Q693 182 711 193',null,'#354937',24);
  path(c,'M265 325 Q335 286 447 306 Q521 313 569 327 Q638 348 657 293 C675 248 637 226 640 201 Q646 173 673 180 L707 190',null,'#baac74',13);
  for(let i=0;i<15;i++){const x=316+i*18;line(c,[x,302+(i%6),x+7,310+(i%7)],'#685f43',3);}
  oval(c,701,188,17,8,'#b2a16a');oval(c,707,185,2.8,2.8,'#162c25');line(c,[716,190,727,191,734,188],'#ad634b',1.5);
  poly(c,[194,58,226,58,410,401,392,401], '#ecf0ca22');
  poly(c,[238,58,253,58,430,366], '#ecf0ca18');
  rect(c,163,404,681,14,'#b69c67');rect(c,0,425,1000,80,'#20362e');
}
function island(c){
  sky(c,'#263d47','#72828a','#c3ae86');
  for(let i=-4;i<8;i++) path(c,'M '+(i*176)+' 133 Q '+(i*176+76)+' 98 '+(i*176+175)+' 114',null,'#617476',3);
  rect(c,-1800,279,4600,231,gradient(c,278,508,['#687b77','#354f4d','#173538']));
  poly(c,[208,362,317,327,400,314,457,277,504,268,549,286,618,284,691,325,786,345,820,366], '#34453e');
  poly(c,[391,317,461,279,506,271,491,301,546,320,432,344], '#59645a');
  rect(c,485,211,123,84,'#48574c');poly(c,[470,219,532,162,625,210,610,220,533,180,489,227], '#293d39');
  rect(c,576,172,12,29,'#32423f');rect(c,543,239,25,49,'#273a34');
  halo(c,519,239,69,'240,177,79',.39);rect(c,508,226,25,27,'#e2ad61');
  line(c,[520,226,520,253],'#645b45',3);
  for(let i=0;i<56;i++){const x=(i*117)%1600-300, y=313+(i*41)%191;path(c,'M '+x+' '+y+' q 19 -5 47 -1',null,i%3?'#91a19a':'#c1b89d',1.4);}
}
function carriage(c,picture){
  sky(c,'#283a33','#5c4c39','#302b24');
  rect(c,-1200,110,3400,240,gradient(c,110,350,['#9cae9d','#d9cb9a']));
  for(let i=-4;i<10;i++){
    const x=i*206;
    poly(c,[x-70,339,x+42,226+(i%3)*10,x+119,261,x+183,238,x+286,338],'#86947b');
    poly(c,[x-50,339,x+75,282,x+178,269,x+257,339],'#667c60');
  }
  for(const x of [83,469,830]){rect(c,x,68,32,303,'#594a37');rect(c,x+23,68,4,303,'#ad8e5b');}
  rect(c,-1400,67,4000,24,'#8d724a');rect(c,-1400,330,4000,35,'#775b41');
  for(const x of [-337,8,713,1078]) {
    path(c,'M '+x+' 512 L '+x+' 377 Q '+(x+2)+' 328 '+(x+44)+' 331 L '+(x+159)+' 345 Q '+(x+182)+' 348 '+(x+191)+' 384 L '+(x+214)+' 512 Z', gradient(c,326,500,['#934f41','#4f302e']), '#422d29',5);
    for(let i=1;i<5;i++)line(c,[x+20,360+i*19,x+178,368+i*20],'#a2634f',1.4);
  }
  if(picture){rect(c,545,4,132,63,GOLD);originalRailImage(c,picture,548,7,126,57);}
  oval(c,488,408,119,18,'#413b2e');rect(c,447,387,81,20,'#af986b');rect(c,444,381,85,10,'#c1a879');
  for(let i=0;i<7;i++)oval(c,521+i*18,419+Math.sin(i*.7)*5,3.3,1.6,'#bd9f64');
}
function castle(c){
  function tower(x,base,w,h,roof){
    rect(c,x-w/2,base-h,w,h,'#233f40');
    poly(c,[x-w*.67,base-h+4,x,base-h-roof,x+w*.67,base-h+4],'#24373a');
    for(let i=0;i<3;i++){const wx=x-w*.24+i*w*.24;rect(c,wx,base-h+15,3,8,i%2?'#b39260':'#e2b771');}
  }
  poly(c,[167,302,291,247,364,241,476,210,584,215,651,173,752,197,861,259,1087,371,145,379], '#455653');
  for(const a of [[392,273,43,68,53],[475,267,69,89,56],[554,245,37,101,72],[615,254,48,74,59],[682,253,48,115,78],[735,260,52,86,54]])tower(...a);
  poly(c,[332,271,342,243,605,232,639,263,680,249,733,270,813,268,883,309,308,319],'#263f3e');
  for(let i=0;i<23;i++)if(i%5)rect(c,350+i*20,248+(i%4)*3,4,9,'#d2ae6c');
}
function boat(c,x,y,s){
  c.save();c.translate(x,y);c.scale(s,s);
  path(c,'M-82 -5 Q-18 8 76 -8 L57 9 Q-3 26 -55 13 Z','#162e30','#a19c70',1.6);
  for(const [xx,yy,sc] of [[-38,-8,.39],[-2,-4,.44],[30,-8,.4]]) person(c,xx,yy,sc,'#182c2b');
  line(c,[-20,-14,15,13],'#97896b',2);c.restore();
}
function lake(c){
  sky(c,'#233c48','#8c99a0','#ddbd87');
  oval(c,385,102,27,27,'#ddd4b0');halo(c,385,102,98,'244,211,143',.3);
  castle(c);rect(c,-1700,293,4500,240,gradient(c,291,505,['#748d87','#465e61','#203c45']));
  const r=seeded(478);
  for(let i=0;i<144;i++){const x=r()*2300-650,y=298+r()*220;line(c,[x,y,x+8+r()*49,y], x>330&&x<775?'#b7ae86':'#77918a',.6+r()*1.15);}
  boat(c,454,381,.6);boat(c,609,340,.37);boat(c,328,437,1.12);
  lamp(c,748,333,.34);
}
function pointedWindow(c,x,y,w,h,light) {
  path(c,'M '+x+' '+(y+h)+' V '+(y+h*.32)+' Q '+x+' '+(y+h*.14)+' '+(x+w*.5)+' '+y+' Q '+(x+w)+' '+(y+h*.14)+' '+(x+w)+' '+(y+h*.32)+' V '+(y+h)+' Z',light,'#33483d',5);
  line(c,[x+w*.5,y+4,x+w*.5,y+h], '#566654',3);
  line(c,[x+3,y+h*.55,x+w-3,y+h*.55],'#566654',3);
}
function hall(c) {
  sky(c,'#152f35','#526956','#9a8054');halo(c,520,193,206,'233,186,93',.35);
  for(let i=-4;i<11;i++)pointedWindow(c,83+i*100,110,71,139,gradient(c,110,251,['#708b7e','#b9aa74']));
  for(let i=-4;i<11;i++){
    const x=i*153;
    path(c,'M '+x+' 378 L '+x+' 167 Q '+(x+3)+' 100 '+(x+77)+' 45 Q '+(x+146)+' 108 '+(x+153)+' 167 L '+(x+153)+' 378',null,'#405347',9);
  }
  rect(c,-1400,299,3800,230,gradient(c,298,511,['#717159','#393a2b']));
  for(const x of [-1070,-520,-190,21,845,1080,1450]){
    const far=500+(x-500)*.3;
    poly(c,[far,297,far+14,297,x+153,500,x,500],'#9d8056');
    poly(c,[far,303,far+11,303,x+112,502,x+8,502],'#634d39');
  }
  oval(c,516,429,75,11,'#302f24');poly(c,[469,361,476,361,478,421,471,426],'#4a382a');poly(c,[548,361,555,361,561,426,553,423],'#4a382a');
  oval(c,511,360,60,10,'#b19464','#534633',3);
  path(c,'M452 347 Q475 341 486 327 Q491 304 514 275 Q526 263 520 251 Q489 257 500 247 Q541 226 562 234 Q557 251 549 256 Q551 273 533 289 Q539 316 549 330 Q568 336 579 348 Q540 365 452 347 Z',gradient(c,233,355,['#706444','#4f4431','#7a6443']),'#392f25',3);
  path(c,'M498 325 Q514 313 530 322 M490 333 Q516 343 544 328 M503 290 Q512 294 527 281',null,'#342d23',2.3);
  const rand=seeded(981);
  for(let i=0;i<30;i++){const x=105+rand()*800,y=43+rand()*160;rect(c,x-1.3,y,3.3,9,'#f1d79b');oval(c,x,y-3,1.8,4,'#ffe7a2');}
}
function feather(c,x,y,s,angle=-.26) {
  c.save();c.translate(x,y);c.rotate(angle);c.scale(s,s);
  path(c,'M-55 45 Q-12 -24 78 -41 Q78 -11 44 16 L49 6 Q33 37 -44 39 Z',gradient(c,-43,50,['#f7e9bd','#d8cda0','#a4ad8a']),'#7c896a',1.7);
  path(c,'M-67 53 Q-8 11 64 -31',null,'#847d56',2);
  for(let i=0;i<10;i++){
    const x0=-36+i*9,y0=32-i*5.5;
    path(c,'M '+x0+' '+y0+' q 7 -14 15 -23',null,'#b7b995',1.1);
    path(c,'M '+x0+' '+y0+' q 14 4 25 -2',null,'#9da783',.9);
  }
  c.restore();
}
function study(c,ring){
  sky(c,'#213e3b','#7f927b','#b2a071');
  for(const x of [51,265,678,893]) pointedWindow(c,x,-45,135,306,gradient(c,0,263,['#5a817b','#d0bd8d']));
  rect(c,-1600,266,4400,281,gradient(c,266,497,['#8c8060','#293f34']));
  poly(c,[-300,503,-210,405,615,347,1420,461,1460,540],'#9d7953');
  poly(c,[-180,514,-175,449,660,371,1150,448,1148,518],'#654b36');
  if(!ring){
    halo(c,532,215,150,'249,230,161',.46);
    feather(c,536,209,1.46,-.38);
    poly(c,[272,416,276,422,446,303,445,299],'#523c2d',GOLD,1);
    poly(c,[574,385,638,368,690,380,625,397],'#d6c79b');line(c,[622,384,660,377],'#a48a61',1.2);
  }else{
    poly(c,[206,111,330,79,442,130,442,378,330,336,206,382], '#817454','#514e39',5);
    for(const x of [213,330,434])line(c,[x,121,x,368],GOLD,2);
    line(c,[638,0,638,134], '#806f4e',2);oval(c,638,204,38,70,null,'#e6c985',7);oval(c,638,204,32,65,null,'#8d754d',2);
    line(c,[638,277,638,289],GOLD,2);path(c,'M630 304 Q633 284 639 286 Q645 286 650 304 Z',GOLD,INK,1.4);
    feather(c,523,212,.96,-.17);halo(c,519,198,90,'253,225,135',.18);
  }
}
function library(c) {
  sky(c,'#23382f','#675b42','#9f885d');
  const rand=seeded(65), cols=['#6c553a','#384d41','#77633d','#754d3d','#8a784e','#4a5c4a'];
  for(let row=0;row<4;row++){
    const y=55+row*67;
    for(let x=-650;x<1650;){
      const w=6+rand()*15,h=23+rand()*39;rect(c,x,y+55-h,w,h,cols[Math.floor(rand()*cols.length)]);
      line(c,[x+2,y+51-h,x+w-1,y+51-h],'#b29158',.7);x+=w+2;
    }
    rect(c,-1400,y+54,3800,7,'#342d23');rect(c,-1400,y+53,3800,2,'#977648');
  }
  for(let x=-530;x<1700;x+=245){rect(c,x,0,10,327,'#3c3829');rect(c,x+7,0,2,327,'#987749');}
  rect(c,-1600,331,4200,175,gradient(c,330,505,['#a1855c','#63503a']));
  poly(c,[304,391,516,342,709,378,739,425,536,458,305,417],'#493f2f');
  poly(c,[299,384,491,349,520,365,531,440,299,410],'#cfbc8e','#766c4d',2);
  poly(c,[520,365,692,340,736,401,531,440],'#e3d2a4','#746649',2);
  for(let i=0;i<5;i++)line(c,[329,389+i*4,460,364+i*5],'#ad9870',1);
  line(c,[549,388,585,384,596,391,651,377,661,390,691,384],'#7a8770',3);
  line(c,[560,394,610,406,641,391,694,398],'#a58e67',2);
  rect(c,749,259,7,82,'#554a33');oval(c,753,341,28,5,'#675637');
  path(c,'M709 267 Q714 225 751 221 Q786 220 800 262 Z','#5b735b',GOLD,2);halo(c,750,269,81,'255,199,100',.30);
}
function corridor(c){
  sky(c,'#274341','#74867a','#928c6d');
  for(let i=-4;i<8;i++){const x=i*188;rect(c,x,0,185,377,i%2?'#4c6459':'#617569');}
  for(let row=0;row<8;row++){
    const y=row*46;
    line(c,[-700,y,1700,y],'#879282',1);
    for(let x=-800+(row%2)*54;x<1700;x+=111)line(c,[x,y,x,y+43],'#52695d',1);
  }
  rect(c,-1600,361,4200,190,gradient(c,360,503,['#87917d','#4a5b49']));
  path(c,'M405 352 V176 A99 99 0 0 1 603 176 V352 Z','#304e43','#988c68',9);
  path(c,'M423 175 A81 81 0 0 1 585 175 Z','#c9bd8b','#435d50',3);
  for(let i=0;i<6;i++){const a=Math.PI+i*Math.PI/5;line(c,[504,173,504+Math.cos(a)*78,173+Math.sin(a)*78],'#556a58',2);}
  rect(c,423,181,163,168,'#344f4d');poly(c,[423,181,466,201,466,338,423,349],'#547578',INK,2);
  rect(c,476,193,101,154,gradient(c,193,350,['#aaa682','#dad0a0']));
  poly(c,[499,345,571,345,716,496,324,496],'#d8c29070');
  c.save();c.translate(675,294);c.rotate(.28);rect(c,-56,-71,118,11,'#a68652');rect(c,-56,58,118,12,'#a68652');rect(c,-56,-64,10,124,'#745c3c');rect(c,52,-64,10,124,'#745c3c');c.restore();
  person(c,551,328,.71);lamp(c,347,227,.60);
}
const painters={
  cover:poster,'intro-0':street,'intro-1':serpent,'intro-2':island,
  'intro-3':(c,img)=>station(c,'intro-3',img),'kings-cross':(c,img)=>station(c,'kings-cross',img),
  platform:(c,img)=>station(c,'platform',img),express:carriage,lake,sorting:hall,
  charms:c=>study(c,false),'team-puzzle':c=>study(c,true),'library-record':library,'trapdoor-return':corridor,
};

function gradeSource(img) {
  const layer=document.createElement('canvas');
  layer.width=Math.min(720,img.naturalWidth);
  layer.height=Math.max(1,Math.round(layer.width*img.naturalHeight/img.naturalWidth));
  const g=layer.getContext('2d',{willReadFrequently:true});
  if(!g)return img;
  g.drawImage(img,0,0,layer.width,layer.height);
  // Map the local 3D reference into the same restrained ink-and-paper palette.
  try{
    const pixels=g.getImageData(0,0,layer.width,layer.height),d=pixels.data;
    for(let i=0;i<d.length;i+=4){
      const l=(d[i]*.31+d[i+1]*.54+d[i+2]*.15)/255;
      const warm=Math.max(-.15,Math.min(.28,(d[i]-d[i+2])/255)) * 30;
      d[i]=34+183*l+warm;d[i+1]=57+132*l;d[i+2]=49+96*l-warm*.5;
    }
    g.putImageData(pixels,0,0);
  }catch { /* Local file previews can still draw the original reference. */ }
  return layer;
}
function loadSource(name) {
  if(!imageCache.has(name)) {
    const pending=new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>resolve(gradeSource(img));img.onerror=()=>resolve(null);
      img.src='./assets/rpg/'+name+'.webp';
    });
    imageCache.set(name,pending);
  }
  return imageCache.get(name);
}
function vignetteAndGrain(c,w,h){
  const shading=c.createRadialGradient(w*.52,h*.47,h*.18,w*.5,h*.50,Math.max(w*.7,h*.7));
  shading.addColorStop(0,'#1b2c2100');shading.addColorStop(1,'#0e231d72');rect(c,0,0,w,h,shading);
  // Fine, fixed flecks give the flat areas a lithographic surface.
  const rand=seeded(312);
  for(let i=0;i<Math.min(17000,w*h/31);i++){
    const x=rand()*w,y=rand()*h;
    rect(c,x,y,.5+rand()*.8,.55,rand()>.47?'#ffedc02b':'#182d262e');
  }
}
function atmosphere(c,key,t){
  const steam=key==='cover'||key==='platform', dust=['library-record','trapdoor-return','charms','team-puzzle','sorting'].includes(key);
  if(steam){
    for(let i=0;i<20;i++){
      const age=((i*.071+t*.055)%1);
      const origin=key==='platform'?[613,225]:[448,150];
      const x=origin[0]+age*174+Math.sin(age*9+i)*12,y=origin[1]-age*142,rad=8+age*28;
      c.save();c.scale(1.65,1);halo(c,x/1.65,y,rad,'226,223,193',.21*(1-age));c.restore();
    }
  }else if(key==='intro-2'||key==='lake'){
    for(let i=0;i<15;i++){
      const x=85+(i*131)%871,y=318+(i*41)%144;
      const shimmer=(Math.sin(t*.65+i)+1)*.5;
      line(c,[x,y,x+6+shimmer*26,y], 'rgba(231,215,164,'+(.05+.14*shimmer)+')',1.4);
    }
  }else if(dust){
    for(let i=0;i<16;i++){
      const x=244+(i*67)%520+Math.sin(t*.23+i)*4,y=85+(i*47)%236+Math.cos(t*.21+i)*6;
      oval(c,x,y,i%4===0?1.6:.9,i%4===0?1.6:.9,'rgba(248,226,160,'+(.18+.12*Math.sin(i+t*.35))+')');
    }
  }else{
    const warm=key==='intro-0'?[302,209]:key==='intro-1'?[620,164]:key==='express'?[491,192]:[749,134];
    halo(c,warm[0],warm[1],74,'248,213,136',.05+.023*Math.sin(t*.77));
  }
}
export function paintScene(canvas,key='cover'){
  if(!canvas?.getContext)return ()=>{};
  const ctx=canvas.getContext('2d');
  if(!ctx)return ()=>{};
  let board=document.createElement('canvas'), background=board.getContext('2d');
  if(!background)return ()=>{};
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let disposed=false,visible=true,source=null,frame=0,timer=0,cssW=0,cssH=0,density=1;
  let sx=1,sy=1,tx=0,t=0,last=0;
  const stop=()=>{cancelAnimationFrame(frame);clearTimeout(timer);frame=0;timer=0;last=0;};
  function applyCoordinates(c){c.setTransform(density*sx,0,0,density*sy,density*tx,0);}
  function compose(){
    if(disposed||!cssW||!cssH)return;
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(board,0,0);
    ctx.save();applyCoordinates(ctx);atmosphere(ctx,key,t);ctx.restore();
  }
  function schedule(){
    if(disposed||!visible||document.hidden||reduced?.matches||!cssW||!cssH||frame||timer)return;
    // Small accents need fewer frames than character animation.
    timer=window.setTimeout(()=>{
      timer=0;frame=requestAnimationFrame(now=>{
        frame=0;if(disposed||!visible||document.hidden||reduced?.matches)return;
        if(last)t+=Math.min(.25,(now-last)/1000);
        last=now;compose();schedule();
      });
    },105);
  }
  function resize(force=false) {
    if(disposed)return;
    const box=canvas.getBoundingClientRect(),w=Math.round(box.width),h=Math.round(box.height);
    if(w<1||h<1){cssW=0;cssH=0;stop();return;}
    const ratio=Math.min(2,window.devicePixelRatio||1,2200/w,1280/h);
    if(!force&&w===cssW&&h===cssH&&ratio===density)return;
    cssW=w;cssH=h;density=ratio;sy=h/500;sx=Math.min(w/846,sy*1.32);tx=w/2-500*sx;
    canvas.width=board.width=Math.max(1,Math.round(w*ratio));canvas.height=board.height=Math.max(1,Math.round(h*ratio));
    background.setTransform(density,0,0,density,0,0);rect(background,0,0,w,h,DARK);
    background.save();applyCoordinates(background);(painters[key]||poster)(background,source);background.restore();
    background.setTransform(density,0,0,density,0,0);vignetteAndGrain(background,w,h);
    compose();schedule();
  }
  function motionChanged(){stop();if(!document.hidden&&visible){compose();schedule();}}
  const obs=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>resize());
  obs?.observe(canvas);window.addEventListener('resize',resizeEvent);
  function resizeEvent(){resize();}
  const onScreen=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
    if(entries.length){visible=entries[entries.length-1].isIntersecting;motionChanged();}
  });onScreen?.observe(canvas);
  document.addEventListener('visibilitychange',motionChanged);
  if(reduced?.addEventListener)reduced.addEventListener('change',motionChanged);
  else reduced?.addListener?.(motionChanged);
  resize(true);
  if(sceneImages[key])loadSource(sceneImages[key]).then(img=>{if(!disposed&&img){source=img;resize(true);}});
  return ()=>{
    if(disposed)return;disposed=true;stop();obs?.disconnect();onScreen?.disconnect();
    window.removeEventListener('resize',resizeEvent);document.removeEventListener('visibilitychange',motionChanged);
    if(reduced?.removeEventListener)reduced.removeEventListener('change',motionChanged);
    else reduced?.removeListener?.(motionChanged);
    board.width=board.height=1;background=null;board=null;source=null;
  };
}
