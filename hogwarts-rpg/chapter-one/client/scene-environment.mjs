import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createWorld } from '../../world/world.mjs';
import { refineArchitecture } from './scene-architecture.mjs';
import { bindEnvironmentMaterials } from './scene-materials.mjs';
import { buildLake, buildTree, forestFloor, greenhouseDetails } from './scene-landscape.mjs';
import { createCreature } from '../presentation/creatures.mjs';
import { createTrainScenery } from './journey-transition.mjs';
import { refineTowerWalk, refineFlyingField, refineBattleLocation } from './scene-finishing.mjs';

export const SCENE_MAPS = Object.freeze({ SC00: 'sorting', SC01: 'kings-cross', SC02: 'express', SC03: 'lake', SC04: 'sorting', SC05: 'charms', SC06: 'practice-gallery', SC07: 'library-record', SC08: 'practice-gallery', SC09: 'practice-gallery', SC10: 'team-puzzle', SC11: 'trapdoor-return', SC12: 'lake', SC13: 'troll-washroom', SC14: 'team-puzzle', SC15: 'trapdoor-return' });

function atelier(group) {
  const geos = new Map(), materials = new Map(), textures = new Set(), disposables = [];
  let seed = 43112;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function material(color, metal = 0) {
    const id = `${color}:${metal}`;
    if (!materials.has(id)) materials.set(id, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: metal ? .35 : .75 }));
    return materials.get(id);
  }
  function add(geometry, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const object = new THREE.Mesh(geometry, mat?.isMaterial ? mat : material(mat));
    object.position.set(x, y, z); object.rotation.set(rx, ry, rz); object.castShadow = object.receiveShadow = true; group.add(object); return object;
  }
  function box(w, h, d, color, x, y, z, bevel = .02, ry = 0) {
    const key = [w, h, d, bevel].join(':');
    // Millimetre seams and metal inlays never show a rounded silhouette at the
    // gameplay camera. Keep their topology cheap; furniture retains its bevel.
    if (!geos.has(key)) geos.set(key, bevel <= .008 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, w / 4, h / 4, d / 4)));
    return add(geos.get(key), color, x, y, z, 0, ry);
  }
  function cyl(r, h, color, x, y, z, top = r, sides = 20) {
    const key = `c:${r}:${h}:${top}:${sides}`; if (!geos.has(key)) geos.set(key, new THREE.CylinderGeometry(top, r, h, sides)); return add(geos.get(key), color, x, y, z);
  }
  function sphere(r, color, x, y, z, segments = 20, rings = 12) {
    const key = `s:${r}:${segments}:${rings}`; if (!geos.has(key)) geos.set(key, new THREE.SphereGeometry(r, segments, rings)); return add(geos.get(key), color, x, y, z);
  }
  function torus(r, tube, color, x, y, z, rx = 0, ry = 0) {
    const key = `t:${r}:${tube}`; if (!geos.has(key)) geos.set(key, new THREE.TorusGeometry(r, tube, 8, 40)); return add(geos.get(key), color, x, y, z, rx, ry);
  }
  function surface(kind, color) {
    const key = `surface:${kind}:${color}`; if (materials.has(key)) return materials.get(key);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; const c = canvas.getContext('2d');
    c.fillStyle = color; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1600; i++) {
      const x = random() * 512, y = random() * 512;
      c.strokeStyle = i % 2 ? 'rgba(242,222,176,.07)' : 'rgba(30,25,20,.11)'; c.lineWidth = .4 + random(); c.beginPath(); c.moveTo(x, y);
      if (kind === 'wood') c.bezierCurveTo(x + 10, y + (random() - .5) * 12, x + 55, y + (random() - .5) * 10, x + 90 + random() * 90, y + (random() - .5) * 14);
      else c.lineTo(x + 1.5, y + (kind === 'cloth' ? .3 : 1.5));
      c.stroke();
    }
    if (kind === 'grass' || kind === 'earth') {
      // Multi-scale mottling and fine blades/litter replace a flat terrain tint.
      // One small shared tile per environment; no grass geometry or alpha cards.
      for (let i = 0; i < 380; i++) {
        const x = random() * 512, y = random() * 512, r = 2 + random() * 16;
        c.fillStyle = i % 3 ? 'rgba(193,177,116,.035)' : 'rgba(18,27,16,.08)';
        c.beginPath(); c.ellipse(x, y, r * 1.6, r, random() * Math.PI, 0, Math.PI * 2); c.fill();
      }
      for (let i = 0; i < 2600; i++) {
        const x = random() * 512, y = random() * 512;
        c.strokeStyle = i % 3 ? 'rgba(173,170,103,.19)' : 'rgba(28,39,23,.22)'; c.lineWidth = .5 + random() * 1.4;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (random() - .5) * 9, y + 2 + random() * 7); c.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4; textures.add(texture);
    if (kind === 'grass' || kind === 'earth') texture.repeat.set(12, 12);
    const bump = texture.clone(); bump.colorSpace = THREE.NoColorSpace; textures.add(bump);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, bumpMap: bump, bumpScale: kind === 'wood' ? .003 : .0015, roughness: kind === 'leather' ? .68 : ['cloth', 'grass', 'earth'].includes(kind) ? .93 : .56 });
    if (kind === 'wood') mat.userData.environmentSurface = { kind: 'wood', repeat: [1, 1] };
    materials.set(key, mat); return mat;
  }
  function consolidate(target = group) {
    target.updateMatrixWorld(true); const groups = new Map();
    for (const object of [...target.children]) {
      if (!object.isMesh || object.userData.dynamic || object.material.transparent) continue;
      const key = object.geometry.uuid + ':' + object.material.uuid + ':' + object.castShadow;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(object);
    }
    for (const values of groups.values()) if (values.length >= 3) {
      const mesh = new THREE.InstancedMesh(values[0].geometry, values[0].material, values.length);
      values.forEach((object, i) => { object.updateMatrix(); mesh.setMatrixAt(i, object.matrix); object.removeFromParent(); }); mesh.castShadow = values[0].castShadow; mesh.receiveShadow = true; mesh.computeBoundingSphere(); target.add(mesh); disposables.push(mesh);
    }
  }
  function custom(geometry, color, x = 0, y = 0, z = 0) { geos.set(geometry.uuid, geometry); return add(geometry, color, x, y, z); }
  return { box, cyl, sphere, torus, material, surface, random, custom, consolidate, dispose() { disposables.forEach(m => m.dispose()); geos.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.clear(); } };
}

