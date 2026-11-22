import * as THREE from 'three';
import { BOAT_SEATS } from '../train-layout.mjs';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

function branch(a, start, end, radius, material) {
  const from = new THREE.Vector3(...start), to = new THREE.Vector3(...end), delta = to.clone().sub(from);
  const node = a.cyl(.10, 1, material, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, .065, 12);
  node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()); node.scale.set(radius / .10, delta.length(), radius / .10); return node;
}
function windyLeaves(material) {
  if (material.userData.windTime) return material;
  const time = { value: 0 }; material.userData.windTime = time;
  material.onBeforeCompile = shader => {
    shader.uniforms.landscapeTime = time;
    shader.vertexShader = 'uniform float landscapeTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 windSeed = vec3(0.0);
      #ifdef USE_INSTANCING
      windSeed = instanceMatrix[3].xyz;
      #endif
      transformed.x += sin(landscapeTime * 1.3 + windSeed.x * .9 + windSeed.z) * .025;
      transformed.z += cos(landscapeTime * .9 + windSeed.x) * .018;
    `);
  };
  material.customProgramCacheKey = () => 'chapter-one-leaf-wind-v1'; return material;
}

export function buildTree(a, x, z, height = 6, variant = 0) {
  const bark = a.surface('bark', variant % 2 ? '#645c4a' : '#514d3d');
  const leaves = [0x354d3c, 0x405d43, 0x4d6849].map(c => windyLeaves(a.material(c)));
  const bendX = Math.sin(variant * 1.37) * .4, bendZ = Math.cos(variant * .8) * .23;
  branch(a, [x, -.12, z], [x + bendX * .45, height * .42, z + bendZ * .45], .24, bark);
  branch(a, [x + bendX * .45, height * .42, z + bendZ * .45], [x + bendX, height * .84, z + bendZ], .16, bark);
  for (let root = 0; root < 5; root++) {
    const angle = root * Math.PI * .4 + variant;
    branch(a, [x, .28, z], [x + Math.sin(angle) * .65, .02, z + Math.cos(angle) * .65], .075, bark);
  }
  for (let limb = 0; limb < 9; limb++) {
    const angle = limb * 2.399 + variant * .42, y = height * (.42 + limb % 4 * .11), spread = 1.55 + (limb % 3) * .26;
    const tip = [x + bendX + Math.cos(angle) * spread, y + .8 + limb % 2 * .3, z + bendZ + Math.sin(angle) * spread];
    const middle = [x + bendX * .7 + Math.cos(angle) * spread * .55, y + .25, z + Math.sin(angle) * spread * .55];
    branch(a, [x + bendX * .6, y, z + bendZ * .6], middle, .095, bark); branch(a, middle, tip, .055, bark);
    for (let twig = 0; twig < 2; twig++) {
      const side = twig ? 1 : -1, end = [tip[0] + Math.cos(angle + side * .8) * .58, tip[1] + .36, tip[2] + Math.sin(angle + side * .8) * .58];
      branch(a, middle, end, .026, bark);
    }
    for (let leaf = 0; leaf < 28; leaf++) {
      const angle2 = leaf * 2.399, radius = .24 + (leaf % 7) * .125;
      const node = a.sphere(1, leaves[(leaf + limb) % 3], tip[0] + Math.sin(angle2) * radius, tip[1] + Math.cos(leaf * 1.3) * .46, tip[2] + Math.cos(angle2) * radius, 8, 4);
      node.scale.set(.27 + leaf % 3 * .04, .055, .42); node.rotation.set(.1 + Math.sin(leaf) * .35, angle2, Math.cos(leaf) * .35);
    }
  }
}

function castle(a) {
  const stone = a.material(0x9aa39a); stone.userData.environmentSurface = { kind: 'stone', repeat: [2, 3] };
  const roof = a.material(0x344b52), edge = a.material(0xb0b5a6), glow = a.material(0xc9b781);
  glow.emissive.set(0xb1834d); glow.emissiveIntensity = .36;
  for (const [x, z, radius, h] of [[-10, -32, 1.5, 9], [-5, -35, 1.7, 13], [0, -37, 2.2, 16], [5, -34, 1.7, 12], [10, -31, 1.4, 10], [-2, -30, 1.1, 8], [4, -29, 1, 8]]) {
    const hill = a.sphere(1, 0x4d6258, x, -.5, z, 16, 10); hill.scale.set(radius * 3, 3.4, radius * 3.4);
    a.cyl(radius, h, stone, x, h / 2 + 2, z, radius * .96, 28);
    for (const yy of [2.4, h - .4, h + 1.6]) a.cyl(radius * 1.05, .24, edge, x, yy, z, radius * 1.06, 28);
    a.cyl(radius * 1.28, radius * 2.8, roof, x, h + 2 + radius * 1.4, z, .04, 28);
    for (let level = 0; level < 4; level++) for (const side of [-1, 0, 1]) {
      const angle = side * .66;
      const window = a.box(.24, .81, .045, glow, x + Math.sin(angle) * radius, 3.5 + level * (h - 2) / 4, z + Math.cos(angle) * radius, .04, angle);
      window.castShadow = false;
    }
  }
  for (const [x, z, w, h] of [[-6, -34, 7, 6], [2, -35, 9, 8], [7.8, -32, 6, 5]]) {
    a.box(w, h, 3, stone, x, h / 2 + 2, z, .04);
    for (let i = 0; i < 4; i++) { const sx = x + (i - 1.5) * w / 4; a.box(.32, 1.5, .08, glow, sx, h - .1, z + 1.53, .04); a.box(.38, h + .2, .40, edge, sx, h / 2 + 2, z + 1.5, .025); }
  }
}

function hullGeometry(inner = false) {
  const positions = [], uvs = [], indices = [], length = 20, profile = 5;
  for (let row = 0; row <= length; row++) {
    const z = (row / length - .5) * 3.45, width = Math.max(.08, .91 * Math.sqrt(Math.max(0, 1 - (z / 1.78) ** 2))) - (inner ? .055 : 0);
    const points = [[-width, .46], [-width * .77, .05], [0, -.10], [width * .77, .05], [width, .46]];
    points.forEach(([x, y], col) => { positions.push(x, y + (inner ? .055 : 0), z); uvs.push(row / length * 2, col / (profile - 1)); });
    if (row) for (let col = 0; col < profile - 1; col++) {
      const a = (row - 1) * profile + col, b = row * profile + col;
      if (inner) indices.push(a, b + 1, b, a, a + 1, b + 1); else indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function createBoatMotion() {
  const position = { x: 1.5, y: .02, z: 46 }, target = { ...position };
  let yaw = 0, targetYaw = 0, progress = 0, phase = 'moored', arrival = 0, rowing = 0, stroke = 0;
  const mix = (a, b, t) => a + (b - a) * t;
  function setEscort(escort) {
    if (escort?.kind === 'boat') {
      const next = escort.position;
      if(phase==='moored'&&escort.progress>0){position.x=next.x;position.z=next.z;target.x=next.x;target.z=next.z;}
      if (progress > .1 && escort.progress < progress - .25) { position.x = next.x; position.z = next.z; arrival = 0; }
      const dx = next.x - target.x, dz = next.z - target.z;
      if (Math.hypot(dx, dz) > .005) targetYaw = Math.atan2(-dx, -dz);
      target.x = next.x; target.z = next.z; progress = escort.progress ?? 0;
      if (progress >= 1) { if (phase !== 'disembarking' && phase !== 'docked') { phase = 'disembarking'; arrival = 0; } }
      else { phase = progress > 0 ? 'crossing' : 'boarding'; arrival = 0; }
    } else if (phase === 'crossing' || phase === 'boarding') {
      if (escort?.position) { target.x = escort.position.x; target.z = escort.position.z; }
      phase = 'disembarking'; arrival = 0;
    }
  }
  function update(dt) {
    dt = Math.max(0, Math.min(.2, Number.isFinite(dt) ? dt : 0));
    const blend = 1 - Math.exp(-8 * dt); position.x = mix(position.x, target.x, blend); position.z = mix(position.z, target.z, blend);
    yaw += Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw)) * (1 - Math.exp(-4 * dt));
    rowing = mix(rowing, phase === 'crossing' ? 1 : 0, 1 - Math.exp(-3 * dt)); stroke += dt * 3.1 * rowing;
    if (phase === 'disembarking') { arrival = Math.min(1, arrival + dt / 1.2); if (arrival >= 1) phase = 'docked'; }
  }
  function getPose(role = 'player') {
    const seatSpec=BOAT_SEATS[role]??BOAT_SEATS.player, seatZ = seatSpec.z, seat = { x: position.x + Math.sin(yaw) * seatZ, y: position.y, z: position.z + Math.cos(yaw) * seatZ };
    const disembarkProgress = phase === 'docked' ? 1 : phase === 'disembarking' ? arrival : 0;
    const t = disembarkProgress * disembarkProgress * (3 - 2 * disembarkProgress);
    const shore = { x: target.x, y: 0, z: target.z - (role === 'guide' ? 1.1 : .7) };
    return { position: { x: mix(seat.x, shore.x, t), y: mix(seat.y, 0, t) + Math.sin(disembarkProgress * Math.PI) * .16, z: mix(seat.z, shore.z, t) }, boatPosition: { ...position }, yaw, seat:seatSpec.seat, seated: phase === 'crossing' || phase === 'boarding' && progress > 0 || phase === 'disembarking' && arrival < .15, phase, progress, disembarkProgress, rowing, stroke };
  }
  return { setEscort, update, getPose };
}

export function buildLake(a, group, walls) {
  const wood = a.surface('wood', '#796047'), paleWood = a.surface('wood', '#a08a66'), iron = a.material(0x514c42, .5);
  const shader = { ...Reflector.ReflectorShader, uniforms: { ...Reflector.ReflectorShader.uniforms, lakeTime: { value: 0 } } };
  shader.vertexShader = shader.vertexShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec3 lakeWorld;').replace('vUv = textureMatrix', 'lakeWorld = (modelMatrix * vec4(position, 1.0)).xyz; vUv = textureMatrix');
  shader.fragmentShader = shader.fragmentShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec3 lakeWorld; uniform float lakeTime;').replace('vec4 base = texture2DProj( tDiffuse, vUv );', `
    vec4 rippleUv = vUv;
    rippleUv.xy += vec2(sin(lakeWorld.x * 2.8 + lakeWorld.z * 1.6 + lakeTime), cos(lakeWorld.z * 3.1 - lakeWorld.x * .7 + lakeTime * .8)) * .0009 * vUv.w;
    vec4 base = texture2DProj(tDiffuse, rippleUv);
    float fresnel = pow(1.0 - clamp(normalize(cameraPosition - lakeWorld).y, 0.0, 1.0), 2.0);
    base.rgb = mix(vec3(.095, .16, .18), base.rgb, .28 + .5 * fresnel);
    base.rgb += pow(max(0.0, sin(lakeWorld.x * 5.0 + lakeWorld.z * 3.0 + lakeTime * .8)), 30.0) * .014;
  `);
  const waterGeometry = new THREE.PlaneGeometry(104, 86), water = new Reflector(waterGeometry, { color: 0xa6c0c7, textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: .002, shader });
  water.rotation.x = -Math.PI / 2; water.position.set(0, -.075, 29); group.add(water); water.userData.dynamic = true;
  const reflectionRender = water.onBeforeRender; let reflectionFrame = 0;
  water.onBeforeRender = function (...args) { if (reflectionFrame++ % 2 === 0) reflectionRender.apply(this, args); };
  // A real south shore, twenty-four metres deep, meets a short embarkation dock.
  // Between it and the north shore are fifty metres of uninterrupted water.
  const earth=a.surface('earth','#657059'),gravel=a.surface('earth','#9b967d');
  a.box(104,.50,25,earth,0,-.27,60.5,.025);
  a.box(4.8,.035,24.2,gravel,0,-.006,60.1,.008);
  for(let i=-10;i<=10;i++) {
    const x=i*4.9;if(Math.abs(x)<4)continue;
    const bank=a.sphere(1,i%3?0x6f7b61:0x697264,x,-.14,48.35+Math.sin(i*1.7)*.32,12,8);bank.scale.set(2.7,.32,1.10);
  }
  for(const [z,depth]of [[49.25,3.5],[-9.35,11.1]]) {
    a.box(6.5, .28, depth, 0x525c4c, 0, -.19, z, .06);
    const rows = Math.floor(depth / .40);
    for (let i = 0; i < rows; i++) a.box(6.30, .07, .383, i % 3 ? wood : paleWood, 0, -.025, z + (i - (rows - 1) / 2) * .40, .012);
    for (const side of [-1, 1]) {
      a.box(.18, .22, depth + .1, wood, side * 3.13, -.13, z, .018);
      for (let i = 0; i <= 3; i++) {
        const zz = z + (i / 3 - .5) * (depth - .25);
        a.cyl(.15, 1.75, wood, side * 3.05, -.18, zz, .13, 16);
        a.torus(.15, .018, iron, side * 3.05, .49, zz, Math.PI / 2);
        for (const dz of [-.055, .055]) a.sphere(.021, iron, side * 2.98, .15, zz + dz);
      }
    }
  }
  walls.push({ x: 0, z: 21, w: 25, d: 48, height: 5, water: true });
  for (const side of [-1, 1]) walls.push({ x: side * 7.0, z: 16, w: 7.2, d: 61, height: 5, water: true });
  for (const side of [-1, 1]) for (const z of [49.8, -13]) {
    const shore = a.sphere(1, 0x4d5b47, side * 4.6, -.3, z, 16, 10); shore.scale.set(3.1, .65, 3.2);
    buildTree(a, side * 5.0, z, 6 + (side > 0 ? .5 : 0), z + side);
  }
  for(const side of[-1,1])for(const z of[57,68])buildTree(a,side*(z===57?12:17),z,6.6+(side>0?.6:0),z+side);
  castle(a);
  const boat = new THREE.Group(); boat.userData.dynamic = true; group.add(boat);
  const boatGeometries = [], boatMaterials = [];
  function part(geometry, material, position = [0, 0, 0], parent = boat) { boatGeometries.push(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; }
  const hull = part(hullGeometry(), wood); hull.material.side = THREE.DoubleSide; part(hullGeometry(true), paleWood);
  for (const side of [-1, 1]) for (const yy of [.20, .46]) {
    const points = Array.from({ length: 24 }, (_, i) => { const z = (i / 23 - .5) * 3.4, width = .91 * Math.sqrt(Math.max(0, 1 - (z / 1.78) ** 2)); return new THREE.Vector3(side * width * (yy === .20 ? .88 : 1), yy, z); });
    part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, yy === .46 ? .035 : .012, 8, false), yy === .46 ? paleWood : iron);
  }
  for (const {z,seat} of Object.values(BOAT_SEATS)) part(new RoundedBoxGeometry(seat.width, .10, seat.backZ-seat.frontZ, 2, .025), paleWood, [0, seat.surfaceY-.05, z]);
  for (const x of [-.36, 0, .36]) part(new RoundedBoxGeometry(.33, .055, 2.3, 2, .010), wood, [x, .02, 0]);
  const oars = [-1, 1].map(side => {
    const hinge = new THREE.Group(); hinge.position.set(side * .81, .51, .4); boat.add(hinge);
    part(new THREE.CylinderGeometry(.025, .035, 2.2, 12), paleWood, [0, -.15, 0], hinge);
    part(new RoundedBoxGeometry(.20, .60, .055, 2, .025), wood, [0, -1.23, 0], hinge);
    return { hinge, side };
  });
  const glow = new THREE.MeshStandardMaterial({ color: 0xe7c083, emissive: 0xda9d43, emissiveIntensity: .8, roughness: .5 }); boatMaterials.push(glow);
  part(new THREE.CylinderGeometry(.10, .12, .24, 6), glow, [0, .72, -1.32]); part(new THREE.CylinderGeometry(.16, .04, .12, 6), iron, [0, .9, -1.32]);
  const lantern = new THREE.PointLight(0xe8bb75, .75, 3, 2); lantern.position.set(0, 1.05, -.9); boat.add(lantern);
  const wakeMaterial = new THREE.MeshBasicMaterial({ color: 0x9caeac, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false }); boatMaterials.push(wakeMaterial);
  const wakeGeometry = new THREE.RingGeometry(.72, .75, 48); boatGeometries.push(wakeGeometry);
  const wakes = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(wakeGeometry, wakeMaterial); m.rotation.x = -Math.PI / 2; group.add(m); m.userData.dynamic = true; return m; });
  const motion = createBoatMotion(); boat.position.set(1.5, .02, 46); boat.name = 'PersistentLakeBoat';
  return {
    setEscort: motion.setEscort,
    getBoatPose: motion.getPose,
    update(dt, time) {
      water.material.uniforms.lakeTime.value = time;
      motion.update(dt); const pose = motion.getPose(); boat.position.set(pose.boatPosition.x, pose.boatPosition.y, pose.boatPosition.z); boat.rotation.y = pose.yaw; boat.rotation.z = Math.sin(time * 1.5) * .012; boat.rotation.x = Math.sin(time * .9) * .008;
      for (const { hinge, side } of oars) { hinge.rotation.set(.35 + Math.sin(pose.stroke) * .46 * pose.rowing, side * (.1 + Math.cos(pose.stroke) * .32 * pose.rowing), side * .9); }
      wakeMaterial.opacity = .12 * pose.rowing;
      for (let i = 0; i < wakes.length; i++) { const cycle = (time * .26 + i / 3) % 1; wakes[i].visible = pose.rowing > .015; wakes[i].position.set(boat.position.x, -.068, boat.position.z); wakes[i].scale.set(1 + cycle * 1.6, 1.5 + cycle * 1.8, 1); }
    },
    dispose() { water.dispose(); waterGeometry.dispose(); boatGeometries.forEach(g => g.dispose()); boatMaterials.forEach(m => m.dispose()); },
  };
}

export function forestFloor(a) {
  const rock = a.material(0x6a7061), leaf = a.material(0x756f42);
  for (let i = 0; i < 38; i++) {
    const side = i % 2 ? 1 : -1, x = side * (3.0 + i % 5 * .68), z = 10 - i * .64;
    const node = a.sphere(1, i % 3 ? leaf : rock, x, .04, z, 10, 6); node.scale.set(.20 + i % 3 * .10, .035 + i % 3 * .05, .15 + i % 4 * .06); node.rotation.y = i * 1.21;
  }
  const wood = a.surface('bark', '#665c45');
  for (const side of [-1, 1]) { branch(a, [side * 5.6, .28, -4], [side * 4.4, .25, -1.3], .22, wood); for (let i = 0; i < 4; i++) branch(a, [side * 5.1, .31, -3 + i * .5], [side * (5.7 + i * .13), .35, -2.7 + i * .6], .045, wood); }
}

export function greenhouseDetails(a) {
  const iron = a.material(0x4c6e61, .45), brass = a.material(0xb3945e, .55), glass = a.material(0xa9c4b7), soil = a.material(0x403c2b);
  glass.transparent = true; glass.opacity = .14; glass.depthWrite = false; glass.roughness = .22;
  const leaves = [0x4e764c, 0x628554, 0x3d6748].map(c => windyLeaves(a.material(c)));
  for (const z of [-8, -4, 0, 4, 8]) {
    for (const side of [-1, 1]) {
      branch(a, [side * 6.3, 4.65, z], [0, 6.25, z], .055, iron);
      a.box(.25, .18, .22, iron, side * 6.3, 4.65, z, .02);
      for (const dz of [-.065, .065]) a.sphere(.027, brass, side * 6.15, 4.66, z + dz);
      for (let panel = 0; panel < 3; panel++) {
        const x = side * (1.05 + panel * 2.1), y = 6.25 - Math.abs(x) * (1.6 / 6.3);
        const pane = a.box(2.13, .02, 3.88, glass, x, y, z + 2, .002); pane.rotation.z = -side * Math.atan2(1.6, 6.3); pane.castShadow = false;
      }
    }
    a.box(.10, .13, 4.1, iron, 0, 6.25, z + 2, .010);
  }
  for (const side of [-1, 1]) for (const z of [-8, -4, 0, 4, 8]) for (let pot = -1; pot <= 1; pot++) {
    const x = side * 4.5 + pot * .65;
    a.cyl(.225, .065, 0xaa7755, x, 1.45, z, .24, 24); a.cyl(.198, .015, soil, x, 1.465, z, .198, 24);
    for (let stem = 0; stem < 5; stem++) {
      const angle = stem * 2.399, tip = [x + Math.sin(angle) * .28, 1.72 + (stem % 3) * .13, z + Math.cos(angle) * .28];
      branch(a, [x, 1.47, z], tip, .015, leaves[stem % 3]);
      const blade = a.sphere(1, leaves[stem % 3], ...tip, 10, 6); blade.scale.set(.12, .026, .26); blade.rotation.set(.25, -angle, .45);
      if ((pot + stem) % 5 === 0) for (let petal = 0; petal < 5; petal++) {
        const pa = petal * Math.PI * .4, flower = a.sphere(1, side < 0 ? 0xad9677 : 0xc9a19b, tip[0] + Math.sin(pa) * .05, tip[1] + .04, tip[2] + Math.cos(pa) * .05, 8, 4); flower.scale.set(.045, .025, .065); flower.rotation.y = pa;
      }
    }
  }
}
