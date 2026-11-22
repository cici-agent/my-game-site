import * as THREE from 'three';
import { FACE_VERTICES, FACE_TRIANGLES, FACE_OUTLINE } from './npc-face-topology.mjs';

const gaussian = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);
function subdivide(vertices, faces) {
  const edges = new Map(), neighbors = vertices.map(() => new Set()), boundary = vertices.map(() => []);
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  for (const [a, b, c] of faces) for (const [u, v, opposite] of [[a, b, c], [b, c, a], [c, a, b]]) {
    const key = edgeKey(u, v); if (!edges.has(key)) edges.set(key, { a: u, b: v, opposite: [] }); edges.get(key).opposite.push(opposite); neighbors[u].add(v); neighbors[v].add(u);
  }
  for (const edge of edges.values()) if (edge.opposite.length === 1) { boundary[edge.a].push(edge.b); boundary[edge.b].push(edge.a); }
  const result = vertices.map((v, i) => {
    if (boundary[i].length === 2) return v.map((value, axis) => value * .75 + (vertices[boundary[i][0]][axis] + vertices[boundary[i][1]][axis]) * .125);
    const n = neighbors[i].size, beta = n === 3 ? 3 / 16 : 3 / (8 * n);
    return v.map((value, axis) => value * (1 - n * beta) + [...neighbors[i]].reduce((sum, index) => sum + vertices[index][axis] * beta, 0));
  });
  for (const edge of edges.values()) {
    edge.index = result.length;
    result.push(vertices[edge.a].map((v, axis) => edge.opposite.length === 2
      ? (v + vertices[edge.b][axis]) * .375 + (vertices[edge.opposite[0]][axis] + vertices[edge.opposite[1]][axis]) * .125
      : (v + vertices[edge.b][axis]) * .5));
  }
  const triangles = [];
  for (const [a, b, c] of faces) { const ab = edges.get(edgeKey(a, b)).index, bc = edges.get(edgeKey(b, c)).index, ca = edges.get(edgeKey(c, a)).index; triangles.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  return { vertices: result, faces: triangles };
}

export function createNpcHeadSurface(profile) {
  const front = FACE_VERTICES.map(([cx, cy, cz]) => {
    const x = cx * .022 * profile.width / .170, y = (cy * .025 + .015) * profile.height / .225;
    const jaw = 1 + (.14 - profile.jaw) * Math.max(0, -cy - 2) / 10;
    const nose = gaussian(cx, cy, 0, -.5, 1.6, 3.2) * (profile.nose - .047) * .60;
    const cheek = gaussian(Math.abs(cx), cy, 4.1, -.5, 1.7, 2) * (profile.cheek - .013);
    return [x * jaw, y, -.05 - cz * .018 - nose - cheek];
  });
  let vertices = front.map(v => [...v]), faces = FACE_TRIANGLES.map(([a, b, c]) => [a, c, b]);
  let previous = [...FACE_OUTLINE];
  for (let ring = 0; ring < 6; ring++) {
    const across = [1.02, 1.02, .94, .78, .50, .20][ring], vertical = [1.01, 1.01, .97, .85, .62, .28][ring], t = (ring + 1) / 6;
    const current = FACE_OUTLINE.map(index => {
      const [x, y, z] = front[index], at = vertices.length;
      vertices.push([x * across, Math.min(profile.height + .003, y * vertical + .012 * t), THREE.MathUtils.lerp(z, .154, t)]); return at;
    });
    for (let i = 0; i < current.length; i++) { const n = (i + 1) % current.length; faces.push([previous[i], current[n], previous[n]], [previous[i], current[i], current[n]]); }
    previous = current;
  }
  const center = vertices.length; vertices.push([0, .012, .157]);
  for (let i = 0; i < previous.length; i++) faces.push([previous[i], center, previous[(i + 1) % previous.length]]);
  // Two Loop passes retain the actual lips, eyelid rims and nostrils instead of
  // interpolating a generic sphere. Eye and mouth openings stay boundary rings.
  for (let pass = 0; pass < 2; pass++) ({ vertices, faces } = subdivide(vertices, faces));
  const colors = [], uv = [];
  for (const [x, y, z] of vertices) {
    const frontWeight = Math.max(0, Math.min(1, -z / .11));
    const flush = gaussian(Math.abs(x), y, .095, -.03, .046, .049) * frontWeight;
    const socket = gaussian(Math.abs(x), y, .07, .08, .037, .028) * frontWeight;
    const lips = gaussian(x, y, 0, -.091 * profile.height / .225, .052, .016) * Math.max(0, Math.min(1, (-z - .10) / .03));
    const variation = .015 * Math.sin(x * 41 + y * 13) * Math.sin(y * 27 - z * 9);
    colors.push(1 + variation - socket * .05 - lips * .035, 1 + variation - flush * .065 - socket * .08 - lips * .21, 1 + variation - flush * .08 - socket * .075 - lips * .15);
    uv.push(x * 2 + .5, y * 2 + .5);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(faces.flat()); geometry.computeVertexNormals();
  return { geometry, landmarks: front.map(v => new THREE.Vector3(...v)) };
}