function luggage(a, x, z, angle = 0, stack = false) {
  const leather = a.surface('leather', '#654535'), brass = a.material(0xb89b60, .6), wood = a.surface('wood', '#765238');
  for (const [y, w, h, d] of stack ? [[.32, 1.05, .61, .60], [.88, .78, .45, .45]] : [[.32, 1.05, .61, .60]]) {
    a.box(w, h, d, leather, x, y, z, .055, angle);
    a.box(w + .01, .018, d + .01, wood, x, y + h * .23, z, .008, angle);
    for (const side of [-1, 1]) {
      const px = x + side * w * .31;
      a.box(.065, h + .014, d + .012, 0x3c2d25, px, y, z, .009);
      a.box(.087, .09, .025, brass, px, y + .08, z + d / 2 + .017, .008);
      for (const dx of [-.027, .027]) a.sphere(.012, brass, px + dx, y + .08, z + d / 2 + .034);
    }
    a.torus(.074, .014, brass, x, y + .06, z + d / 2 + .028);
    a.box(.22, .025, .028, leather, x, y + .105, z + d / 2 + .038, .009);
  }
}
function lamp(a, x, y, z) {
  const brass = a.material(0xb99c69, .6), black = a.material(0x253e39, .35);
  a.cyl(.07, y, black, x, y / 2, z); a.cyl(.25, .10, black, x, .05, z); a.cyl(.17, .06, brass, x, y - .18, z);
  const glass = new THREE.MeshStandardMaterial({ color: 0xffdf98, emissive: 0xffc56a, emissiveIntensity: .9, roughness: .3 });
  // Reuse a cached material for all small luminous lantern bodies.
  const glow = a.material(0xffdfa1); glow.emissive.set(0xeac483); glow.emissiveIntensity = .65; glass.dispose();
  a.cyl(.13, .35, glow, x, y + .02, z, .16, 6); a.cyl(.21, .16, black, x, y + .27, z, .04, 6);
  for (const dx of [-.13, .13]) for (const dz of [-.09, .09]) a.box(.018, .39, .018, black, x + dx, y + .015, z + dz, .004);
}
function refinePublicSpace(a, sceneId, walls) {
  const brass = a.material(0xbd9d62, .62), oak = a.surface('wood', '#60432e');
  if (sceneId === 'SC01') {
    luggage(a, -4.2, 1.1, 0, true); luggage(a, 4.3, 5.6); luggage(a, 4.8, -6.3, 0, true);
    for (const [x, z, height] of [[-4.2, 1.1, 1.1], [4.3, 5.6, .65], [4.8, -6.3, 1.1]]) walls.push({ x, z, w: 1.1, d: .65, height });
    for (const x of [-5.4, 5.4]) for (const z of [-7.9, 4.1]) {
      for (const offset of [-.82, -.49, -.16, .17, .50, .83]) {
        a.box(.028, .28, .025, brass, x + offset, .86, z + .245, .006);
        a.sphere(.018, brass, x + offset, .63, z + .29);
      }
      a.box(2.04, .035, .035, oak, x, 1.04, z + .26, .009);
    }
    for (const x of [-8.75, 8.75]) for (const z of [-6, 2, 10]) {
      a.box(.12, 1.45, .13, 0xd2c3a4, x, .72, z, .025);
      a.box(.24, .07, .24, 0xb8aa8c, x, 1.43, z, .015);
      a.torus(.09, .014, brass, x + (x < 0 ? .12 : -.12), 1.05, z, 0, Math.PI / 2);
    }
    lamp(a, -3.15, 2.2, 6.4); lamp(a, 3.15, 2.2, -5.6);
  }
  if (sceneId === 'SC00' || sceneId === 'SC04') {
    for (const x of [-5.3, 5.3]) for (const z of [-6, -1.4, 3.2, 7.8]) {
      for (const dx of [-1.2, -.35, .55, 1.3]) {
        a.cyl(.07, .12, brass, x + dx, 1.03, z + .25, .11, 24);
        a.cyl(.026, .09, brass, x + dx, .94, z + .25); a.cyl(.07, .022, brass, x + dx, .89, z + .25);
        a.box(.035, .015, .21, brass, x + dx + .25, .96, z + .2, .006);
        a.box(.22, .018, .15, 0xddd2b3, x + dx - .2, .97, z + .2, .006);
      }
      a.box(3.72, .025, .045, oak, x, .83, z + .51, .008);
      for (const offset of [-1.65, 1.65]) { a.cyl(.085, .075, brass, x + offset, .15, z + .35); a.torus(.05, .012, brass, x + offset, .57, z + .45); }
    }
    for (const x of [-7.0, 7.0]) for (const z of [-7, -.5, 6]) {
      a.box(.30, .22, .50, 0xa99f86, x, .11, z, .04); a.box(.19, 3.2, .25, 0xb6ab8d, x, 1.75, z, .025);
      a.box(.35, .12, .4, 0xc9bc9e, x, 3.35, z, .02);
      for (const yy of [.55, 1.1, 1.65, 2.2, 2.75]) a.box(.20, .014, .26, 0x8d8776, x, yy, z, .002);
    }
  }
}

