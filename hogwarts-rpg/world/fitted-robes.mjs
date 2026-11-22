import * as THREE from 'three';
import { rings, tailPatch } from './avatar-parts.mjs';

// Measurements are in the author's rest pose. The back of the figure is +Z.
// Hem height and width are individual pattern measurements, not item-level multipliers.
const patterns = {
  harry: {
    hems: [.70,.75,.67,.67,.70,.64,.65,.68,.58,.43], widths: [.237,.24,.249,.247,.253,.26,.267,.255,.278,.303],
    trim:'#953d45', light:'#c49a74', dark:'#4b3642', lining:'#642b35'
  },
  ron: {
    hems: [.71,.74,.68,.72,.755,.62,.72,.59,.46,.48], widths: [.254,.232,.263,.257,.243,.28,.243,.284,.303,.299],
    trim:'#b58352', light:'#d8ac72', dark:'#603a36', lining:'#873e34'
  },
  hermione: {
    hems: [.74,.755,.66,.62,.48,.73,.6,.55,.67,.45], widths: [.225,.225,.244,.255,.28,.239,.27,.276,.25,.294],
    trim:'#914556', light:'#c8bba5', dark:'#30364d', lining:'#763748'
  },
  neville: {
    hems: [.735,.745,.645,.70,.62,.645,.62,.715,.54,.45], widths: [.233,.237,.257,.25,.275,.258,.278,.268,.293,.305],
    trim:'#9f915a', light:'#d4bd78', dark:'#495f4f', lining:'#717654'
  },
  george: {
    hems: [.738,.745,.696,.72,.71,.69,.745,.52,.58,.64], widths: [.231,.233,.246,.251,.253,.247,.244,.285,.269,.263],
    trim:'#428c83', light:'#cab87e', dark:'#573c54', lining:'#40837b'
  }
};
const shirt = '#e7decb';
const front = -1, back = 1;
const tau = Math.PI*2;
const lerp = THREE.MathUtils.lerp;

function silhouette(item) {
  const cut=patterns[item.hero], t=item.tier-1, hem=cut.hems[t], width=cut.widths[t];
  const shoulder=(item.hero==='ron' ? .29 : item.hero==='hermione' ? .271 : .278);
  return {...cut,...item,hem,width,rows:[[hem,width],[hem+.028,width-.002],[.82,.234],[.94,.221],[1.10,.245],[1.21,shoulder-.012],[1.25,shoulder],[1.29,.235],[1.32,.158],[1.344,.098]]};
}

function contour(cut,y) {
  for(let i=1;i<cut.rows.length;i++) {
    const [high,r1]=cut.rows[i];
    if(y<=high) {
      const [low,r0]=cut.rows[i-1];
      return lerp(r0,r1,THREE.MathUtils.clamp((y-low)/(high-low),0,1));
    }
  }
  return cut.rows.at(-1)[1];
}
function onCloth(cut,x,y,side=front,lift=.005) {
  const r=contour(cut,y);
  return [x,y,side*(.75*Math.sqrt(Math.max(.0001,r*r-x*x))+lift)];
}
function triangles(part,color,points) { part.shape(tailPatch(points),color,0,0,0); }

