import * as THREE from 'three';
import {costumePart, rings, tailPatch} from './avatar-parts.mjs';
import {ITEMS, normalizeEquipment} from './wardrobe.mjs';
import {orientHeldProp} from './avatar-motion.mjs';
import {findFittedItem} from './fitted-catalog.mjs';
import {drawFittedWand, fittedWandTip} from './fitted-wands.mjs';
import {drawFittedRobeBody, drawFittedRobeSleeve} from './fitted-robes.mjs';

const parchment = 0xe8dec6, brass = 0xd2aa62, burgundy = 0x94404a;
const swatches = Object.fromEntries(Object.entries(ITEMS).map(([slot,items]) => [slot,
  Object.fromEntries(items.map(item => [item.id, item.color]))
]));

// These forms all use the same rest pose. +Z is the back, Y is up.
function band(part, color, x,y,z, radius, height, depth=1) {
  part.shape(new THREE.CylinderGeometry(radius,radius,height,16),color,x,y,z,1,1,depth);
}
function line(part,color,a,b,radius,tip=radius) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const step = to.clone().sub(from), length = step.length();
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),step.normalize());
  const euler = new THREE.Euler().setFromQuaternion(orientation);
  const center=from.lerp(to,.5);
  part.shape(new THREE.CylinderGeometry(tip,radius,length,9),color,center.x,center.y,center.z,1,1,1,euler.x,euler.y,euler.z);
}
function patch(part,color,...vertices) { part.shape(tailPatch(vertices),color,0,0,0); }
const shoulders=[[.225,.91],[.256,1.14],[.277,1.222],[.287,1.25],[.263,1.28],[.174,1.314],[.098,1.336],[0,1.336]];
function jacket(part,color,hem=.71,depth=.66,width=1) {
  part.shape(rings([[0,hem],[.215,hem],[.225,hem+.024],...shoulders],24),color,0,0,0,width,1,depth*width);
}
// Fit badges, collar leaves and ties to the actual front of each torso profile.
function front(x,y,depth,width=1,lift=.007) {
  const profile=[[.225,.70],...shoulders.slice(0,-1)];
  const i=profile.findIndex(row=>row[1]>=y),hi=profile[i<0?profile.length-1:i],lo=profile[Math.max(0,(i<0?profile.length-1:i)-1)];
  const t=hi[1]===lo[1]?0:(y-lo[1])/(hi[1]-lo[1]);
  const r=width*THREE.MathUtils.lerp(lo[0],hi[0],t);
  return [x,y,-depth*Math.sqrt(Math.max(0,r*r-x*x))-lift];
}
// Consecutive rows make a curved ribbon, so triangles never cut through the shirt between control points.
function bib(part,color,rows,depth,width=1,lift=.01) {
  for(let i=1;i<rows.length;i++) {
    const [ya,la,ra]=rows[i-1],[yb,lb,rb]=rows[i];
    for(const [a,b] of [[0,.5],[.5,1]]) {
      const A=front(THREE.MathUtils.lerp(la,ra,a),ya,depth,width,lift),B=front(THREE.MathUtils.lerp(la,ra,b),ya,depth,width,lift);
      const C=front(THREE.MathUtils.lerp(lb,rb,a),yb,depth,width,lift),D=front(THREE.MathUtils.lerp(lb,rb,b),yb,depth,width,lift);
      patch(part,color,A,B,C,B,D,C);
    }
  }
}
function shirtCollar(part,depth,width=1,neckwear=false) {
  band(part,0xcfc4ab,0,1.335,0,.11,.031,.79);
  if(neckwear) {
    bib(part,parchment,[[1.33,-.078,.078],[1.313,-.105,.105],[1.282,-.089,.089],[1.25,-.072,.072],[1.22,-.052,.052],[1.18,-.029,.029],[1.14,-.004,.004]],depth,width,.012);
    bib(part,burgundy,[[1.309,-.029,.029],[1.278,-.02,.02],[1.265,-.009,.009],[1.247,-.018,.018],[1.218,-.024,.024],[1.182,-.022,.022],[1.153,-.006,.006]],depth,width,.02);
    line(part,brass,front(-.015,1.214,depth,width,.026),front(.021,1.231,depth,width,.026),.004);
  }
  for(const side of [-1,1]) {
    const rows=[[1.326,.012,.077],[1.310,.006,.102],[1.28,.032,.088],[1.255,.049,.066],[1.246,.059,.060]];
    bib(part,0xf3ead7,rows.map(([y,a,b])=>[y,a*side,b*side]),depth,width,.026);
  }
}
function crest(part,position) {
  const [x,y,z]=position;
  part.oval(brass,x,y,z,.032,.038,.012);
  part.oval(burgundy,x,y+.003,z-.011,.024,.027,.008);
  line(part,brass,[x-.012,y-.008,z-.02],[x+.01,y+.014,z-.02],.004);
}
function topBody(part,id) {
  const color=swatches.top[id];
  if (id==='robe') {
    jacket(part,0x626375,.743,.65,.89); shirtCollar(part,.65,.89,true);
    const rows=[[.342,.48],[.344,.50],[.295,.78],[.247,.98],[.274,1.17],[.301,1.248],[.278,1.28],[.19,1.322],[.118,1.349]];
    const opening=.50,depth=.76;
    const openRobe=new THREE.LatheGeometry(rows.map(([r,y])=>new THREE.Vector2(r,y)),28,Math.PI+opening,Math.PI*2-2*opening);
    part.shape(openRobe,color,0,0,0,1,1,depth);
    for(const side of [-1,1]) {
      const border=(r,y,angle)=>[side*r*Math.sin(angle),y,-r*depth*Math.cos(angle)-.004];
      for(let i=1;i<rows.length;i++) {
        const [r0,y0]=rows[i-1],[r1,y1]=rows[i];
        const a=border(r0,y0,opening),b=border(r0,y0,opening+.10),c=border(r1,y1,opening),d=border(r1,y1,opening+.10);
        patch(part,0x80504d,a,b,c,b,d,c);
      }
    }
    part.oval(burgundy,0,1.348,.035,.127,.034,.111);
    part.oval(burgundy,-.094,1.166,.171,.053,.187,.027,.09,0,-.14);
    for(const y of [1.009,1.052])part.oval(brass,-.115,y,.196,.048,.009,.009,0,0,-.14);
    crest(part,[-.168,1.195,-.181]);
  } else if(id==='jumper') {
    jacket(part,color,.705,.72);
    band(part,0x79373f,0,.738,0,.235,.054,.73);
    band(part,brass,0,.753,0,.237,.014,.73);
    part.oval(0x6f3640,0,1.325,0,.143,.035,.103);
    // The hand-knitted R follows the outward curve of the sweater.
    const r=[[[-.046,1.061,-.188],[-.046,1.199,-.201]],[[-.046,1.199,-.201],[.015,1.199,-.201]],[[.015,1.199,-.201],[.045,1.173,-.201]],[[.045,1.173,-.201],[.037,1.145,-.203]],[[.037,1.145,-.203],[-.04,1.132,-.198]],[[-.005,1.133,-.201],[.05,1.061,-.187]]];
    // Seen from -Z, the model's positive X is the viewer's left.
    for(const [a,b] of r) line(part,parchment,[-a[0],a[1],a[2]],[-b[0],b[1],b[2]],.009);
  } else if(id==='fieldcoat') {
    jacket(part,color,.70,.74);
    line(part,0x303e36,[0,.725,-.17],[0,1.29,-.185],.012);
    for(const s of [-1,1]) {
      part.shape(new THREE.BoxGeometry(.103,.075,.025),0x70816a,s*.11,.89,-.151);
      line(part,brass,[s*.063,.926,-.162],[s*.14,.926,-.149],.006);
      patch(part,0x36483d,[s*.15,1.31,-.117],[s*.022,1.275,-.176],[s*.091,1.16,-.197]);
    }
    for(const y of [.82,.97,1.11,1.24]) part.oval(brass,0,y,-.18,.011,.012,.009);
  } else if(id==='vest') {
    jacket(part,color,.709,.69);
    shirtCollar(part,.69,1,true);
    for(const side of [-1,1]) {
      const rows=[[1.318,.108],[1.28,.088],[1.25,.070],[1.22,.052],[1.18,.028],[1.14,.001]];
      bib(part,brass,rows.map(([y,x])=>[y,side*x,side*(x+.010)]),.69,1,.018);
    }
    band(part,0x424854,0,.730,0,.23,.034,.70);
    band(part,burgundy,0,.749,0,.231,.013,.70);
    crest(part,front(-.127,1.175,.69,1,.011));
  } else {
    jacket(part,color,.76,.66);shirtCollar(part,.66);
    for(const y of [.84,.953,1.062,1.178])part.oval(0x907d60,...front(0,y,.66),.009,.011,.008);
    bib(part,0xc5bca7,[[1.18,-.16,-.088],[1.141,-.161,-.086],[1.125,-.14,-.105]],.66,1,.008);
  }
}
function sleeve(part,id,side) {
  const color=swatches.top[id];
  const lower=id==='robe'?[[0,-.366],[.097,-.365],[.108,-.347],[.078,-.149]]:
    [[0,-.365],[.057,-.364],[.068,-.339],[.075,-.151]];
  const shoulder=[[.084,-.078],[.095,-.016],[.092,.014],[.073,.043],[.038,.060],[0,.064]];
  part.shape(rings([...lower,...shoulder],20),id==='vest'?parchment:color,side*.002,0,0,1,1,.95,0,0,side*.17);
  const cuff=id==='jumper'?0x74323b:id==='fieldcoat'?0x36483d:id==='robe'?0x5b4951:0xb9af99;
  band(part,cuff,side*.06,-.346,0,id==='robe'?.107:.07,id==='robe'?.021:.042,.93);
  if(id==='jumper')band(part,brass,side*.060,-.348,0,.071,.012,.92);
}
function waist(part,id) {
  const rows=[[0,.591],[.063,.596],[.135,.609],[.177,.632],[.195,.657],[.208,.708],[.207,.752],[.188,.772],[0,.772]];
  part.shape(rings(rows,20),swatches.pants[id],0,0,.003,1,1,.70);
  band(part,0x53433d,0,.743,0,.209,.024,.72);
  part.shape(new THREE.BoxGeometry(.044,.021,.010),brass,0,.743,-.149);
}
function trouserLeg(part,id,side) {
  const color=swatches.pants[id];
  const rows=id==='breeches'?[[.053,-.511],[.065,-.492],[.069,-.318],[.110,-.268],[.119,-.12],[.105,.044],[.069,.079]]:
    [[.07,-.534],[.079,-.53],[.077,-.306],[.086,-.187],[.098,.023],[.08,.077]];
  part.shape(rings(rows),color,0,0,0,1,1,.97);
  if(id==='breeches') {
    band(part,0x6a4837,0,-.326,0,.074,.042,.99);
    part.oval(0x876d54,side*.075,-.209,-.047,.04,.098,.038);
  } else if(id==='corduroy') {
    for (const u of [-.049,0,.049]) line(part,0xa27857,[u,-.46,-.064],[u,-.088,-.076],.004);
    band(part,0x71533c,0,-.494,0,.082,.04,.97);
  } else {
    line(part,0x545b65,[0,-.491,-.078],[0,-.117,-.092],.004);
  }
}
function foot(part,id) {
  const color=swatches.shoes[id];
  if(id==='boots') {
    part.shape(rings([[.073,-.57],[.09,-.52],[.082,-.445],[.094,-.317],[.077,-.30]]),color,0,0,.002,1,1,.99);
    for (const y of [-.354,-.435]) {
      band(part,0x47372f,0,y,0,.093,.027,.95);
      part.shape(new THREE.BoxGeometry(.032,.024,.014),brass,.056,y,-.07);
    }
  }
  part.oval(id==='sneakers'?parchment:0x302c2d,0,-.612,-.047,.097,.026,.151);
  part.oval(color,0,-.569,-.051,.093,.062,.145);
  if(id==='sneakers') part.oval(parchment,0,-.583,-.147,.082,.039,.052);
  if(id!=='boots') for(const y of [0,1,2]) line(part,id==='sneakers'?parchment:0x211c1e,[-.034,-.522-y*.006,-.047-y*.022],[.034,-.522-y*.006,-.047-y*.022],.005);
}
function glove(part,id,side,skin) {
  const color=id==='none'?skin:swatches.gloves[id], x=side*.063;
  const wide=id==='keepers'?.076:.063;
  part.oval(color,x,-.405,-.006,wide,.084,.059);
  part.oval(color,x-side*.039,-.400,-.048,.03,.052,.033,0,0,-side*.28);
  if(id==='none') return;
  const cuffColor=id==='garden'?0x99703d:id==='keepers'?0x4d3732:0x703241;
  band(part,cuffColor,x,id==='garden'?-.334:-.35,0,id==='garden'?.086:.079,id==='garden'?.121:.070,.86);
  if(id==='keepers') {
    part.oval(0xb0825e,x+side*.05,-.414,.008,.042,.06,.043);
    band(part,brass,x,-.351,0,.079,.014,.89);
  }
  if(id==='mittens') for(const y of [-.347,-.37]) band(part,parchment,x,y,0,.08,.011,.87);
}
function headwear(part,id) {
  const color=swatches.hat[id];
  if(id==='pointed') {
    part.oval(color,0,.195,0,.299,.025,.257,0,0,-.038);
    part.shape(rings([[.202,0],[.175,.09],[.113,.218],[.05,.288],[.012,.316]],18),color,-.005,.196,.008,1,1,.96,0,0,.20);
    line(part,color,[-.058,.475,.008],[-.137,.486,-.008],.047,.002);
    band(part,0x342d39,-.012,.243,0,.187,.041,.96);
    part.shape(new THREE.BoxGeometry(.064,.036,.014),brass,-.016,.245,-.181);
  } else if(id==='beret') {
    part.oval(color,-.036,.244,.005,.223,.09,.202,0,0,.18);
    band(part,0x344538,0,.2,0,.194,.039,.95);
    part.oval(color,-.048,.321,0,.031,.031,.026);
    part.oval(brass,.112,.226,-.143,.022,.019,.01);
  } else {
    part.oval(color,0,.231,.002,.20,.127,.183);
    band(part,0x693548,0,.198,0,.201,.075,.93);
    for(const y of [.18,.205]) band(part,brass,0,y,0,.202,.013,.94);
    part.oval(parchment,0,.375,0,.068,.063,.064);
  }
}
const wandTips={holly:[.311,-.106,-.212],willow:[.375,-.17,-.24],vine:[.295,-.04,-.223],staff:[.182,.267,-.147]};
// Normalize fitted catalogue grips to the articulated hand's shared grip before aiming.
const fittedGripOffset=new THREE.Vector3(-.001,0,.016);
function heldTip(id){
  const fitted=findFittedItem(id);
  return fitted?new THREE.Vector3(...fittedWandTip(fitted)).add(fittedGripOffset).toArray():wandTips[id];
}
function handProp(part,id) {
  const color=swatches.weapon[id], tip=wandTips[id];
  if(id==='staff') {
    const cap=[.164,.169,-.128];
    line(part,0x70513b,[.021,-.755,.05],cap,.024,.018);
    part.shape(new THREE.OctahedronGeometry(1),color,...tip,.060,.101,.05);
    for(const s of [-1,1]) line(part,brass,cap,[tip[0]+s*.057,tip[1],tip[2]],.014,.006);
  } else {
    const handle=[.065,-.408,-.028], collar=[.125,-.346,-.066];
    line(part,id==='willow'?0x8b654a:0x563e36,handle,collar,.027,.022);
    if(id==='willow') {
      const middle=[.231,-.28,-.149];
      line(part,color,collar,middle,.022,.015); line(part,color,middle,tip,.016,.0025);
      line(part,0xb66951,[.139,-.34,-.08],[.158,-.33,-.088],.022);
    } else {
      line(part,color,collar,tip,.022,.0025);
      if(id==='vine') {
        const begin=new THREE.Vector3(...collar), end=new THREE.Vector3(...tip);
        let last=collar;
        for(let i=1;i<=14;i++) {
          const t=i/14*.67, p=begin.clone().lerp(end,t), r=.019*(1-t);
          p.x+=Math.cos(i*.86)*r; p.z+=Math.sin(i*.86)*r;
          const next=p.toArray();line(part,0xc59761,last,next,.0065);last=next;
        }
      } else part.oval(brass,...collar,.026,.024,.022);
    }
  }
}