function ordinaryKingsCross(a, group, extra) {
  // Keep the authored concourse, 9/10 signs, clock and roof trusses. Its old
  // solid side elevations belonged to a waiting room; opening those bays lets
  // the real platforms and ordinary trains be seen outside the walking area.
  const matrix=new THREE.Matrix4(),local=new THREE.Matrix4(),box=new THREE.Box3();
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
  group.traverse(object=>{
    if(!object.isMesh||!object.visible)return;
    object.geometry.computeBoundingBox();let changed=false;
    for(let index=0;index<(object.isInstancedMesh?object.count:1);index++){
      if(object.isInstancedMesh)object.getMatrixAt(index,matrix);else matrix.identity();
      local.multiplyMatrices(inverse,object.matrixWorld).multiply(matrix);box.copy(object.geometry.boundingBox).applyMatrix4(local);
      const wideSide=Math.abs((box.min.x+box.max.x)/2)>9&&box.max.x-box.min.x<.7&&box.max.z-box.min.z>5&&box.max.y-box.min.y>2;
      const oldDoor=box.min.x>-1.9&&box.max.x<1.9&&box.min.z>-11.8&&box.max.z<-10.2&&box.min.y>-.1&&box.max.y>.2&&box.max.y<5.65&&!['CylinderGeometry','CircleGeometry'].includes(object.geometry.type);
      if(!wideSide&&!oldDoor)continue;
      if(object.isInstancedMesh){object.setMatrixAt(index,new THREE.Matrix4().makeScale(0,0,0));changed=true;}else object.visible=false;
    }
    if(changed){object.instanceMatrix.needsUpdate=true;object.computeBoundingSphere();}
  });
  const brick=a.material(0x9c8571);brick.userData.environmentSurface={kind:'brick',repeat:[17.2,3.95]};
  const barrier=a.box(34.4,7.9,.22,brick,0,3.95,-11.29,.005);barrier.name='KingsCrossEnchantedBrickWall';barrier.userData.magicWall=true;
  const coping=a.material(0xb9b09c);coping.userData.environmentSurface={kind:'stone',repeat:[17.2,.15]};
  a.box(34.5,.24,.36,coping,0,7.82,-11.29,.015);
  // A short mount supports the retained station clock after its false arch is
  // removed. There is deliberately no Hogwarts or 9¾ sign on this side.
  a.box(.12,.12,.72,a.material(0x46554d,.45),0,4.79,-10.8,.008);
  const rail=a.material(0x70787a,.78),iron=a.material(0x33443f,.45),ballast=a.material(0x67685e),timber=a.surface('wood','#655946');
  const trains=[];
  for(const [side,number,color,phase]of[[-1,9,0x3d5867,0],[1,10,0x426557,Math.PI]]){
    const x=side*12.2;
    a.box(6.5,.32,108,ballast,x,-.66,42,.005);
    for(const dx of[-.76,.76]){a.box(.105,.13,108,rail,x+dx,-.36,42,.005);a.box(.20,.06,108,iron,x+dx,-.445,42,.004);}
    for(let z=-11;z<96;z+=.68)a.box(2.5,.11,.20,timber,x,-.49,z,.008);
    a.box(.26,.12,27.5,coping,side*9.25,-.02,2.35,.01);
    a.box(.10,.012,27.5,a.material(0xcdbd77),side*8.85,.012,2.35,.003);
    for(const z of[-8,-1,6,13,20,27,34,41]){
      a.cyl(.09,5.4,iron,side*15.35,2.5,z,.09,12);a.cyl(.18,.13,coping,side*15.35,-.13,z,.18,12);
      const brace=a.box(.10,2.0,.12,iron,side*14.65,4.7,z,.008);brace.rotation.z=side*.65;
    }
    const roof=a.box(7,.14,57,a.material(0x58675d),side*12.0,5.65,17,.008);roof.rotation.z=side*.075;
    const outer=a.material(0x8d8d79);outer.userData.environmentSurface={kind:'brick',repeat:[3,26.5]};
    a.box(.40,5.8,108,outer,side*16.1,2.5,42,.005);
    // Terminus buffer stops, safely beyond the regular walking footprint.
    for(const dx of[-.76,.76]){a.box(.22,.8,.25,iron,x+dx,.03,-10.4,.015);a.box(.55,.15,.55,iron,x+dx,-.26,-10.4,.01);}
    a.box(2.4,.22,.28,a.material(0x6c342b),x,.43,-10.4,.015);

    const train=new THREE.Group();train.name=`OrdinaryPassengerTrain:${number}`;train.userData.dynamic=true;extra.add(train);
    const before=new Set(extra.children),paint=a.material(color,.22),cream=a.material(0xc5c6b5,.16),glass=a.material(0x273d43,.35),rubber=a.material(0x292e2b),roofPaint=a.material(0x59645f,.3);
    glass.roughness=.25;
    for(const center of[-4.2,4.2]){
      a.box(2.82,2.35,7.9,paint,0,1.34,center,.08);a.box(2.90,.36,7.86,cream,0,2.06,center,.035);
      a.box(3.02,.28,8.02,roofPaint,0,2.66,center,.10);a.box(2.55,.30,7.7,iron,0,.10,center,.035);
      for(const sign of[-1,1]){
        for(const z of[-2.1,-.7,.7,2.1]){
          a.box(.045,.93,1.12,glass,sign*1.433,1.98,center+z,.035);
          a.box(.06,.035,1.15,cream,sign*1.46,1.51,center+z,.006);
        }
        for(const z of[-3.2,3.2]){
          a.box(.05,1.91,.68,cream,sign*1.437,1.24,center+z,.02);a.box(.06,.66,.46,glass,sign*1.471,1.87,center+z,.025);
          a.box(.07,.12,.035,iron,sign*1.48,1.1,center+z+.2,.005);a.box(.23,.06,.75,iron,sign*1.43,.24,center+z,.006);
        }
        for(const z of[-2.8,-2.0,2.0,2.8]){
          const wheel=a.cyl(.38,.18,rubber,sign*1.19,-.03,center+z,.38,20);wheel.rotation.z=Math.PI/2;
          const hub=a.cyl(.15,.21,rail,sign*1.19,-.03,center+z,.15,16);hub.rotation.z=Math.PI/2;
        }
        for(const z of[-2.4,2.4])a.box(.12,.32,1.65,iron,sign*1.21,.08,center+z,.035);
      }
      a.box(1.05,.48,7.85,rubber,0,1.40,center,.03);
    }
    a.box(2.75,1.7,.20,cream,0,1.63,-8.18,.07);a.box(2.36,.83,.04,glass,0,2.02,-8.30,.045);
    a.box(.055,.86,.05,cream,0,2.02,-8.33,.005);
    for(const sign of[-1,1]){
      const lamp=a.material(0xffe2a0);lamp.emissive.setHex(0xe7ca82);lamp.emissiveIntensity=.45;
      a.box(.29,.19,.045,lamp,sign*.96,.91,-8.31,.025);
      a.box(.025,.45,.055,iron,sign*.46,1.95,-8.34,.005).rotation.z=-.35;
    }
    a.box(1.1,1.6,.55,rubber,0,1.21,0,.05);
    for(const object of [...extra.children])if(!before.has(object))train.add(object);
    a.consolidate(train);train.position.set(x,0,.5+37*(1-Math.cos(phase)));trains.push({root:train,phase,number});
  }
  // A distant footbridge gives the tracks an ordinary station setting and
  // keeps the arrival/departure turnarounds well beyond the close-up scene.
  a.box(32.5,1.65,3.2,a.material(0x4f6257),0,5.10,30,.025);a.box(33,.18,3.5,iron,0,6.02,30,.015);
  for(let x=-14;x<=14;x+=2)a.box(1.35,.88,.05,a.material(0x91aaa3),x,5.24,28.37,.008);
  extra.userData.ordinaryRailway={platforms:[9,10],trackCenters:[-12.2,12.2],wallZ:-11.4};
  return { update(time){for(const train of trains){const phase=time/50+train.phase;train.root.position.z=.5+37*(1-Math.cos(phase));train.root.userData.speed=.74*Math.sin(phase);}} };
}

