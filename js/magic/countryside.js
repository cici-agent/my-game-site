import * as THREE from 'three';
import { birchLoch, highlandTarn } from './express-ride.js';

// The train passes the long birch-lined loch on the outward leg, then a
// smaller rocky tarn after rounding the pine forest on the eastern ridge.
const lochs = [
  { ...birchLoch, rx: 108, rz: 38, seed: .6, water: 0x406c79 },
  { ...highlandTarn, rx: 71, rz: 38, seed: 2.8, water: 0x365969 },
];
const ridges = [
  [346, 1, 95, 24, 26], [434, 17, 53, 36, 32],
  [604, 91, 52, 98, 53], [644, -30, 82, 125, 64],
  [510, -176, 69, 48, 31], [342, -244, 100, 43, 57],
  [230, -240, 80, 54, 42], [302, 276, 112, 52, 47],
];

function shoreRadius(angle, seed) {
  return 1 + .034 * Math.sin(3 * angle + seed) + .047 * Math.cos(5 * angle - seed) + .022 * Math.sin(9 * angle + seed);
}

function shoreDistance(x, z, lake) {
  const dx = (x - lake.x) / lake.rx, dz = (z - lake.z) / lake.rz;
  return Math.hypot(dx, dz) / shoreRadius(Math.atan2(dz, dx), lake.seed);
}

function terrainHeight(x, z, clearance) {
  // The playable castle and both stations retain their original flat ground.
  if (x <= 205) return -.38;
  const fade = THREE.MathUtils.smoothstep(x, 205, 261);
  let elevation = 1.5 + .68 * Math.sin(.082 * x + .045 * z) + .55 * Math.cos(.072 * z - .035 * x);
  for (const [cx, cz, rx, rz, peak] of ridges) {
    const d = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
    elevation += peak * Math.exp(-1.9 * d);
  }
  const nearestShore = Math.min(...lochs.map(lake => shoreDistance(x, z, lake)));
  const dry = THREE.MathUtils.smoothstep(nearestShore, .98, 1.25);
  // Flatten a strip wider than the mesh spacing so no triangle crosses a rail.
  const grade = THREE.MathUtils.smoothstep(clearance(x, z), 9, 24);
  return -.38 - (1 - dry) * .55 + elevation * dry * grade * fade;
}

// Bake the grass blades, grit and damp patches once. The terrain uses one
// ordinary mipmapped texture lookup, including on mobile.
function groundDetail() {
  const size = 512, pixels = new Uint8ClampedArray(size * size * 4);
  let seed = 19407;
  const random = () => ((seed = Math.imul(1664525, seed) + 1013904223 | 0) >>> 0) / 4294967296;
  function periodicField(resolution) {
    const values = Float32Array.from({ length: resolution ** 2 }, random);
    return (x, y) => {
      const u = x * resolution / size, v = y * resolution / size;
      const ix = Math.floor(u), iy = Math.floor(v);
      const nextX = (ix + 1) % resolution, nextY = (iy + 1) % resolution;
      const s = u - ix, t = v - iy;
      const top = (1 - s) * values[iy * resolution + ix] + s * values[iy * resolution + nextX];
      const bottom = (1 - s) * values[nextY * resolution + ix] + s * values[nextY * resolution + nextX];
      return (1 - t) * top + t * bottom;
    };
  }
  const soil = periodicField(13), clumps = periodicField(49);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, damp = soil(x, y);
      const light = 136 + 67 * damp + 39 * clumps(x, y) + 18 * random();
      pixels[i] = light + 3 * damp; pixels[i + 1] = light + 4; pixels[i + 2] = light - 6;
      pixels[i + 3] = 255;
    }
  }
  function mark(x, y, light, warm) {
    const i = (((Math.round(y) & 511) * size) + (Math.round(x) & 511)) * 4;
    pixels[i] += light + warm; pixels[i + 1] += light; pixels[i + 2] += light - warm;
  }
  for (let i = 0; i < 13500; i++) {
    const x = random() * size, y = random() * size, length = 2 + Math.floor(random() * 5);
    const slope = -.55 + 1.8 * soil(x, y) + (random() - .5) * .9;
    for (let j = 0; j < length; j++) mark(x + slope * j, y + j, 8 + 20 * j / length, 3);
  }
  for (let i = 0; i < 2300; i++) {
    const x = random() * size, y = random() * size;
    mark(x, y, 32, 0); mark(x + 1, y + 1, -20, 0);
  }
  const map = new THREE.DataTexture(new Uint8Array(pixels.buffer), size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.anisotropy = 4; map.generateMipmaps = true; map.needsUpdate = true;
  return map;
}