function clothShell(part,c) {
  const positions=[],indices=[],segments=32;
  const long=c.hem<.62;
  for(let level=0;level<c.rows.length;level++){
    const [y,radius]=c.rows[level];
    // A raised front vent leaves space for the advancing knee. The tails stay behind the hips.
    const fall=Math.max(0,(.82-y)/(.82-c.hem));
    for(let k=0;k<=segments;k++){
      const a=tau*k/segments, x=Math.sin(a), z=Math.cos(a);
      const vent=long ? .085*Math.max(0,-z)**12 : 0;
      let line=y+fall*vent;
      if(c.hero==='george' && c.tier>=7) line-=fall*(.062+.085*x)*Math.max(0,z);
      if(c.hero==='neville' && c.tier>=5) line+=fall*(.023*Math.cos(4*a)+.018*Math.max(0,-z));
      if(c.hero==='hermione' && [5,8,10].includes(c.tier)) line+=fall*.035*x;
      const pleat=c.tier>=5 ? fall*.008*(.5+.5*Math.cos(10*a)) : 0;
      positions.push((radius+pleat)*x,line,(radius+pleat)*.75*z);
      if(level && k){const n=level*(segments+1)+k;indices.push(n-segments-2,n-segments-1,n-1,n-segments-1,n,n-1);}
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
  part.shape(geo,c.color,0,0,0);
  part.shape(rings([[.096,1.322],[.103,1.331],[.096,1.345]],18),c.tier===1 ? c.color : c.dark,0,0,0,1,1,.82);
}

// Thin panels are cut into radial strips, so a broad pocket or lapel follows the torso.
function panel(part,c,color,rows,side=front,lift=.009) {
  const points=[],n=5;
  for(let i=1;i<rows.length;i++) {
    const [ya,la,ra]=rows[i-1],[yb,lb,rb]=rows[i];
    const steps=Math.max(1,Math.ceil(Math.abs(ya-yb)/.055));
    for(let j=0;j<steps;j++) {
      const row=(p)=>[lerp(ya,yb,p),lerp(la,lb,p),lerp(ra,rb,p)];
      const [y0,l0,r0]=row(j/steps),[y1,l1,r1]=row((j+1)/steps);
      for(let k=0;k<n;k++) {
        const a=onCloth(c,lerp(l0,r0,k/n),y0,side,lift),b=onCloth(c,lerp(l0,r0,(k+1)/n),y0,side,lift);
        const d=onCloth(c,lerp(l1,r1,k/n),y1,side,lift),e=onCloth(c,lerp(l1,r1,(k+1)/n),y1,side,lift);
        points.push(a,b,d,b,e,d);
      }
    }
  }
  triangles(part,color,points);
}
function stripe(p,c,color,from,to,width=.008,side=front,lift=.015) {
  panel(p,c,color,[[from[1],from[0]-width,from[0]+width],[to[1],to[0]-width,to[0]+width]],side,lift);
}
function tape(p,c,color,y,x0,x1,h=.012,side=front,lift=.02) {
  panel(p,c,color,[[y,x0,x1],[y-h,x0,x1]],side,lift);
}
function pocket(p,c,x,y,w=.081,h=.09,color=c.dark,deep=false) {
  panel(p,c,color,[[y,x-w*.5,x+w*.5],[y-h*.73,x-w*.5,x+w*.5],[y-h,x-w*.34,x+w*.34]],front,deep?.021:.011);
  tape(p,c,c.trim,y+.004,x-w*.5,x+w*.5,.012,front,deep?.033:.022);
  if(deep)stripe(p,c,c.light,[x+w*.26,y-.021],[x+w*.26,y-h*.78],.004,front,.032);
}
function button(p,c,x,y,color=c.light,size=.012,side=front,lift=.020) {
  const [cx,cy,cz]=onCloth(c,x,y,side,lift);
  p.oval(color,cx,cy,cz,size,size,.008);
}
function pin(p,c,x,y) {
  const [cx,cy,cz]=onCloth(c,x,y,front,.032);
  p.shape(new THREE.OctahedronGeometry(1),c.light,cx,cy,cz,.026,.033,.012);
  p.shape(new THREE.OctahedronGeometry(1),c.trim,cx,cy,cz-.008,.017,.021,.011);
}
function collar(p,c,style='point') {
  for(const sign of [-1,1]){
    const wide=style==='lapel', depth=wide?1.085:style==='round'?1.256:1.22;
    const values=[[1.334,.016,.084],[1.301,.028,wide?.148:.114],[depth,wide?.052:.068,wide?.061:.076]];
    panel(p,c,wide?c.dark:style==='round'?c.trim:shirt,values.map(([y,l,r])=>[y,sign*l,sign*r]),front,.021);
    if(wide)stripe(p,c,c.trim,[sign*.124,1.286],[sign*.056,depth+.012],.006,front,.031);
  }
}
function vestV(p,c) {
  panel(p,c,shirt,[[1.329,-.081,.081],[1.27,-.093,.093],[1.13,-.003,.003]],front,.015);
  for(const s of [-1,1])stripe(p,c,c.trim,[s*.112,1.302],[0,1.129],.008,front,.024);
}
function buttons(p,c,x,top,count,step=.092) {
  for(let i=0;i<count;i++)button(p,c,x,top-step*i);
}
function pleat(p,c,side=back,wide=.105) {
  panel(p,c,c.lining,[[1.237,-.02,.02],[1.12,-.034,.034],[c.hem+.042,-wide,wide]],side,.013);
  for(const s of [-1,1])stripe(p,c,c.dark,[s*.016,1.206],[s*wide,c.hem+.037],.007,side,.023);
  tape(p,c,c.trim,1.203,-.092,.092,.022,side,.028);
}
function yoke(p,c,color=c.dark) {
  panel(p,c,color,[[1.323,-.093,.093],[1.282,-.179,.179],[1.233,-.213,.213],[1.19,-.122,.122]],back,.013);
}
function cape(p,c,{left=false,length=.94,sideColor=c.dark}={}) {
  const segments=28, start=left ? -2.99 : -2.68, end=left ? .06 : 2.68;
  const vertices=[],edge=[];
  for(let i=0;i<segments;i++){
    const a=lerp(start,end,i/segments),b=lerp(start,end,(i+1)/segments);
    function hem(q) {
      const shortening=left?Math.abs(Math.sin((q-start)/(end-start)*Math.PI)):.5+.5*Math.cos(q);
      return length+(1-shortening)*.105;
    }
    const loc=(q,r,y)=>[r*Math.sin(q),y,r*.78*Math.cos(q)+.003];
    const rows=q=>[loc(q,.112,1.341),loc(q,.245,1.29),loc(q,.298,1.243),loc(q,.306,lerp(1.243,hem(q),.79)),loc(q,.308,hem(q))];
    const A=rows(a),B=rows(b);
    for(let n=1;n<A.length;n++)vertices.push(A[n-1],A[n],B[n-1],A[n],B[n],B[n-1]);
    const at=q=>loc(q,.31,hem(q)+.014);
    edge.push(A[4],at(a),B[4],at(a),at(b),B[4]);
  }
  triangles(p,sideColor,vertices);triangles(p,c.trim,edge);
}
function checks(p,c,center,y,count,size,side=front,lift=.028){
  for(let row=0;row<2;row++)for(let col=0;col<count;col++){
    const x=center+(col-count/2)*size;
    tape(p,c,(row+col)%2?c.trim:c.dark,y-row*size,x,x+size,size,side,lift);
  }
}

function harryBody(p,c) {
  const t=c.tier;
  if(t===2) {tape(p,c,c.dark,.798,-.19,.19,.032);collar(p,c,'round');}
  else if(t<=4)collar(p,c);
  if(t===1){tape(p,c,c.trim,1.292,-.103,-.061,.026);return;}
  if(t===3 || t===7)cape(p,c,{left:true,length:t===3?1.14:.95,sideColor:t===3?c.dark:c.color});
  if(t===4){pocket(p,c,.13,1.101);pocket(p,c,-.115,.958,.098,.084);}
  if(t>=5){
    const stop=t<8?.865:c.hem+.11;
    panel(p,c,c.dark,[[1.318,-.107,-.065],[1.246,-.067,.02],[1.12,.002,.087],[stop,.098,.151]],front,.012);
    stripe(p,c,c.trim,[-.084,1.298],[.123,stop],t>=9?.014:.009,front,.029);
    button(p,c,-.094,1.277,c.light,.018,front,.034);
    if(t===6 || t>=9)pleat(p,c,back,t===10?.137:.085);
    if(t===8){collar(p,c,'lapel');yoke(p,c);pocket(p,c,.13,.935);}
    if(t>=9){buttons(p,c,-.045,1.14,4,.08);collar(p,c,'lapel');}
    if(t===10){
      pin(p,c,.136,1.214);
      for(const side of [front,back])for(let i=0;i<5;i++){
        const x=(i-2)*.067,y=c.hem+.075+.12*Math.abs(x);
        panel(p,c,c.light,[[y+.041,x-.007,x+.008],[y+.03,x-.02,x+.021],[y,x-.016,x+.014]],side,.033);
        stripe(p,c,c.trim,[x,y+.032],[x,y+.005],.0035,side,.038);
      }
    }
  }
}

function ronBody(p,c) {
  const t=c.tier;
  if(t===1){collar(p,c);tape(p,c,c.dark,.787,-.209,.209,.041);return;}
  if(t===2){vestV(p,c);tape(p,c,c.trim,.793,-.204,.204,.038);return;}
  if(t===3){collar(p,c,'round');buttons(p,c,0,1.22,2,.058);pocket(p,c,-.097,.985,.13,.122);pocket(p,c,.096,.985,.13,.122,c.lining);return;}
  if(t===4||t===8||t===9)collar(p,c,'lapel');
  if(t===4){yoke(p,c,c.trim);tape(p,c,c.dark,1.235,-.171,.171,.016,back);}
  if(t===5||t===10){
    for(const s of [-1,1]){
      checks(p,c,s*.14,1.252,3,.036);
      if(t===10){
        for(let y=1.19;y>.62;y-=.096)checks(p,c,s*(.057+(1.2-y)*.085),y,2,.036);
        stripe(p,c,c.light,[s*.07,1.26],[s*.133,.564],.005,front,.038);
      }
    }
    yoke(p,c);checks(p,c,0,1.263,9,.039,back,.031);
    if(t===10){vestV(p,c);pleat(p,c,back,.115);pin(p,c,.134,1.188);}
  }
  if(t===6){cape(p,c,{left:true,length:1.015,sideColor:c.lining});buttons(p,c,-.075,1.131,3);}
  if(t===7){vestV(p,c);stripe(p,c,c.dark,[-.087,1.245],[.145,.827],.03);checks(p,c,.006,1.143,3,.033);buttons(p,c,.14,.998,2);}
  if(t===8){pleat(p,c);button(p,c,-.091,.946,c.light,.016,back);button(p,c,.091,.946,c.light,.016,back);}
  if(t===9){pocket(p,c,-.13,.912,.112,.162);pocket(p,c,.13,.912,.112,.162);buttons(p,c,0,1.16,5,.095);yoke(p,c);}
}

function indexPages(p,c,count) {
  for(let i=0;i<count;i++){
    const x=.116-i*.047, top=1.293-i*.034,bottom=c.hem+.108+i*.027;
    panel(p,c,i%2?c.dark:c.color,[[top,x-.078,x-.021],[1.18,x-.066,x+.025],[bottom,x-.044,x+.043]],front,.012+i*.006);
    stripe(p,c,c.light,[x+.015,1.193],[x+.04,bottom],.004,front,.018+i*.007);
    tape(p,c,c.trim,1.058-i*.061,x+.008,x+.077,.033,front,.039+i*.005);
  }
}
function hermioneBody(p,c) {
  const t=c.tier;
  if(t===1){collar(p,c,'round');pocket(p,c,-.12,1.185,.087,.076,c.color);buttons(p,c,0,1.18,3);return;}
  if(t===2){vestV(p,c);stripe(p,c,c.dark,[.174,1.109],[.179,.889],.011);return;}
  if(t===3){collar(p,c);tape(p,c,c.trim,.867,-.208,.208,.021);return;}
  if(t===4||t===5||t===8||t===10)indexPages(p,c,t===4||t===8?2:3);
  if(t===4){stripe(p,c,c.trim,[-.145,1.059],[-.054,1.129],.009);}
  if(t===6){collar(p,c,'lapel');pleat(p,c);pocket(p,c,-.132,1.009,.11,.101);pocket(p,c,.132,1.009,.11,.101);}
  if(t===7){for(const s of [-1,1]){panel(p,c,c.dark,[[.977,s*.025,s*.172],[.841,s*.053,s*.194],[.704,s*.086,s*.177]],front,.014);button(p,c,s*.115,.849,shirt,.02);button(p,c,s*.144,.903,shirt,.017);}}
  if(t===8){pocket(p,c,-.129,.966,.097,.114);yoke(p,c);tape(p,c,c.trim,1.237,-.181,.181,.019,back);}
  if(t===9){cape(p,c,{length:.909,sideColor:c.dark});pin(p,c,.093,1.28);pleat(p,c);}
  if(t===10){
    collar(p,c,'lapel');pleat(p,c,back,.121);pin(p,c,-.116,1.212);
    for(let i=0;i<3;i++)stripe(p,c,i===1?c.trim:c.light,[-.111+i*.029,1.231],[-.161+i*.026,c.hem+.071],.0045,back);
    for(let i=0;i<4;i++)tape(p,c,c.trim,.653-i*.021,-.18,-.063+i*.015,.007,front,.03);
  }
}

function leaves(p,c) {
  for(const s of [-1,1]){
    const h=c.hem+.095;
    panel(p,c,s===1?c.color:c.lining,[[1.067,-s*.081,s*.056],[.94,-s*.038,s*.132],[.78,s*.034,s*.201],[h,s*.098,s*.144]],front,s===1?.022:.012);
    stripe(p,c,c.trim,[s*.009,1.007],[s*.123,h+.013],.006,front,.031);
    if(c.tier===10)for(let k=0;k<3;k++){
      const y=.732-k*.057,x=.076+k*.013;
      stripe(p,c,c.light,[s*x,y],[s*(x+.06),y+.037],.004,front,.04);
    }
  }
}
function nevilleBody(p,c) {
  const t=c.tier;
  if(t===1){collar(p,c);pocket(p,c,-.116,1.18,.091,.075,c.lining);buttons(p,c,0,1.16,3);return;}
  if(t===2){collar(p,c,'round');pocket(p,c,-.102,.955,.115,.083);pocket(p,c,.102,.955,.115,.083);return;}
  if(t===3){collar(p,c,'round');yoke(p,c,c.lining);return;}
  if(t===4||t===5||t===7||t===10){
    stripe(p,c,c.dark,[-.096,1.301],[.181,.95],.014);
    buttons(p,c,.169,.983,2,.052);
  }
  if(t===5||t===10){leaves(p,c);button(p,c,.15,.954,c.light,.021,front,.042);}
  if(t===6){cape(p,c,{length:1.12,sideColor:c.lining});pleat(p,c,back,.093);for(const s of [-1,1])button(p,c,s*.097,1.173,c.light,.015,back,.034);}
  if(t===7){tape(p,c,c.dark,.905,-.195,.195,.041);pocket(p,c,-.113,.855,.11,.081,c.lining);}
  if(t===8){panel(p,c,c.lining,[[.987,-.152,.152],[.91,-.19,.19],[.812,-.143,.143],[.787,-.065,.065]],front,.026);tape(p,c,c.trim,.979,-.154,.154,.021,front,.045);for(const s of [-1,1])stripe(p,c,c.dark,[s*.153,.957],[s*.19,1.06],.013);}
  if(t===9){cape(p,c,{length:.995});for(const s of [-1,1])button(p,c,s*.103,1.219,c.light,.02);pocket(p,c,-.123,.942,.108,.083);}
  if(t===10){collar(p,c,'round');pleat(p,c,back,.131);pin(p,c,-.112,1.19);
    for(const s of [-1,1])for(let i=0;i<3;i++)stripe(p,c,c.light,[s*.022,.776-i*.064],[s*(.132+i*.007),.842-i*.064],.005,back,.036);}
}

function georgeBody(p,c) {
  const t=c.tier;
  if(t===1){collar(p,c);pocket(p,c,-.119,1.179,.097,.081,'#774b68');buttons(p,c,.005,1.164,3);return;}
  if(t===2){vestV(p,c);buttons(p,c,-.13,1.153,4,.073);return;}
  if(t===3){pocket(p,c,-.127,1.19,.121,.124,c.lining);pocket(p,c,-.115,1.157,.091,.086,c.dark,true);return;}
  if(t===4){pleat(p,c,back,.119);collar(p,c,'round');return;}
  if(t===5||t===10){for(const s of [-1,1]){pocket(p,c,s*.134,.962,.121,.132,c.dark,true);button(p,c,s*.153,.934,c.light,.013,front,.044);}}
  if(t===5){stripe(p,c,c.trim,[-.078,1.316],[-.142,1.06],.009);buttons(p,c,-.136,1.17,2);}
  if(t===6){collar(p,c,'round');buttons(p,c,-.126,1.177,4,.078);}
  if(t===7||t>=9){pleat(p,c,back,.119);panel(p,c,c.lining,[[1.215,-.193,-.111],[1.03,-.169,-.067],[c.hem+.068,-.188,-.103]],back,.023);}
  if(t===7||t===9)panel(p,c,c.dark,[[1.299,-.104,-.019],[1.175,-.082,.046],[.906,-.13,-.023],[c.hem+.074,-.147,-.126]],front,.017);
  if(t===8){collar(p,c,'lapel');for(let i=0;i<3;i++){const x=.08+i*.024;tape(p,c,i%2?c.light:'#975678',1.145-i*.037,x,x+.062,.051,front,.023+i*.006);}buttons(p,c,-.057,1.092,4);}
  if(t===9){yoke(p,c);buttons(p,c,.088,1.177,3);pin(p,c,-.127,1.188);}
  if(t===10){collar(p,c,'lapel');buttons(p,c,-.061,1.129,3,.071);pin(p,c,.129,1.216);
    for(const s of [-1,1])stripe(p,c,c.light,[s*.17,1.217],[s*.102,c.hem+.116],.005,back,.033);}
}

const tailors={harry:harryBody,ron:ronBody,hermione:hermioneBody,neville:nevilleBody,george:georgeBody};
// The caller supplies a costumePart for the body or for each animated arm.
export function drawFittedRobeBody(part,item){
  const c=silhouette(item);
  clothShell(part,c);tailors[c.hero](part,c);
}

function sleeveBand(p,color,y,r,h,side) {
  p.shape(new THREE.CylinderGeometry(r,r,h,16),color,side*(-y*.17),y,0,1,1,.94,0,0,side*.17);
}
export function drawFittedRobeSleeve(part,item,side){
  const {tier:t,hero,color}=item,c=patterns[hero];
  const vest=t===2&&hero!=='harry'||t===7&&hero==='george';
  const rolled=(hero==='harry'&&t===2)||(hero==='ron'&&t===1)||(t===3&&['hermione','neville'].includes(hero));
  const over=(hero==='ron'&&t===8)||(hero==='george'&&t===6);
  const full=(hero==='harry'&&[7,8,10].includes(t))||(hero==='hermione'&&[5,9,10].includes(t))||(hero==='neville'&&[7,9,10].includes(t))||hero==='george'&&t>=9;
  const cuff=full?.089:rolled?.081:.068;
  const sleeveColor=vest?shirt:over?(hero==='ron'?'#a7784c':'#754f70'):color;
  const rows=[[.054,-.361],[cuff,-.356],[cuff+.002,-.335],[.075,-.164],[.082,-.09],[.094,-.009],[.09,.022],[.058,.051],[0,.062]];
  part.shape(rings(rows,18),sleeveColor,0,0,0,1,1,.94,0,0,side*.17);
  if(over)part.shape(rings([[.093,-.231],[.101,-.219],[.09,-.113],[.098,-.016],[.088,.027],[.05,.051]],18),color,0,0,0,1,1,.97,0,0,side*.17);
  const edge=rolled?shirt:vest?c.dark:t>=4?c.trim:sleeveColor;
  sleeveBand(part,edge,rolled?-.307:-.343,cuff+.003,rolled?.083:.028,side);
  if(rolled||t>=8)sleeveBand(part,c.dark,rolled?-.275:-.327,cuff+.004,.014,side);
  if(t>=9)sleeveBand(part,c.light,-.35,cuff+.004,.008,side);
  if((hero==='ron'&&[2,5,10].includes(t))||(hero==='neville'&&t===3)||(hero==='hermione'&&t===3&&side===1)){
    part.oval(hero==='ron'?c.trim:c.dark,side*.066,-.183,.045,.049,.069,.026,.1,side*.47,side*.14);
  }
  if(hero==='harry'&&t===8)part.oval(c.dark,side*.034,-.019,-.001,.078,.068,.09,0,0,side*.2);
  if(hero==='george'&&t===6)part.oval(c.dark,side*.063,-.232,-.052,.046,.021,.016);
  if(t===10)part.oval(c.light,side*.073,-.32,-.062,.012,.013,.007);
}