function terrain(a, group, kind, showGround = true) {
  const ground = kind === 'forest' ? a.surface('earth', '#4d5540') : kind === 'grass' ? a.surface('grass', '#788462') : a.material(0x8d8b71);
  if (kind === 'stone') ground.userData.environmentSurface = { kind: 'floor', repeat: [18, 18] };
  if (showGround) a.box(36, .2, 36, ground, 0, -.12, -1, .01);
  group.add(new THREE.HemisphereLight(kind === 'forest' ? 0xb7c8d5 : 0xd8e7e2, 0x535c43, 2.0));
  const sun = new THREE.DirectionalLight(kind === 'forest' ? 0xc6d5e6 : 0xffe3b3, kind === 'forest' ? 1.6 : 2.1); sun.position.set(-9, 14, 8); group.add(sun);
}
function pine(a, x, z, scale = 1) {
  a.cyl(.17 * scale, 3.1 * scale, 0x64503d, x, 1.55 * scale, z, .09 * scale, 10);
  for (const [height, radius] of [[2.5, 1.25], [3.2, 1.0], [3.8, .7]]) a.cyl(radius * scale, 1.9 * scale, 0x314f42, x, height * scale, z, .02, 12);
}
function underground(a, questId) {
  const brass = a.material(0xb89a5f, .55);
  if (questId === 'M28') {
    a.box(1.4, .06, 1.4, 0x694e39, -.2, .035, -7, .025);
    for (const x of [-.65, -.2, .25]) a.box(.025, .013, 1.3, brass, x, .073, -7, .003);
    for (const x of [-.28, .28]) a.cyl(.04, 1.15, brass, x - 3.7, .8, -1.8); a.torus(.38, .045, brass, -3.7, 1.3, -1.8);
  } else if (questId === 'M29') {
    for (const x of [-3.3, 3.3]) for (let i = 0; i < 7; i++) { const vine = a.cyl(.055, 2.1 + i * .12, i % 2 ? 0x3e6450 : 0x597346, x + Math.sin(i) * .32, 1.0, -6 + i * 1.6, .08, 8); vine.rotation.z = Math.sin(i * 1.7) * .55; }
    lamp(a, -3.7, 1.4, 1.4); lamp(a, 3.7, 1.4, -3.6);
  } else if (questId === 'M30') {
    for (let i = 0; i < 24; i++) { const x = Math.sin(i * 2.4) * 4.1, z = -3 + Math.cos(i * 1.3) * 4.2, y = 2.3 + i % 5 * .35; a.torus(.08, .016, brass, x, y, z); a.box(.025, .28, .025, brass, x, y - .16, z, .006); for (const sign of [-1, 1]) a.box(.21, .025, .10, 0xbfc9bd, x + sign * .16, y + .04, z, .012, sign * .25); }
  } else if (questId === 'M31') {
    for (let x = -4; x <= 4; x++) for (let z = -6; z <= 2; z++) a.box(.97, .014, .97, (x + z) % 2 ? 0x343e42 : 0xc6c0a5, x, .015, z, .008);
    for (const x of [-3.8, 3.8]) for (const z of [-5, -2, 1]) { a.cyl(.33, .16, x < 0 ? 0xbdb8a6 : 0x48535a, x, .1, z); a.cyl(.14, .85, x < 0 ? 0xc9c1ad : 0x4f5b62, x, .57, z, .23); a.sphere(.23, x < 0 ? 0xc9c1ad : 0x4f5b62, x, 1.15, z); }
  } else if (questId === 'M32') {
    a.box(.20, .18, 2.2, 0x796044, 3.1, .1, -.7, .05, .6);
  } else if (questId === 'M33') {
    a.box(3.3, .13, .9, 0x604938, 0, 1, -7.1, .035);
    for (let i = 0; i < 7; i++) { const color = [0x766378, 0x7d9975, 0xba8c51, 0x71999c, 0x947451, 0x808e58, 0x796b9b][i]; a.cyl(.09 + i % 2 * .03, .25 + i % 3 * .05, color, (i - 3) * .42, 1.2, -7.1, .06); a.cyl(.035, .10, 0xb3996c, (i - 3) * .42, 1.41 + i % 3 * .05, -7.1); }
  } else if (questId === 'M34') {
    a.box(2.0, 3.6, .16, 0x6d959d, 0, 1.8, -7.5, .07);
    for (const x of [-1.05, 1.05]) a.box(.15, 3.85, .3, brass, x, 1.9, -7.45, .03);
    a.box(2.25, .18, .3, brass, 0, 3.78, -7.45, .04); a.torus(.37, .07, brass, 0, 4.0, -7.45);
  }
}