function buildTerrain(group, clearance) {
  const width = 1480, depth = 1120, nx = 246, nz = 186;
  const mesh = new THREE.PlaneGeometry(width, depth, nx, nz);
  mesh.rotateX(-Math.PI / 2); mesh.translate(280, 0, 0);
  const positions = mesh.getAttribute('position'), uv = mesh.getAttribute('uv'), colors = [];
  const moss = new THREE.Color(0x536b45), heath = new THREE.Color(0x897958);
  const lichen = new THREE.Color(0x83725f), gravel = new THREE.Color(0xb1a28a), color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const y = terrainHeight(x, z, clearance);
    positions.setY(i, y);
    // Warp texture coordinates over broad areas and vary tint at landscape scale.
    uv.setXY(i, (x + 2.3 * Math.sin(.031 * z + .012 * x)) / 24,
      (z + 1.9 * Math.cos(.033 * x - .016 * z)) / 24);
    const patch = .43 + .29 * Math.sin(.057 * x + .018 * z) + .23 * Math.sin(.037 * z - .023 * x);
    color.copy(moss).lerp(heath, THREE.MathUtils.clamp(patch + .009 * y, 0, 1));
    color.lerp(lichen, .27 * THREE.MathUtils.smoothstep(Math.sin(.083 * z + .051 * x), .3, .92));
    const shore = Math.min(...lochs.map(lake => shoreDistance(x, z, lake)));
    const shingle = Math.max(0, 1 - Math.abs(shore - 1) * 6);
    color.lerp(gravel, .94 * shingle);
    colors.push(color.r, color.g, color.b);
  }
  mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  mesh.computeVertexNormals();
  const land = new THREE.Mesh(mesh, new THREE.MeshStandardMaterial({ map: groundDetail(), vertexColors: true, roughness: .96 }));
  land.name = 'Highland_heath_and_ridges'; land.receiveShadow = true;
  group.add(land);
}

