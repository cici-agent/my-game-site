import * as THREE from 'three';
import { bindEnvironmentMaterials } from './scene-materials.mjs';

// Persistent, walkable places in the world atlas. Nothing here moves a player,
// chooses a quest, or invents a temporary passage between two scene origins.
const boundsOf = area => {
  const b = area.navigation?.bounds ?? area.bounds ?? [-8, 8, -8, 8];
  return Array.isArray(b) ? b : [b.minX, b.maxX, b.minZ, b.maxZ];
};
const point = p => Array.isArray(p) ? { x: p[0], y: p[1] ?? 0, z: p[2] } : { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 };
const clamp = THREE.MathUtils.clamp;

function art(name) {
  const root = new THREE.Group(); root.name = name;
  const geometries = new Map(), materials = new Map(), textures = new Set(), instances = new Set();
  let disposed = false, binding;
  const geometry = (key, build) => { if (!geometries.has(key)) geometries.set(key, build()); return geometries.get(key); };
  const material = (name, color, kind, repeat = [1, 1], metalness = 0) => {
    if (!materials.has(name)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: metalness ? .48 : .91, metalness }); m.name = name;
      if (kind) { m.userData.environmentSurface = { kind, repeat }; m.userData.atlasMetricUv = true; }
      materials.set(name, m);
    }
    return materials.get(name);
  };
  const stone = material('atlas-stone', 0xa6a99a, 'stone', [.8, .8]);
  const edge = material('atlas-cut-stone', 0xb9bbab, 'stone', [.4, .3]);
  const iron = material('atlas-iron', 0x354b46, null, undefined, .45);
  const brass = material('atlas-brass', 0xb19b6c, null, undefined, .45);
  const wood = material('atlas-oak', 0x8b7153, 'wood', [.7, 1]);
  const glow = material('atlas-lantern', 0xe4c58b); glow.emissive.setHex(0xc9904b); glow.emissiveIntensity = .55;
  function mesh(g, m, p, s = [1, 1, 1]) {
    const o = new THREE.Mesh(g, m); o.position.set(...p); o.scale.set(...s); o.castShadow = o.receiveShadow = true; root.add(o); return o;
  }
  function box(w, h, d, m, x, y, z) { return mesh(geometry('box', () => new THREE.BoxGeometry()), m, [x, y, z], [w, h, d]); }
  function cylinder(r, h, m, x, y, z) { return mesh(geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 20)), m, [x, y, z], [r, h, r]); }
  function ellipsoid(rx, ry, rz, m, x, y, z) { return mesh(geometry('sphere', () => new THREE.SphereGeometry(1, 20, 12)), m, [x, y, z], [rx, ry, rz]); }
  function ring(r, thickness, m, x, y, z) { const o = mesh(geometry(`ring:${r}:${thickness}`, () => new THREE.TorusGeometry(r, thickness, 8, 28)), m, [x,y,z]); o.rotation.x = Math.PI / 2; return o; }
  function beam(a, b, width, m) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.sub(from);
    const o = box(width, delta.length(), width, m, ...from.clone().addScaledVector(delta, .5).toArray()); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return o;
  }
  function floor(x0, x1, z0, z1, y = 0, tile = true) {
    const m = material(tile ? 'atlas-floor' : 'atlas-road', tile ? 0xb1ae98 : 0x8b927d, 'floor', tile ? [.8, .8] : [3, 3]);
    const slab = box(x1 - x0, .16, z1 - z0, m, (x0 + x1) / 2, y - .08, (z0 + z1) / 2); slab.castShadow = false;
    if (tile) {
      const seam = material('atlas-floor-joint', 0x797e70);
      for (let x = x0 + 1.6; x < x1; x += 1.6) box(.014, .002, z1 - z0, seam, x, y + .001, (z0 + z1) / 2).castShadow = false;
      for (let z = z0 + 1.6; z < z1; z += 1.6) box(x1 - x0, .002, .014, seam, (x0 + x1) / 2, y + .001, z).castShadow = false;
    }
  }
  function lantern(x, y, z) {
    cylinder(.065, y, iron, x, y / 2, z); cylinder(.16, .09, brass, x, y - .17, z);
    box(.21, .32, .21, glow, x, y + .03, z); box(.29, .055, .29, iron, x, y + .21, z);
    for (const dx of [-.11, .11]) for (const dz of [-.11, .11]) box(.018, .35, .018, iron, x + dx, y + .03, z + dz);
  }
  function sign(label, x, y, z, width = 2.8, yaw = 0) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#263d36'; ctx.fillRect(0, 0, 768, 128); ctx.strokeStyle = '#bfa775'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 752, 112);
    ctx.font = '500 46px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#efe4c8'; ctx.fillText(label, 384, 66, 720);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const m = material(`sign:${label}`, 0xffffff); m.map = texture;
    const panel = mesh(geometry('sign-plane', () => new THREE.PlaneGeometry(1, 1)), m, [x, y, z], [width, width / 6, 1]); panel.rotation.y = yaw; panel.castShadow = false;
  }
  function finish() {
    const batches = new Map();
    for (const o of [...root.children]) if (o.isMesh && !o.material.transparent && !o.userData.keepSeparate) {
      const key = `${o.geometry.uuid}:${o.material.uuid}:${o.castShadow}`;
      if (!batches.has(key)) batches.set(key, []); batches.get(key).push(o);
    }
    for (const meshes of batches.values()) if (meshes.length > 2) {
      const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
      meshes.forEach((o, i) => { o.updateMatrix(); batch.setMatrixAt(i, o.matrix); o.removeFromParent(); });
      batch.castShadow = meshes[0].castShadow; batch.receiveShadow = true; batch.computeBoundingSphere(); instances.add(batch); root.add(batch);
    }
    if (typeof window !== 'undefined' && typeof Image !== 'undefined') binding = bindEnvironmentMaterials(root);
    const metricUv = () => {
      if(disposed)return;
      const done=new Set();root.traverse(o=>{for(const m of [].concat(o.material??[])) {
        if(!m.userData.atlasMetricUv||done.has(m))continue;done.add(m);
        // Batched unit boxes keep one geometry. UV density follows each instance's
        // metre scale, so an 88 m corridor does not stretch one stone photograph.
        m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
          mat4 atlasTransform = modelMatrix;
          #ifdef USE_INSTANCING
            atlasTransform = modelMatrix * instanceMatrix;
          #endif
          vec3 atlasScale = vec3(length(atlasTransform[0].xyz), length(atlasTransform[1].xyz), length(atlasTransform[2].xyz));
          vec3 atlasFace = abs(normal);
          vec2 atlasUvScale = atlasFace.y > .5 ? atlasScale.xz : (atlasFace.x > .5 ? atlasScale.zy : atlasScale.xy);
          #ifdef USE_MAP
            vMapUv *= atlasUvScale;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv *= atlasUvScale;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv *= atlasUvScale;
          #endif
        `);};m.customProgramCacheKey=()=> 'atlas-metric-uv-v1';m.needsUpdate=true;
      }});
    };
    metricUv();
    return binding?.ready.then(result=>{metricUv();return result;});
  }
  function dispose() { if (disposed) return; disposed = true; binding?.dispose(); instances.forEach(o => o.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.removeFromParent(); root.clear(); }
  return { root, material, box, cylinder, ellipsoid, ring, beam, floor, lantern, sign, finish, dispose, stone, edge, iron, brass, wood, glow };
}

function sideOf(anchor, bounds) {
  const [x0, x1, z0, z1] = bounds;
  return [['west', Math.abs(anchor.x - x0)], ['east', Math.abs(anchor.x - x1)], ['north', Math.abs(anchor.z - z0)], ['south', Math.abs(anchor.z - z1)]].sort((a, b) => a[1] - b[1])[0][0];
}

function enclosingWalls(a, bounds, portals, height = 4.6, ceiling = true) {
  const [x0, x1, z0, z1] = bounds;
  for (const side of ['west', 'east', 'north', 'south']) {
    const vertical = side === 'west' || side === 'east', start = vertical ? z0 : x0, end = vertical ? z1 : x1, fixed = side === 'west' ? x0 : side === 'east' ? x1 : side === 'north' ? z0 : z1;
    const doors = portals.filter(p => p.kind !== 'drop' && sideOf(point(p.anchor), bounds) === side).map(p => {
      const at = point(p.anchor), center = vertical ? at.z : at.x, width = p.width ?? 2.8;
      return [clamp(center - width / 2, start, end), clamp(center + width / 2, start, end)];
    }).sort((a, b) => a[0] - b[0]);
    const wall = (lo, hi, y, h, thickness, mat) => {
      if (hi <= lo) return;
      if (vertical) a.box(thickness, h, hi - lo, mat, fixed, y, (lo + hi) / 2);
      else a.box(hi - lo, h, thickness, mat, (lo + hi) / 2, y, fixed);
    };
    let cursor = start;
    for (const [lo, hi] of [...doors, [end, end]]) {
      wall(cursor, lo, height / 2, height, .30, a.stone); wall(cursor, lo, .16, .32, .36, a.edge);
      if (hi > lo) {
        wall(lo, hi, (height + 3.35) / 2, height - 3.35, .30, a.stone);
        wall(lo - .12, lo, 1.65, 3.3, .40, a.edge); wall(hi, hi + .12, 1.65, 3.3, .40, a.edge);
        wall(lo, hi, 3.36, .16, .42, a.edge);
      }
      cursor = Math.max(cursor, hi);
    }
    wall(start, end, height - .25, .17, .36, a.edge);
  }
  if (ceiling) a.box(x1 - x0 + .3, .18, z1 - z0 + .3, a.stone, (x0 + x1) / 2, height + .09, (z0 + z1) / 2);
}

function indoor(a, area, portals) {
  const b = boundsOf(area), [x0, x1, z0, z1] = b, entrance = /entrance/i.test(area.kind + area.id), height = entrance ? 7.2 : 4.6;
  a.floor(...b); enclosingWalls(a, b, portals, height);
  for (let x = x0 + 3; x < x1; x += 7) {
    for (const z of [z0 + .30, z1 - .30]) {
      if (portals.some(p => Math.abs(point(p.anchor).x - x) < 2 && Math.abs(point(p.anchor).z - z) < 1)) continue;
      a.box(.42, height, .38, a.edge, x, height / 2, z); a.box(.60, .18, .54, a.edge, x, height - .24, z);
      a.lantern(x, 2.55, z + (z < (z0 + z1) / 2 ? .32 : -.32));
    }
    a.box(.18, .21, z1 - z0, a.wood, x, height - .12, (z0 + z1) / 2);
  }
  if (entrance) {
    for (const side of [-1, 1]) {
      a.cylinder(.45, .28, a.edge, side * 8, .14, -7); a.cylinder(.32, 5.6, a.stone, side * 8, 3.0, -7); a.cylinder(.54, .25, a.edge, side * 8, 5.92, -7);
      const red = a.material('entrance-banner', 0x783a32); a.box(.90, 2.6, .035, red, side * 7.5, 4.5, -11.77);
      a.box(1.04, .045, .10, a.brass, side * 7.5, 5.82, -11.72);
    }
    a.sign('HOGWARTS', 0, 5.2, -11.78, 5.1);
  }
  if(/^CORRIDOR_[G123]$/.test(area.id)) {
    // The atlas rises ten metres per storey. Close the structural space above
    // the 4.6 m interior ceiling so distant floors cannot read as floating slabs.
    for(const x of[x0,x1])a.box(.30,5.4,z1-z0,a.stone,x,7.3,(z0+z1)/2);
    for(const z of[z0,z1])a.box(x1-x0,5.4,.30,a.stone,(x0+x1)/2,7.3,z);
    a.box(x1-x0+.3,.16,z1-z0+.3,a.stone,(x0+x1)/2,9.92,(z0+z1)/2);
    for(const z of[z0-.02,z1+.02])a.box(x1-x0,.18,.35,a.edge,(x0+x1)/2,9.75,z);
    if(area.id==='CORRIDOR_3') {
      // Its east extension stands over an open campus archway, while the
      // original ground-floor east exit stays clear below the 3.4 m soffit.
      for(const z of[z0,z1])a.box(16,26.6,.30,a.stone,52,-13.3,z);
      a.box(.30,26.6,z1-z0,a.stone,60,-13.3,(z0+z1)/2);
      for(const z of[z0+.65,z1-.65])a.beam([43,-26.5,z],[58,-2,z],.8,a.edge);
    }
  }
}

function upperWingSupport(a,area) {
  if(!['GRYFFINDOR','MIRROR_ROOM'].includes(area.id))return;
  const [x0,x1,z0,z1]=boundsOf(area),groundClearance=3.4,height=area.origin.y-groundClearance;
  // The roads below these wings are deliberate open arcades. Loads return to
  // the existing corridor masonry through flying buttresses above head height;
  // no new columns or walls are placed in ground navigation.
  for(const x of[x0,x1])a.box(.30,height,z1-z0,a.stone,x,-height/2,(z0+z1)/2);
  a.box(x1-x0,height,.30,a.stone,(x0+x1)/2,-height/2,z1);
  for(const x of[x0+.8,x1-.8])a.beam([x,3.5-area.origin.y,z0-.15],[x,-1.1,z1-.35],.72,a.edge);
  for(let worldY=7.3;worldY<area.origin.y;worldY+=10) {
    for(const x of[-4,0,4]) {
      a.box(1.0,2.0,.05,a.iron,x,worldY-area.origin.y,z1+.17);
      a.box(1.20,.12,.25,a.edge,x,worldY-area.origin.y-1.04,z1+.20);
      a.box(.055,2.02,.09,a.brass,x,worldY-area.origin.y,z1+.21);
    }
    a.box(x1-x0,.15,.38,a.edge,(x0+x1)/2,worldY-area.origin.y+2.2,z1);
  }
}

function towerSupport(a,area) {
  const floor=area.origin.y;
  // This tower sits on the real entrance-hall footprint. Its rear stays open
  // to the shared corridors/stair landings, so no new wall crosses those paths.
  const height=floor-7.2,zSouth=12,xEdge=10;
  a.box(20,height,.32,a.stone,0,-height/2,zSouth);
  for(const x of[-xEdge,xEdge])a.box(.32,height,15.6,a.stone,x,-height/2,4.2);
  for(const y of[10,20,30]) {
    for(const x of[-6,0,6]) {
      a.box(1.15,2.4,.06,a.iron,x,y-floor+3.4,zSouth+.18);
      a.box(1.40,.14,.24,a.edge,x,y-floor+2.15,zSouth+.20);
      a.box(.07,2.42,.10,a.brass,x,y-floor+3.4,zSouth+.22);
    }
    a.box(20.4,.20,.50,a.edge,0,y-floor,zSouth);
  }
}

function stairs(a, area, portals) {
  const b = boundsOf(area), height = Math.max(10, ...portals.map(p => point(p.anchor).y));
  const half = height / 2, run = 18, steps = 30;
  // The collision height function uses the same two U-shaped runs and landing.
  for (let i = 0; i < steps; i++) {
    const z = 9 - (i + .5) * run / steps, y = (i + 1) * half / steps;
    a.box(3, y, run / steps + .012, a.stone, -3.5, y / 2, z);
    a.box(3, .035, run / steps + .02, a.edge, -3.5, y + .0175, z);
    const upperY = half + (i + 1) * half / steps;
    a.box(3, .22, run / steps + .012, a.stone, 3.5, upperY - .11, -z);
    a.box(3, .035, run / steps + .02, a.edge, 3.5, upperY + .0175, -z);
  }
  const topCenterDoor = area.id === 'STAIR_3T', split = topCenterDoor ? -1.6 : 0;
  a.floor(-7, split, 9, 12.9, 0); a.floor(-7, 7, -12, -9, half); a.floor(split, 7, 9, 12.9, height);
  // The shared authority floor covers each whole flight, including its sides.
  // Keep those sides supported; otherwise a player can visibly walk on air.
  for (let i = 0; i < steps; i++) {
    const z = 9 - (i + .5) * run / steps, y = (i + 1) * half / steps;
    for (const [x,width] of [[-6,2],[-1.5,3]]) a.box(width,.18,run/steps+.012,a.stone,x,y-.09,z);
    for (const [x,width] of [[1,2],[6,2]]) a.box(width,.18,run/steps+.012,a.stone,x,half+y-.09,-z);
  }
  a.box(.30, height + 1.0, topCenterDoor ? 18 : 21.9, a.stone, 0, (height + 1) / 2, topCenterDoor ? 0 : 1.95);
  if(topCenterDoor) a.box(.24, height + .9, 3.9, a.stone, -1.6, (height + .9)/2, 10.95);
  for (const side of [-1, 1]) {
    const x = side * 5.05, loY = side < 0 ? 0 : half, fromZ = side < 0 ? 9 : -9, toZ = -fromZ;
    a.beam([x, loY + 1, fromZ], [x, loY + half + 1, toZ], .065, a.wood);
    for (let i = 0; i <= 10; i++) { const t = i / 10; a.cylinder(.025, 1, a.iron, x, loY + t * half + .5, fromZ + (toZ - fromZ) * t); }
  }
  for (const x of [-7.15, 7.15]) a.box(.30, height + 4, 24.3, a.stone, x, (height + 4) / 2, 0);
  a.box(14.6, height + 4, .30, a.stone, 0, (height + 4) / 2, -12.15);
  for (const x of [-6.5, 6.5]) a.lantern(x, half + 2.5, -11.3);
  a.sign(area.name ?? 'GRAND STAIRCASE', 0, half + 2.2, -11.97, 4.8);
}

function station(a, area, portals) {
  const [x0, x1, z0, z1] = boundsOf(area), hogsmeade = /hogsmeade/i.test(area.id), mat = a.material('railway-crimson', 0x713c35);
  a.floor(x0, x1, z0, z1); a.box(x1 - x0, .45, z1 - z0, a.stone, (x0 + x1) / 2, -.30, (z0 + z1) / 2);
  // Track trough is alongside the platform, never across the walking route.
  const trainSide = hogsmeade ? -1 : 1, railX = trainSide < 0 ? x0 - 3.2 : x1 + 3.2;
  const trackStart=Math.min(z0-10,-49),trackEnd=z1+6;
  a.box(7, .25, trackEnd-trackStart, a.material('ballast', 0x505b50), railX, -.85, (trackStart+trackEnd)/2);
  for (const dx of [-2.35, 2.35]) a.box(.10, .14, trackEnd-trackStart, a.iron, railX + dx, -.65, (trackStart+trackEnd)/2);
  for (let z = trackStart; z < trackEnd; z += .85) a.box(5.2, .12, .24, a.wood, railX, -.74, z);
  const edgeX = trainSide < 0 ? x0 + .16 : x1 - .16;
  a.box(.14, .018, z1 - z0, a.edge, edgeX, .009, (z0 + z1) / 2).castShadow = false;
  const canopyX = trainSide < 0 ? x1 - 2 : x0 + 2;
  for (let z = z0 + 2; z < z1 - 1; z += 6) {
    a.cylinder(.09, 4.6, a.iron, canopyX, 2.3, z); a.cylinder(.18, .12, a.brass, canopyX, .10, z);
    a.beam([canopyX, 3.5, z], [canopyX + trainSide * 3.6, 4.5, z], .12, a.iron);
    a.lantern(canopyX - trainSide * .5, 2.7, z + .3);
  }
  a.box(8, .18, z1 - z0 + 1, a.wood, canopyX + trainSide * 2.5, 4.67, (z0 + z1) / 2);
  // A low station building on the landward edge gives the platform a place,
  // with benches under a canopy rather than a corridor hovering in empty space.
  const buildingX = trainSide < 0 ? x1 + 1.1 : x0 - 1.1;
  a.box(2.2, 3.7, 8, mat, buildingX, 1.85, z1 - 5); a.box(2.6, .18, 8.4, a.iron, buildingX, 3.8, z1 - 5);
  for (const z of [z1 - 7, z1 - 4]) { a.box(.04, 1.2, 1.15, a.glow, buildingX + trainSide * 1.13, 2.0, z); a.box(.04, .045, 1.2, a.brass, buildingX + trainSide * 1.16, 2.0, z); }
  const brick=a.material('station-red-brick',0xa7927c,'brick',[.55,.55]),mortar=a.material('station-masonry-edge',0xb3ad95,'stone',[.5,.5]),canopy=a.material('station-roof',0x4b6157);
  const landward=trainSide<0?x1+.45:x0-.45,trackBack=trainSide<0?railX-4:railX+4;
  for(const x of [landward,trackBack]) {
    const doors=portals.filter(p=>p.kind==='walk'&&Math.abs(point(p.anchor).x-x)<2).map(p=>[point(p.anchor).z-1.6,point(p.anchor).z+1.6]).sort((a,b)=>a[0]-b[0]);
    let cursor=z0-.5;
    for(const [lo,hi]of [...doors,[z1+.5,z1+.5]]) {
      if(lo>cursor) {
        a.box(.45,6.4,lo-cursor,brick,x,3.2,(cursor+lo)/2);
        for(const y of [.20,1.0,5.8,6.36])a.box(.59,.15,lo-cursor,mortar,x,y,(cursor+lo)/2);
      }
      if(hi>lo)a.box(.45,3.05,hi-lo,brick,x,4.875,(lo+hi)/2);
      cursor=Math.max(cursor,hi);
    }
    for(let z=z0+1;z<z1;z+=5.5) {if(doors.some(([lo,hi])=>z>lo-.5&&z<hi+.5))continue;a.box(.62,6.45,.52,mortar,x,3.22,z);a.box(.85,.22,.78,mortar,x,6.47,z);}
  }
  if(!hogsmeade) {
    a.box(x1-x0,.45,.62,mortar,(x0+x1)/2,.23,z0-.3);
    a.box(x1-x0,6.2,.45,brick,(x0+x1)/2,3.1,z0-.35);
    for(const x of [x0+3,(x0+x1)/2,x1-3]) {a.box(2.2,2.25,.06,a.iron,x,3.45,z0-.10);a.box(.06,2.25,.10,mortar,x,3.45,z0-.05);a.box(2.2,.06,.10,mortar,x,3.45,z0-.05);}
  }
  const roofLeft=Math.min(landward,trackBack),roofRight=Math.max(landward,trackBack),ridge=(roofLeft+roofRight)/2,run=(roofRight-roofLeft)/2,rise=2.1,roofLength=z1-z0+2;
  for(const side of[-1,1]) {
    const panel=a.box(Math.hypot(run,rise),.14,roofLength,canopy,ridge+side*run/2,6.2+rise/2,(z0+z1)/2);panel.rotation.z=-side*Math.atan2(rise,run);
  }
  for(let z=z0+2;z<z1;z+=7) {
    for(const x of [x0+.7,x1-.7]) {
      // Posts stay away from the side door at z0 of each platform.
      if(portals.some(p=>Math.abs(point(p.anchor).x-x)<2&&Math.abs(point(p.anchor).z-z)<2))continue;
      a.cylinder(.12,6.2,a.iron,x,3.1,z);a.cylinder(.23,.15,mortar,x,.075,z);
    }
    a.beam([roofLeft,6.10,z],[roofRight,6.10,z],.13,a.iron);
    a.beam([roofLeft,6.1,z],[ridge,8.2,z],.14,a.iron);a.beam([roofRight,6.1,z],[ridge,8.2,z],.14,a.iron);
    for(const side of[-1,1])a.beam([ridge,6.1,z],[ridge+side*run*.56,7.0,z],.08,a.iron);
  }
  const signX=(x0+x1)/2,signZ=Math.min(6,z1-3),signY=3.9;
  a.box(4.7,.85,.12,a.iron,signX,signY,signZ);
  for(const dx of[-1.65,1.65])a.cylinder(.025,2.0,a.iron,signX+dx,5.29,signZ);
  a.sign(hogsmeade ? 'HOGSMEADE' : '9¾  HOGWARTS EXPRESS',signX,signY,signZ+.071,4.4);
  // The coach extends beyond the arrival platform. Solid ground under its front
  // bogie and locomotive removes the previous floating cut-off carriage view.
  const earth=a.material('railway-yard-earth',0x777b67);
  a.box(Math.abs(trackBack-landward)+6,.45,trackEnd-trackStart,earth,(trackBack+landward)/2,-1.10,(trackStart+trackEnd)/2).castShadow=false;
  for(const portal of portals.filter(portal=>portal.magicWall)){
    const at=point(portal.anchor),wall=a.box(34.4,7.9,.22,brick,at.x,3.95,at.z-.11);
    wall.name='HiddenPlatformEnchantedBrickWall';wall.userData.magicWall=true;wall.userData.keepSeparate=true;
    a.box(34.5,.24,.36,mortar,at.x,7.82,at.z-.11);
  }
}

const subtract = (r, cut) => {
  const [x0, x1, z0, z1] = r, a = Math.max(x0, cut[0]), b = Math.min(x1, cut[1]), c = Math.max(z0, cut[2]), d = Math.min(z1, cut[3]);
  if (a >= b || c >= d) return [r];
  return [[x0, a, z0, z1], [b, x1, z0, z1], [a, b, z0, c], [a, b, d, z1]].filter(r => r[1] - r[0] > .01 && r[3] - r[2] > .01);
};
function grounds(a, area, portals) {
  const grass = a.material('campus-earth', 0x73806a), paths = a.material('campus-gravel', 0xa0a18b, 'floor', [12, 2]);
  // Preserve the lake and station track trough. The existing lake surface is
  // bounded to this basin by openRegionPortals; no campus road covers the water.
  let patches = [boundsOf(area)];
  for (const cut of [[-52, 52, 28, 114], [-22, 13, 114, 158], [-10.2, 10.2, -12.2, 12.2], [-44.2, 44.2, -20.2, -11.8], [-7.3, 7.3, -44.3, -19.8], [17.3, 34.7, -47, -19.8], [-33.5, -18.5, -45.5, -19.8]]) patches = patches.flatMap(r => subtract(r, cut));
  for (const [x0, x1, z0, z1] of patches) a.box(x1 - x0, .30, z1 - z0, grass, (x0 + x1) / 2, -.19, (z0 + z1) / 2).castShadow = false;
  const road = (from, to, width = 4.2) => {
    const dx = to[0] - from[0], dz = to[1] - from[1], o = a.box(width, .035, Math.hypot(dx, dz), paths, (from[0] + to[0]) / 2, -.0125, (from[1] + to[1]) / 2); o.rotation.y = Math.atan2(dx, dz); o.castShadow = false;
  };
  for (const line of [ [[-10,0],[-42,0],[-60,18],[-76,18]], [[10,0],[44,0],[66,10]], [[-44,-16],[-48,-28],[-60,-37.4]], [[-60,-37.4],[-74,-50],[-74,-72],[-88,-80]], [[-26,-45.29],[-48,-45.29],[-60,-37.4]], [[44,-16],[48,-10],[66,10]] ]) for (let i = 1; i < line.length; i++) road(line[i - 1], line[i]);
  for (const [x,z] of [[-16,3],[-40,3],[16,3],[40,3],[-49,-24],[-68,-44],[54,6]]) a.lantern(x, 3.2, z);
  for (const p of portals) { const at = point(p.anchor); a.floor(at.x - 1.6, at.x + 1.6, at.z - 1, at.z + 1, -.005, false); }
}

function lakeshore(a) {
  const earth = a.material('lakeshore-earth',0x68785d), stone = a.material('shore-boulder',0x737b70,'stone',[.7,.7]);
  for(const [x0,x1,z0,z1] of [[11,61,139,145],[55,61,17,145],[21,61,17,23]]) {
    a.box(x1-x0+4,.75,z1-z0+4,earth,(x0+x1)/2,-.405,(z0+z1)/2).castShadow=false;
    a.floor(x0,x1,z0,z1,0,false);
  }
  for(const z of [25,41,57,73,89,105,121,137]) {
    a.lantern(60.2,3.0,z);
    for(const dz of [-1.2,.8]) a.ellipsoid(.7,.55,.9,stone,53.5,-.1,z+dz);
  }
  a.sign('HOGWARTS  ·  HOGSMEADE',57.9,2.8,134,4.8);
}

function specialRoom(a, area) {
  const red=a.material('gryffindor-velvet',0x7c3833), dark=a.material('hearth-dark',0x252d2a), ceramic=a.material('potion-stoneware',0x667f72);
  if(area.id==='POTIONS') {
    // Two working benches leave the central lesson and interaction aisle clear.
    for(const x of [-4.7,4.7]) for(const z of [-6,1,7]) {
      a.box(2.7,.18,1.7,a.wood,x,1.05,z);
      for(const dx of [-1.12,1.12]) for(const dz of [-.6,.6]) a.box(.13,1,.13,a.iron,x+dx,.5,z+dz);
      a.ellipsoid(.46,.37,.46,a.iron,x,1.49,z); a.cylinder(.35,.03,dark,x,1.80,z); a.ring(.39,.055,a.iron,x,1.81,z);
      for(const dx of [-.85,.80]) { a.cylinder(.12,.32,ceramic,x+dx,1.31,z-.30); a.cylinder(.055,.17,a.brass,x+dx,1.55,z-.30); }
    }
    for(const x of [-5.7,5.7]) {
      a.box(2.6,3.3,.30,a.wood,x,1.65,-12.9);
      for(const y of [.65,1.4,2.15,2.9]) { a.box(2.6,.07,.55,a.wood,x,y,-12.65); for(let i=0;i<5;i++) a.cylinder(.12,.30,ceramic,x-1+i*.50,y+.18,-12.65); }
    }
    a.sign('POTIONS CLASSROOM',0,3.2,-13.8,4.6);
  } else if(area.id==='GRYFFINDOR') {
    // The fireplace is shallow masonry against the far wall, not a solid block.
    for(const x of [-1.45,1.45]) a.box(.48,2.2,.7,a.edge,x,1.1,12.8);
    a.box(3.5,.28,.94,a.edge,0,2.34,12.8); a.box(2.4,1.95,.04,dark,0,.98,13.18);
    for(const x of [-.65,0,.65]) { const log=a.cylinder(.13,1.45,a.wood,x,.25,12.85);log.rotation.z=Math.PI/2; a.ellipsoid(.16,.42,.13,a.glow,x,.48,12.75); }
    a.box(6.8,.025,5.2,red,0,.013,8.4);
    for(const x of [-4.5,4.5]) for(const z of [5,9.4]) {
      a.box(1.25,.33,1.1,red,x,.55,z); a.box(1.25,1.1,.28,red,x,1.0,z+.50);
      for(const dx of [-.56,.56]) a.box(.18,.63,1.15,a.wood,x+dx,.80,z);
    }
    a.box(2.3,.10,1.3,a.wood,0,.64,7.4); for(const x of [-.9,.9]) for(const z of [6.95,7.85])a.box(.10,.60,.10,a.wood,x,.30,z);
    // Portrait beside the entrance preserves a clear doorway for returning home.
    a.box(1.65,2.1,.12,a.brass,3.2,2.0,-13.95); a.box(1.44,1.89,.05,red,3.2,2.0,-13.86);
    const skin=a.material('portrait-paint',0xba9974);a.ellipsoid(.29,.36,.025,skin,3.2,2.33,-13.81);a.ellipsoid(.57,.52,.025,a.material('portrait-gown',0x597663),3.2,1.72,-13.81);
    a.sign('GRYFFINDOR COMMON ROOM',0,3.5,-13.85,5.2,Math.PI);
  } else if(area.id==='MIRROR_ROOM') {
    const silver=a.material('erised-silver',0x9ebbc2,null,undefined,.86);silver.roughness=.16;
    a.box(2.5,3.8,.10,silver,0,2.12,8.9);
    for(const x of [-1.4,1.4]) { a.box(.22,4.3,.28,a.brass,x,2.15,8.95);a.cylinder(.17,.13,a.brass,x,4.37,8.95);a.box(.42,.18,.90,a.wood,x,.09,8.95); }
    a.box(3.02,.23,.28,a.brass,0,4.2,8.95);a.box(3.02,.16,.28,a.brass,0,.15,8.95);
    a.sign('ER ISED  ·  STRA EH',0,4.6,8.78,3.2,Math.PI);
    for(const x of [-5.6,5.6]) for(const z of [4,8]) { a.box(1.8,.12,.8,a.wood,x,.85,z); for(const dx of [-.7,.7])a.box(.1,.8,.1,a.wood,x+dx,.4,z); }
  }
}

export function createAtlasEnvironment(area, { portals = [] } = {}) {
  const a = art(`AtlasEnvironment:${area.id}`), kind = `${area.kind ?? ''}:${area.id}`.toLowerCase(), b = boundsOf(area);
  if (/stair/.test(kind)) stairs(a, area, portals);
  else if (/platform|station/.test(kind)) station(a, area, portals);
  else if (/grounds/.test(kind)) grounds(a, area, portals);
  else if (/lakeshore/.test(kind)) lakeshore(a);
  else if (/forecourt|arrival|road/.test(kind)) {
    a.floor(...b, 0, false);
    const earth = a.material('shore-earth', 0x6d795e); a.box(b[1] - b[0] + 8, .60, b[3] - b[2], earth, (b[0] + b[1]) / 2, -.33, (b[2] + b[3]) / 2);
    for (const x of [b[0] - .5, b[1] + .5]) for (const z of [b[2] + 2, b[3] - 2]) a.lantern(x, 3.0, z);
    if (/forecourt/.test(kind)) {
      for (const x of [b[0] - 1.2, b[1] + 1.2]) { a.cylinder(1.1, 7, a.stone, x, 3.5, b[2] + 1); a.cylinder(1.2, .20, a.edge, x, 7.1, b[2] + 1); }
    }
  } else { indoor(a, area, portals); specialRoom(a,area); upperWingSupport(a,area); }
  const sky = new THREE.HemisphereLight(0xd6dfd5, 0x6f7565, 2.0), sun = new THREE.DirectionalLight(0xffe4bb, 1.8); sun.position.set(-9, 14, 8); a.root.add(sky, sun, sun.target);
  const materialReady = a.finish();
  return { root: a.root, bounds: b, walls: area.navigation?.walls ?? [], spawn: area.spawn, materialReady, update() {}, dispose: a.dispose };
}

// Room-side navigation aprons occupy existing flooring between the old gameplay
// bounds and its actual architectural door. The atlas owns their wall exclusions.
export function getPortalNavigation(area, portals = []) {
  const bounds = [...boundsOf(area)], walls = [...(area.navigation?.walls ?? [])];
  return { bounds, walls };
}

function trainExterior(a, portals) {
  const red = a.material('carriage-crimson', 0x7d3e35), cream = a.material('carriage-window-wood', 0xb5a079), roof = a.material('carriage-roof', 0x37443e);
  a.box(6.4,.16,3.7,a.wood,0,-.07,15.65).castShadow=false;
  for (const x of [-3.18, 3.18]) {
    a.box(.16, 1.15, 28, red, x, .575, 0); a.box(.18, .55, 28, red, x, 3.25, 0);
    a.box(.18, .09, 28, a.brass, x, 1.18, 0); a.box(.16, .065, 28, a.brass, x, 2.95, 0);
    for (let z = -12.6; z < 13; z += 3.25) a.box(.18, 1.7, .16, cream, x, 2.02, z);
  }
  const vestibule = [-3.2, 3.2, 14, 17.4], doors = portals.filter(p => Math.abs(point(p.anchor).x) > 2.5 && point(p.anchor).z > 13);
  // The inside face at z14 joins the original coach floor; it is not a wall.
  enclosingWalls({...a,stone:red,edge:cream}, vestibule, [...doors, { anchor: { x: 0, y: 0, z: 14 }, width: 6.4 }], 3.55);
  a.box(6.65, .22, 31.5, roof, 0, 3.79, 1.65);
  a.box(5.9, .30, 31.5, a.iron, 0, -.28, 1.65);
  for (const x of [-2.35, 2.35]) for (const z of [-10, 10]) { const wheel = a.cylinder(.58, .24, a.iron, x, 0, z); wheel.rotation.z = Math.PI / 2; a.cylinder(.18, .26, a.brass, x, 0, z).rotation.z = Math.PI / 2; }
  // One connected locomotive provides a readable train silhouette from the
  // platform, including its smokebox, cab, driving wheels and connecting rods.
  const engine=a.material('engine-iron',0x273731,null,undefined,.4);
  a.box(4.9,.30,12,engine,0,-.18,-20.1);
  const boiler=a.cylinder(1.35,7.5,red,0,1.52,-21.0);boiler.rotation.x=Math.PI/2;
  for(const z of[-18.3,-21,-23.7]){const band=a.ring(1.36,.055,a.brass,0,1.52,z);band.rotation.x=0;}
  const front=a.cylinder(1.38,.24,engine,0,1.52,-24.84);front.rotation.x=Math.PI/2;
  a.cylinder(.42,1.25,engine,0,3.10,-23.3);a.cylinder(.55,.12,engine,0,3.76,-23.3);
  a.box(4.7,3.2,2.8,red,0,1.60,-16.25);a.box(5.15,.20,3.05,engine,0,3.30,-16.25);
  for(const x of[-2.37,2.37]) {a.box(.05,1.1,1.55,a.iron,x,2.23,-16.35);a.box(.06,.055,1.6,a.brass,x,2.23,-16.35);}
  for(const x of[-2.35,2.35])for(const z of[-18.8,-21.0,-23.2]) {
    const wheel=a.cylinder(.64,.26,engine,x,.02,z);wheel.rotation.z=Math.PI/2;
    const hub=a.cylinder(.19,.30,a.brass,x,.02,z);hub.rotation.z=Math.PI/2;
  }
  for(const x of[-2.52,2.52])a.beam([x,.15,-18.8],[x,.15,-23.2],.13,a.brass);
  for(const x of[-1.65,1.65])a.cylinder(.22,.40,engine,x,.14,-26.10).rotation.x=Math.PI/2;
  candyTrolley(a);
}

function candyTrolley(a) {
  const x=2.05,z=2.55, paper=a.material('trolley-paper',0xd6c5a0),plum=a.material('trolley-plum',0x73577d),green=a.material('trolley-green',0x6d8c73),rose=a.material('trolley-rose',0xc68e86);
  for(const y of [.35,.91]) {
    a.box(1.1,.06,.65,a.wood,x,y,z);
    for(const dz of [-.31,.31])a.box(1.1,.10,.04,a.wood,x,y+.07,z+dz);
    for(const dx of [-.53,.53])a.box(.04,.10,.65,a.wood,x+dx,y+.07,z);
  }
  for(const dx of [-.48,.48])for(const dz of [-.26,.26]) {
    a.cylinder(.025,.72,a.brass,x+dx,.59,z+dz);
    const wheel=a.cylinder(.14,.06,a.iron,x+dx,.15,z+dz);wheel.rotation.z=Math.PI/2;
    const hub=a.cylinder(.065,.068,a.brass,x+dx,.15,z+dz);hub.rotation.z=Math.PI/2;
  }
  a.beam([x+.51,.94,z+.28],[x+.68,1.10,z+.28],.035,a.brass);
  a.beam([x+.51,.94,z-.28],[x+.68,1.10,z-.28],.035,a.brass);
  a.beam([x+.68,1.10,z-.28],[x+.68,1.10,z+.28],.035,a.brass);
  for(let i=0;i<3;i++)for(let j=0;j<2;j++) {
    const px=x-.35+i*.27,pz=z-.16+j*.28,y=.49+j*.02,m=[paper,plum,green][i];
    a.box(.23,.17,.22,m,px,y,pz);a.box(.035,.174,.224,a.brass,px,y,pz);
  }
  const glass=a.material('trolley-glass',0xc8e2d5);glass.transparent=true;glass.opacity=.42;glass.roughness=.12;glass.depthWrite=false;
  for(let i=0;i<3;i++) {
    const px=x-.32+i*.32;
    a.cylinder(.115,.24,glass,px,1.08,z-.04);a.cylinder(.12,.035,a.brass,px,1.22,z-.04);
    for(let j=0;j<5;j++) a.ellipsoid(.04,.035,.035,[rose,green,plum][i],px+Math.sin(j*2.4)*.065,1+j*.033,z-.04+Math.cos(j*2.4)*.065);
  }
  a.box(.26,.10,.17,paper,x-.27,1.01,z+.20);a.box(.22,.08,.15,plum,x+.12,1.00,z+.20);
  a.root.userData.candyTrolley={center:{x,z},width:1.1,depth:.65};
}

export function openRegionPortals(environment, area, { portals = [] } = {}) {
  const group = environment?.isObject3D ? environment : environment?.root;
  if (!group) throw new Error('REGION_ENVIRONMENT_ROOT_REQUIRED');
  const a = art(`PortalArchitecture:${area.id}`), saved = [], seen = new Set(), matrix = new THREE.Matrix4(), world = new THREE.Matrix4(), box = new THREE.Box3();
  let disposed = false; group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert();
  function hide(object, index) {
    const key = `${object.uuid}:${index ?? 'mesh'}`; if (seen.has(key)) return; seen.add(key);
    if (index !== undefined) { object.getMatrixAt(index, matrix); saved.push({ object, index, matrix: matrix.clone() }); object.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0)); object.instanceMatrix.needsUpdate = true; }
    else { saved.push({ object, visible: object.visible }); object.visible = false; }
  }
  function opening(at, width = 2.8, axis = 'z') {
    const along = axis === 'x' ? 'z' : 'x', objects = []; group.traverse(o => { if (o.isMesh && o.visible && !o.userData.dynamic) objects.push(o); });
    for (const object of objects) {
      if ([].concat(object.material ?? []).some(m => m.transparent)) continue;
      object.geometry.computeBoundingBox();
      for (let i = 0; i < (object.isInstancedMesh ? object.count : 1); i++) {
        if (object.isInstancedMesh) object.getMatrixAt(i, matrix); else matrix.identity();
        world.multiplyMatrices(inverse, object.matrixWorld).multiply(matrix); box.copy(object.geometry.boundingBox).applyMatrix4(world);
        if (box.max.y <= at.y + .16 || box.min.y >= at.y + 3.35 || box.max[along] <= at[along] - width / 2 || box.min[along] >= at[along] + width / 2 || box.max[axis] < at[axis] - 1.2 || box.min[axis] > at[axis] + 1.2 || box.max[axis] - box.min[axis] > 1.4) continue;
        const lo = box.min.clone(), hi = box.max.clone(); hide(object, object.isInstancedMesh ? i : undefined);
        const patch = (u0, u1, y0, y1) => {
          if (u1 - u0 <= .01 || y1 - y0 <= .01) return;
          const depth = Math.max(.02, hi[axis] - lo[axis]);
          if (axis === 'z') a.box(u1 - u0, y1 - y0, depth, object.material, (u0 + u1) / 2, (y0 + y1) / 2, (lo.z + hi.z) / 2);
          else a.box(depth, y1 - y0, u1 - u0, object.material, (lo.x + hi.x) / 2, (y0 + y1) / 2, (u0 + u1) / 2);
        };
        patch(lo[along], Math.min(at[along] - width / 2, hi[along]), lo.y, hi.y);
        patch(Math.max(at[along] + width / 2, lo[along]), hi[along], lo.y, hi.y);
        patch(Math.max(lo[along], at[along] - width / 2), Math.min(hi[along], at[along] + width / 2), Math.max(at.y + 3.35, lo.y), hi.y);
      }
    }
  }
  const train = area.sceneId === 'SC02';
  if (train) {
    group.traverse(o => {
      if (o.name === 'TrainWindowJourney' || o.isMesh && !o.isInstancedMesh && o.geometry?.type === 'SphereGeometry' && Math.abs(o.position.x) > 8) hide(o);
    });
    opening({ x: 0, y: 0, z: 10.9 }); trainExterior(a, portals);
  }
  if (area.sceneId === 'SC03') {
    group.traverse(o => {
      if (o.isReflector) { saved.push({ object: o, position: o.position.clone(), scale: o.scale.clone() }); o.scale.set(104 / o.geometry.parameters.width, 86 / o.geometry.parameters.height, 1); o.position.z = 29; }
      if (!o.isMesh || o.userData.dynamic || o.isReflector) return;
      for (let i = 0; i < (o.isInstancedMesh ? o.count : 1); i++) {
        if (o.isInstancedMesh) o.getMatrixAt(i, matrix); else matrix.copy(o.matrix);
        if (new THREE.Vector3().setFromMatrixPosition(matrix).z < -23) hide(o, o.isInstancedMesh ? i : undefined);
      }
    });
    // Meet the arrival road on solid south-bank land. Never bridge the water.
    a.floor(-3.2,3.2,70.5,72.7,0,false);
  }
  if(area.sceneId==='SC11') {
    // The legacy outdoor template used a 36 m ground slab at 40 m height. Trim
    // it to the actual navigable tower terrace, retaining the authored parapet.
    const objects=[];group.traverse(o=>{if(o.isMesh&&o.visible)objects.push(o);});
    for(const o of objects) {
      o.geometry.computeBoundingBox();
      for(let i=0;i<(o.isInstancedMesh?o.count:1);i++) {
        if(o.isInstancedMesh)o.getMatrixAt(i,matrix);else matrix.identity();
        world.multiplyMatrices(inverse,o.matrixWorld).multiply(matrix);box.copy(o.geometry.boundingBox).applyMatrix4(world);
        if(box.max.y<.2&&box.min.y>-.5&&box.max.x-box.min.x>30&&box.max.z-box.min.z>30)hide(o,o.isInstancedMesh?i:undefined);
      }
    }
    a.floor(-11.5,11.5,-15.5,13.5,0);
    towerSupport(a,area);
  }
  for (const portal of portals) {
    if (portal.kind === 'drop' || portal.kind === 'train') continue;
    const at = point(portal.anchor), width = portal.width ?? 2.8;
    const axis = train && Math.abs(at.x) > 2.5 ? 'x' : Math.abs(at.x) > Math.abs(at.z) ? 'x' : 'z';
    // The ordinary station's 9/10 divider is enchanted masonry, not an open
    // arch. Keep its opaque face while retaining the same continuous footpath.
    if (!train && !portal.magicWall) opening(at, width, axis);
    const b = boundsOf(area), inside = { x: clamp(at.x, b[0] + .5, b[1] - .5), z: clamp(at.z, b[2] + .5, b[3] - .5) };
    if(train) {
      const minX=Math.min(at.x-.6,inside.x),maxX=Math.max(at.x+.6,inside.x);
      a.box(maxX-minX,.06,width,a.wood,(minX+maxX)/2,at.y-.015,at.z).castShadow=false;
    } else if (axis === 'z') a.floor(at.x - width / 2, at.x + width / 2, Math.min(at.z - .6, inside.z), Math.max(at.z + .6, inside.z), at.y, false);
    else a.floor(Math.min(at.x - .6, inside.x), Math.max(at.x + .6, inside.x), at.z - width / 2, at.z + width / 2, at.y, false);
  }
  group.add(a.root); const materialReady = a.finish();
  return { root: a.root, materialReady, dispose() { if (disposed) return; disposed = true; a.dispose(); for (const item of saved) {
    if (item.index !== undefined) { item.object.setMatrixAt(item.index, item.matrix); item.object.instanceMatrix.needsUpdate = true; }
    else if (item.position) { item.object.position.copy(item.position); item.object.scale.copy(item.scale); }
    else item.object.visible = item.visible;
  } } };
}