export function createOutfit({variant, equipment, body, head, arms, legs, armRigs, legRigs, material, skin, glow}) {
  const meshes=new Map();
  let wandFinish;
  let current={};
  function bake(slot,parent,draw,tag=true,surface=material) {
    const part=costumePart(parent,surface);
    draw(part);
    let mesh=part.finish();
    if(slot==='weapon'){
      const tip=heldTip(current[slot]);
      if(findFittedItem(current[slot]))mesh.geometry.translate(...fittedGripOffset.toArray());
      if(tip)orientHeldProp(mesh.geometry,tip);
    }
    if(tag) mesh.userData.wardrobeSlot=slot;
    mesh.name=`${slot}/${current[slot]}`;
    const ai=arms.indexOf(parent),li=legs.indexOf(parent);
    if(ai>=0&&armRigs)mesh=armRigs[ai].skin(mesh,slot);
    else if(li>=0&&legRigs)mesh=legRigs[li].skin(mesh,slot);
    meshes.get(slot).push(mesh);
  }
  function clear(slot) {
    for(const mesh of meshes.get(slot)||[]) { mesh.removeFromParent();mesh.geometry.dispose(); }
    meshes.set(slot,[]);
  }
  function setEquipment(changes) {
    const next=normalizeEquipment(variant,{...current,...changes});
    for(const [slot,id] of Object.entries(next)) {
      if(current[slot]===id) continue;
      clear(slot); current[slot]=id;
      const fitted = findFittedItem(id);
      if(slot==='top') bake(slot,body,p=>fitted ? drawFittedRobeBody(p,fitted) : topBody(p,id));
      if(slot==='pants') bake(slot,body,p=>waist(p,id));
      if(slot==='hat' && id!=='none') bake(slot,head,p=>headwear(p,id));
      if(slot==='weapon') {
        const tip=heldTip(id);
        if(tip)glow.position.copy(orientHeldProp(null,tip));
        else glow.position.set(.065,-.401,-.07);
        if(armRigs)glow.position.sub(armRigs[1].tipOffset);
        if(fitted) {
          wandFinish ??= new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide});
          wandFinish.roughness=.82-.043*(fitted.tier-1);
          wandFinish.metalness=.018*(fitted.tier-1);
          bake(slot,arms[1],p=>drawFittedWand(p,fitted),true,wandFinish);
        } else if(id!=='none') {
          bake(slot,arms[1],p=>handProp(p,id));
        }
      }
      for(let i=0;i<2;i++) {
        const side=i*2-1;
        if(slot==='top') bake(slot,arms[i],p=>fitted ? drawFittedRobeSleeve(p,fitted,side) : sleeve(p,id,side));
        if(slot==='gloves') bake(slot,arms[i],p=>glove(p,id,side,skin),id!=='none');
        if(slot==='shoes') bake(slot,legs[i],p=>foot(p,id));
        if(slot==='pants') bake(slot,legs[i],p=>trouserLeg(p,id,side));
      }
    }
    return {...current};
  }
  setEquipment(equipment);
  return {setEquipment,dispose(){for(const slot of meshes.keys()) clear(slot);wandFinish?.dispose();}};
}