function buildWater(group, lake) {
  const outline = [], indices = [], steps = 128;
  outline.push(lake.x, .10, lake.z);
  for (let i = 0; i < steps; i++) {
    const a = i / steps * Math.PI * 2, r = shoreRadius(a, lake.seed);
    outline.push(lake.x + Math.cos(a) * lake.rx * r, .10, lake.z + Math.sin(a) * lake.rz * r);
    indices.push(0, (i + 1) % steps + 1, i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
  geo.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      waterTint: { value: new THREE.Color(lake.water) }, clock: { value: 0 },
    }]),
    vertexShader: `
      varying vec3 worldPos;
      #include <fog_pars_vertex>
      void main() {
        worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 waterTint;
      uniform float clock;
      varying vec3 worldPos;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = worldPos.xz;
        float a = uv.y * 1.50 + uv.x * .11 + .8 * sin(uv.x * .23) + clock;
        float b = uv.y * .88 - uv.x * .16 + clock * .72;
        float detail = 1.0 - smoothstep(.14, 1.8, max(fwidth(a), fwidth(b)));
        vec3 normal = normalize(vec3(.030*cos(b), 1.0, (.065*cos(a)+.027*sin(b))*detail));
        vec3 eye = normalize(cameraPosition-worldPos);
        float sky = pow(1.0-clamp(dot(eye,normal),0.0,1.0),3.0);
        float light = pow(max(0.0, dot(reflect(-normalize(vec3(-.43,.40,-.81)),normal),eye)),36.0);
        float ripples = smoothstep(.86,1.0, .5+.33*sin(a)+.17*cos(b)) * detail;
        gl_FragColor = vec4(mix(waterTint*.66,vec3(.27,.36,.46),sky*.72) +
                            vec3(.16,.19,.20)*ripples + vec3(.70,.53,.36)*light,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const water = new THREE.Mesh(geo, material);
  water.name = lake === lochs[0] ? 'Birch_Loch' : 'Heather_Tarn';
  water.onBeforeRender = () => { material.uniforms.clock.value = performance.now() * .0007; };
  group.add(water);
}

// A layered spruce silhouette. Breaks in the outer whorls expose the branches
// and the darker underside, especially when viewed against the lake or sky.
function spruceGeometry(seed) {
  const positions = [], colors = [];
  const needles = new THREE.Color(0x436253), underside = new THREE.Color(0x233b34);
  const color = new THREE.Color();
  function triangle(a, b, c, shade) {
    positions.push(...a, ...b, ...c);
    color.copy(underside).lerp(needles, shade);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  }
  for (let layer = 0; layer < 6; layer++) {
    const base = .14 + layer * .112, tip = Math.min(1.02, base + .32);
    const radius = .215 * (1 - layer * .137);
    const edges = [];
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 + layer * .32 + seed;
      const r = radius * ((i % 2) ? .73 : 1.08) * (1 + .09 * Math.sin(a * 4.32 + seed));
      edges.push([Math.cos(a) * r, base + ((i % 2) ? .048 : .004 * Math.sin(a)), Math.sin(a) * r]);
    }
    for (let i = 0; i < edges.length; i++) {
      const next = edges[(i + 1) % edges.length];
      triangle(edges[i], [0, tip, 0], next, .52 + .2 * (i % 2) + .03 * layer);
      triangle(edges[i], next, [0, base - .02, 0], .13);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildVegetation(group, clearance) {
  let seed = 7823;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
  const needle = [[], []], wood = [], birch = [], leaves = [], stones = [];
  const pivot = new THREE.Object3D();
  function plant(batch, x, y, z, sx, sy, sz, angle, color) {
    pivot.position.set(x, y, z); pivot.scale.set(sx, sy, sz); pivot.rotation.y = angle; pivot.updateMatrix();
    batch.push({ matrix: pivot.matrix.clone(), color });
  }
  const height = (x, z) => terrainHeight(x, z, clearance);
  function pine(x, z) {
    const h = 8 + 10 * random(), variation = .78 + .28 * random(), turn = random() * Math.PI * 2;
    const floor = height(x, z) - .12;
    plant(wood, x, floor + h * .26, z, .016 * h, .55 * h, .016 * h, turn, 0x695346);
    plant(needle[random() < .5 ? 0 : 1], x, floor, z, h * variation, h, h * variation, turn,
      random() < .5 ? 0xe0eee2 : 0xc1d4c3);
  }
  function broadleaf(x, z) {
    const h = 6 + random() * 6, base = height(x, z) - .14;
    plant(birch, x, base + h * .35, z, h * .016, h * .73, h * .016, 0, 0xbeb5a2);
    const foliage = random() < .46 ? 0x9a9658 : 0x8f925e;
    for (let j = 0; j < 3; j++) {
      const a = j * 2.1 + random() * .7, w = h * (.17 + random() * .05);
      plant(leaves, x + Math.cos(a) * h * .075, base + h * (.61 + .10 * j),
        z + Math.sin(a) * h * .075, w, h * (.28 - .04 * j), w * .83, a, foliage);
    }
  }
  // Clustered planting leaves an uninterrupted viewing corridor by the first
  // loch, with the densest conifers around the two outer bends.
  const clusters = [
    [224, 87, 65, 38, 28, false], [365, 27, 105, 24, 67, false],
    [447, 116, 40, 41, 44, false], [528, 74, 90, 59, 156, true],
    [539, -26, 96, 72, 200, true], [452, -90, 68, 59, 102, true],
    [295, -177, 97, 48, 58, true], [249, -80, 45, 36, 39, false],
  ];
  for (const [cx, cz, rx, rz, count, conifer] of clusters) {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random());
      const x = cx + rx * r * Math.cos(a), z = cz + rz * r * Math.sin(a);
      if (x < 196 || clearance(x, z) < 20 || lochs.some(lake => shoreDistance(x, z, lake) < 1.10)) continue;
      if (conifer) pine(x, z); else broadleaf(x, z);
    }
  }
  for (const lake of lochs) {
    for (let i = 0; i < 92; i++) {
      const a = random() * Math.PI * 2, band = shoreRadius(a, lake.seed) * (.98 + random() * .12);
      const x = lake.x + lake.rx * Math.cos(a) * band, z = lake.z + lake.rz * Math.sin(a) * band;
      const size = .5 + random() ** 2 * 2.1;
      plant(stones, x, Math.max(-.2, height(x, z)), z, size * 1.42, size * .55, size, a, random() < .5 ? 0x8a8574 : 0x736e60);
    }
  }
  function draw(batch, geometry, vertexColors = false) {
    const material = new THREE.MeshStandardMaterial({ roughness: .92, vertexColors, flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, batch.length);
    const color = new THREE.Color();
    batch.forEach(({matrix, color: tint}, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.setHex(tint)); });
    group.add(mesh);
  }
  const trunk = new THREE.CylinderGeometry(.58, 1, 1, 7);
  draw(wood, trunk); draw(birch, trunk);
  draw(needle[0], spruceGeometry(.23), true); draw(needle[1], spruceGeometry(1.62), true);
  draw(leaves, new THREE.DodecahedronGeometry(1, 0));
  draw(stones, new THREE.IcosahedronGeometry(1, 0));
}

export function buildCountryside(scene, clearance) {
  const group = new THREE.Group(); group.name = 'Northern_railway_countryside';
  buildTerrain(group, clearance);
  for (const lake of lochs) buildWater(group, lake);
  buildVegetation(group, clearance);
  scene.add(group);
}