export function createSceneEnvironment(sceneId, group, { questId, combat } = {}) {
  const extra = new THREE.Group(); group.add(extra); const a = atelier(extra); let base = null, walls = [], bounds = [-10, 10, -14, 12], landscape = null;
  let supportingActors = [], currentQuest = questId, dungeonState = null, trainScenery = null, trainElapsed = 0, trainStopped = false, disposed = false, ordinaryRailway = null;
  function support(templateId, position, yaw, scale, action = () => 'idle') {
    const actor = createCreature({ templateId, scale }); actor.root.position.fromArray(position); actor.root.rotation.y = yaw; actor.root.userData.dynamic = true; group.add(actor.root); supportingActors.push({ actor, action });
  }
  function updateSupporting() {
    supportingActors.forEach(({ actor }) => actor.dispose()); supportingActors = [];
    if (combat) return;
    if (sceneId === 'SC14' && currentQuest === 'M28') support('B1-E10', [3.25, 0, -5.0], -.6, .95, () => dungeonState?.flags?.music ? 'sleep' : 'idle');
    if (sceneId === 'SC14' && currentQuest === 'M32') support('B1-E07', [3.1, 0, -3.6], -.6, .75, () => 'downed');
    if (sceneId === 'SC10' && currentQuest === 'M18') support('B1-E08', [3.8, 1.0, -2.5], -.5, 1);
    if (sceneId === 'SC11' && ['M19', 'M20'].includes(currentQuest)) support('B1-E08', [4.2, .8, -3], -.5, 1);
    if (sceneId === 'SC07' && currentQuest === 'M09') support('B1-E04', [0, 1.5, -6], Math.PI, .9);
  }
  if (combat) {
    terrain(a, extra, sceneId === 'SC12' ? 'forest' : sceneId === 'SC09' ? 'grass' : 'stone'); bounds = [combat.arena?.bounds?.minX ?? -14, combat.arena?.bounds?.maxX ?? 14, combat.arena?.bounds?.minZ ?? -14, combat.arena?.bounds?.maxZ ?? 14];
    walls = (combat.arena?.obstacles ?? []).map(o => ({ ...o, height: o.height ?? 3 }));
    const pillarStone = a.material(0x9c9e8c); pillarStone.userData.environmentSurface = { kind: 'stone', repeat: [2, .35] };
    const pillarTrim = a.material(0xb5b39d); pillarTrim.userData.environmentSurface = { kind: 'stone', repeat: [2, .15] };
    for (const o of walls) {
      const r = o.radius ?? .8, heightScale = (o.height ?? 3) / 3;
      for (const [y, h, ratio] of [[.10, .20, 1], [.26, .12, .95], [2.68, .12, .95], [2.87, .26, 1]]) a.cyl(r * ratio, h * heightScale, pillarTrim, o.x, y * heightScale, o.z, r * ratio, 32);
      for (let level = 0; level < 4; level++) a.cyl(r * .86, .558 * heightScale, pillarStone, o.x, (.61 + level * .574) * heightScale, o.z, r * .85, 32);
      for (let flute = 0; flute < 16; flute++) { const angle = flute * Math.PI / 8; a.cyl(.016, 2.18 * heightScale, pillarTrim, o.x + Math.sin(angle) * r * .86, 1.43 * heightScale, o.z + Math.cos(angle) * r * .86, .016, 8); }
    }
    if (sceneId === 'SC12') {
      for (const side of [-1, 1]) for (const z of [bounds[2] + 1, bounds[3] - 1]) buildTree(a, side < 0 ? bounds[0] - 3.5 : bounds[1] + 3.5, z, 6.5, z + side);
    } else for (let i = 0; i < 12; i++) { const angle = i / 12 * Math.PI * 2, x = Math.sin(angle) * 15, z = Math.cos(angle) * 15; a.cyl(.38, 6, pillarStone, x, 3, z, .35, 24); a.cyl(.52, .20, pillarTrim, x, .10, z, .52, 24); a.cyl(.52, .24, pillarTrim, x, 5.9, z, .52, 24); }
    refineBattleLocation(a, sceneId, combat);
    if (combat.kind === 'stone') underground(a, 'M34');
  } else if (['SC03', 'SC08', 'SC09', 'SC11', 'SC12'].includes(sceneId)) {
    if (sceneId === 'SC03') {
      bounds = [-10, 10, -14, 72]; terrain(a, extra, 'forest', false); landscape = buildLake(a, extra, walls);
    } else if (sceneId === 'SC08') {
      terrain(a, extra, 'stone');
      for (const side of [-1, 1]) for (const z of [-8, -4, 0, 4, 8]) {
        a.box(.13, 4.7, .15, 0x526f66, side * 6.3, 2.3, z, .014);
        a.box(2.6, .12, 1.4, 0x725b3e, side * 4.5, 1, z, .035); walls.push({ x: side * 4.5, z, w: 2.6, d: 1.4, height: 1.1 });
        for (let i = -1; i <= 1; i++) { a.cyl(.22, .38, 0x956c51, side * 4.5 + i * .65, 1.25, z, .28); for (let leaf = 0; leaf < 4; leaf++) { const stem = a.cyl(.045, .65, 0x4d7853, side * 4.5 + i * .65 + Math.sin(leaf) * .12, 1.7, z + Math.cos(leaf) * .12, .01, 8); stem.rotation.z = Math.sin(leaf) * .3; } }
      }
      for (const z of [-8, -4, 0, 4, 8]) { const beam = a.box(13.2, .11, .11, 0x729086, 0, 4.7, z, .01); beam.rotation.z = 0; }
      const glass = a.material(0xadcabb); glass.transparent = true; glass.opacity = .19; glass.depthWrite = false;
      for (const side of [-1, 1]) for (const z of [-6, -2, 2, 6]) { const pane = a.box(.025, 4.5, 3.85, glass, side * 6.3, 2.35, z, .002); pane.castShadow = false; }
      greenhouseDetails(a);
    } else if (sceneId === 'SC09') {
      terrain(a, extra, 'grass');
      for (const x of [-7, 7]) for (const z of [-9, -2, 5]) { a.cyl(.065, 5, 0xa28654, x, 2.5, z); a.torus(.7, .055, 0xc3a46a, x, 5.25, z); }
      for (let i = 0; i < 5; i++) { a.box(3.3, .28, .7, 0x7d6750, -7, .2 + i * .35, 8 + i * .5, .02); a.box(3.3, .28, .7, 0x7d6750, 7, .2 + i * .35, 8 + i * .5, .02); }
      refineFlyingField(a);
    } else if (sceneId === 'SC11') {
      terrain(a, extra, 'stone');
      const pier = a.material(0xa7ac9a), pierEdge = a.material(0xc0c2ae);
      pier.userData.environmentSurface = { kind: 'stone', repeat: [.4, .8] };
      pierEdge.userData.environmentSurface = { kind: 'stone', repeat: [.4, .12] };
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2, x = Math.sin(angle) * 10, z = Math.cos(angle) * 12 - 1;
        // Reuse each original footprint: the shaft is inset, while its base
        // and coping retain the same .8 m width and 1.6 m total height.
        a.box(.70, 1.28, .70, pier, x, .8, z, .03, angle);
        a.box(.8, .18, .8, pierEdge, x, .09, z, .025, angle);
        a.box(.8, .14, .8, pierEdge, x, 1.53, z, .025, angle);
      }
      a.box(3.2, .1, 3.2, 0x745a3e, 4.2, .1, -3, .025); luggage(a, 4.2, -3);
      refineTowerWalk(a);
    } else {
      terrain(a, extra, 'forest');
      for (const side of [-1, 1]) for (let i = 0; i < 10; i++) { const x = side * (4.0 + i % 3 * 2.2), z = 10 - i * 2.5; buildTree(a, x, z, 5.8 + i % 3 * .65, i * 2 + (side > 0 ? 1 : 0)); walls.push({ shape: 'circle', x, z, radius: .28, height: 6 }); }
      forestFloor(a);
      for (const z of [3, -.5, -4, -7]) a.box(.12, .013, .32, 0xaebfc0, 1.8, .015, z, .012, .4);
    }
  } else {
    base = createWorld(SCENE_MAPS[sceneId] ?? 'sorting', group); bounds = base.bounds; walls = [...base.walls];
    refinePublicSpace(a, sceneId, walls);
    if (sceneId === 'SC14') underground(a, questId);
    if (sceneId === 'SC10') { a.box(2.1, .2, 1.2, a.surface('wood', '#5b4636'), 3.8, .85, -2.5, .05); a.sphere(.29, 0x988b6b, 3.8, 1.24, -2.5); lamp(a, -3.8, 1.7, -5.5); }
  }
  if (!combat) refineArchitecture(a, group, sceneId);
  if (sceneId === 'SC01' && !combat) ordinaryRailway=ordinaryKingsCross(a,group,extra);
  if (sceneId === 'SC02' && !combat) { trainScenery = createTrainScenery(); group.add(trainScenery.root); }
  a.consolidate();
  updateSupporting();
  let mainSun = false;
  const shadowLights = [], windUniforms = new Set();
  group.traverse(object => {
    if (object.material?.userData.windTime) windUniforms.add(object.material.userData.windTime);
    if (object.isInstancedMesh && !object.material?.userData.environmentSurface) object.castShadow = !object.material?.transparent;
    if (object.isHemisphereLight && ['SC00', 'SC01', 'SC04'].includes(sceneId)) { object.intensity = 1.23; object.groundColor.set(0x888477); }
    if (object.isDirectionalLight && !mainSun) {
      mainSun = true; shadowLights.push(object); object.castShadow = true; object.shadow.mapSize.set(1536, 1536); object.shadow.camera.left = object.shadow.camera.bottom = -13; object.shadow.camera.right = object.shadow.camera.top = 13; object.shadow.camera.near = .5; object.shadow.camera.far = 65; object.shadow.bias = -.00025; object.shadow.normalBias = .018; object.shadow.radius = 3;
    }
  });
  const pbr = typeof window !== 'undefined' && typeof Image !== 'undefined' ? bindEnvironmentMaterials(group) : null;
  return {
    bounds, walls, materialReady: pbr?.ready, spawn: base?.spawn ?? (sceneId === 'SC03' ? [0, 66] : [0, 6]),
    update(dt, time) { if (trainScenery && !trainStopped) trainElapsed += dt; base?.update(dt, trainScenery ? trainElapsed : time); landscape?.update(dt, time); trainScenery?.update(dt); ordinaryRailway?.update(time); windUniforms.forEach(uniform => { uniform.value = time; }); supportingActors.forEach(({ actor, action }) => actor.update(dt, { action: action(), speed: 0, time })); },
    setEscort(escort) { landscape?.setEscort(escort); },
    getBoatPose(role) { return landscape?.getBoatPose?.(role) ?? null; },
    setTrainStopped(value) { trainStopped = Boolean(value); trainScenery?.setStopped(value); },
    setContext(context) { dungeonState = context?.dungeon; if (context?.quest?.id && currentQuest !== context.quest.id) { currentQuest = context.quest.id; updateSupporting(); } },
    dispose() { if (disposed) return; disposed = true; pbr?.dispose(); supportingActors.forEach(({ actor }) => actor.dispose()); supportingActors = []; shadowLights.forEach(light => light.shadow.dispose()); trainScenery?.dispose(); landscape?.dispose(); base?.dispose(); a.dispose(); extra.removeFromParent(); },
  };
}
