import * as THREE from 'three';
import { platformY, stationHouse, parcelOffice, canopyPostZ, lampZ, benchZ, cart } from './lakeside-layout.js';

// Constructed in metres, at the western edge of the arrival line. The stone
// platform, track, safety line and accessible ramp are built by the railway.
export function buildLakesideStation(parent) {
  const group = new THREE.Group();
  group.name = 'Hogsmeade_Station';
  parent.add(group);

  const masonry = new THREE.MeshStandardMaterial({ roughness: .91 });
  const timber = new THREE.MeshStandardMaterial({ roughness: .77 });
  const metal = new THREE.MeshStandardMaterial({ roughness: .52, metalness: .24 });
  const luminous = new THREE.MeshBasicMaterial();
  const stone = 0xa08468, mortar = 0x79695a, pale = 0xd4ba8a, iron = 0x2c4842;
  const cream = 0xe6d7aa, frame = 0x4a382e, slate = 0x485568, brass = 0xbb9659;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roundGeo = new THREE.CylinderGeometry(.5, .5, 1, 16);
  const lanternGeo = new THREE.CylinderGeometry(.43, .33, 1, 6);
  const roofFinial = new THREE.ConeGeometry(.5, 1, 8);
  const gable = new THREE.Shape();
  gable.moveTo(-.5, 0); gable.lineTo(.5, 0); gable.lineTo(0, 1); gable.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: 1, bevelEnabled: false });
  gableGeo.translate(0, 0, -.5);

  const batches = new Map();
  const basicRotation = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  function piece(geometry, material, tint, x, y, z, w, h, d, rotation = basicRotation) {
    let byMaterial = batches.get(geometry);
    if (!byMaterial) { byMaterial = new Map(); batches.set(geometry, byMaterial); }
    let items = byMaterial.get(material);
    if (!items) { items = []; byMaterial.set(material, items); }
    items.push([new THREE.Matrix4().compose(position.set(x, y, z), rotation, scale.set(w, h, d)), tint]);
  }
  const box = (mat, tint, x, y, z, w, h, d, rotation) => piece(boxGeo, mat, tint, x, y, z, w, h, d, rotation);
  const cylinder = (mat, tint, x, y, z, diameter, h) => piece(roundGeo, mat, tint, x, y, z, diameter, h, diameter);
  const aroundZ = angle => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
  const aroundY = angle => new THREE.Quaternion().setFromAxisAngle(up, angle);
  function beam(mat, tint, start, end, w, d = w) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const line = b.clone().sub(a), length = line.length();
    a.lerp(b, .5);
    box(mat, tint, a.x, a.y, a.z, w, length, d, new THREE.Quaternion().setFromUnitVectors(up, line.normalize()));
  }

  function board(x, y, z, width, height, yaw, line1, line2 = '') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = Math.max(204, Math.round(canvas.width * height / width));
    const ctx = canvas.getContext('2d'), cw = canvas.width, ch = canvas.height;
    ctx.fillStyle = '#203c38'; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#cfb27b'; ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, cw - 20, ch - 20);
    ctx.fillStyle = '#fff0c9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.floor(ch * (line2 ? .39 : .55))}px Georgia, "Songti SC", serif`;
    ctx.fillText(line1, cw / 2, ch * (line2 ? .38 : .51), cw * .91);
    if (line2) {
      ctx.fillStyle = '#e7c88b';
      ctx.font = `600 ${Math.floor(ch * .235)}px "PingFang SC", sans-serif`;
      ctx.fillText(line2, cw / 2, ch * .76, cw * .89);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map }));
    sign.rotation.y = yaw; sign.position.set(x, y, z); group.add(sign);
  }

  function clock(x, y, z) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f7e4b2'; ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    for (let i = 0; i < 60; i++) {
      ctx.rotate(Math.PI / 30); ctx.fillStyle = '#332e23';
      ctx.fillRect(i % 5 ? -1.2 : -2.6, -111, i % 5 ? 2.4 : 5.2, i % 5 ? 6 : 15);
    }
    for (const [angle, len, thick] of [[-Math.PI / 3, 55, 8], [Math.PI / 3, 82, 5]]) {
      ctx.save(); ctx.rotate(angle); ctx.fillRect(-thick / 2, -len, thick, len + 9); ctx.restore();
    }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    piece(roundGeo, metal, brass, x, y, z, 1.12, .19, 1.12,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(.5, 48), material);
      face.position.set(x, y, z + side * .103); face.rotation.y = side > 0 ? 0 : Math.PI; group.add(face);
    }
  }

  function roof(house, rise) {
    const { x, z, w, d, eaves } = house;
    const half = w / 2 + .32, depth = d + .66;
    piece(gableGeo, masonry, stone, x, eaves, z, w, rise, d);
    const angle = Math.atan2(rise, half);
    for (const side of [-1, 1]) {
      const rot = aroundZ(-side * angle);
      box(timber, slate, x + side * half / 2, eaves + rise / 2, z,
        Math.hypot(half, rise), .16, depth, rot);
      box(timber, iron, x + side * half, eaves - .11, z, .14, .29, depth);
      for (let row = 1; row < 8; row++) {
        const t = row / 8;
        box(timber, row % 2 ? 0x626c78 : 0x596372, x + side * t * half,
          eaves + (1 - t) * rise + .08, z, .075, .06, depth, rot);
      }
      for (const end of [-1, 1]) {
        const endZ = z + end * (depth / 2 + .02);
        beam(timber, cream, [x + side * half, eaves - .12, endZ], [x, eaves + rise, endZ], .18, .16);
      }
    }
    box(metal, 0x47454a, x, eaves + rise + .1, z, .2, .15, depth + .1);
    for (const side of [-1, 1]) {
      const endZ = z + side * (d / 2 + .06);
      box(timber, cream, x, eaves + .08, endZ, w, .16, .1);
      box(timber, frame, x, eaves + rise * .49, endZ, .14, rise * .94, .12);
      for (const s of [-1, 1]) beam(timber, frame,
        [x + s * w * .28, eaves + .19, endZ], [x, eaves + rise * .58, endZ], .1, .1);
    }
  }

  function windowOrDoor(eastX, z, w, door) {
    const sill = door ? platformY + .035 : platformY + .82;
    const h = door ? 2.36 : 1.65, y = sill + h / 2;
    box(timber, frame, eastX + .05, y, z, .12, h + .19, w + .22);
    if (door) {
      box(timber, iron, eastX + .132, y, z, .08, h, w);
      box(luminous, 0xdfaa6b, eastX + .178, sill + h * .70, z, .025, h * .40, w * .77);
      box(timber, pale, eastX + .202, sill + h * .70, z, .028, h * .40, .045);
      box(metal, brass, eastX + .205, sill + 1, z + w * .33, .07, .09, .06);
    } else {
      box(luminous, 0xeab974, eastX + .126, y, z, .026, h, w);
      for (const offset of [-.24, .24]) box(timber, cream, eastX + .155, y, z + w * offset, .055, h, .048);
      box(timber, cream, eastX + .155, y + .1, z, .055, .065, w);
      box(masonry, pale, eastX + .15, sill - .12, z, .28, .17, w + .40);
    }
    box(masonry, pale, eastX + .105, sill + h + .19, z, .26, .20, w + .52);
  }

  function building(house, main) {
    const { x, z, w, d, eaves } = house, east = x + w / 2;
    box(masonry, mortar, x, .76, z, w + .14, 1.52, d + .14);
    box(masonry, main ? 0x99856e : 0x897562, x, (eaves + 1.48) / 2, z, w, eaves - 1.48, d);
    // Staggered courses, finished with separate interlocking quoins on the corners.
    const ashlar = [0xc4ad8d, 0xbfaa8f, 0xb6a084, 0xc9b59a, 0xbba485, 0xc2ac90];
    const rows = Math.ceil((eaves - 1.48) / .33), courseH = (eaves - 1.48) / rows;
    for (let row = 0; row < rows; row++) {
      const y = 1.48 + (row + .5) * courseH;
      for (const endFace of [false, true]) {
        const span = endFace ? w : d;
        let start = -span / 2, i = 0;
        while (start < span / 2 - .02) {
          const stoneW = Math.min(span / 2 - start, .80 + ((i * 7 + row * 3) % 5)*.072 - (i === 0 ? row % 2 * .40 : 0));
          const mid = start + stoneW / 2, tint = ashlar[(row * 11 + i * 7 + i * row) % ashlar.length];
          for (const side of [-1,1]) {
            if (endFace) box(masonry, tint, x+mid, y, z+side*(d/2+.012), stoneW-.014,courseH-.017,.038);
            else box(masonry, tint, x+side*(w/2+.012), y, z+mid, .038,courseH-.017,stoneW-.014);
          }
          start += stoneW; i++;
        }
      }
    }
    // Coursed, slightly uneven dressed stone at the corners and plinth.
    const tones = [0x998675, 0xb19c82, 0xaa9989, 0x8c7c6a];
    for (let course = 0; course < 3; course++) {
      const count = Math.ceil(d / 1.02);
      for (let i = 0; i < count; i++) {
        const bz = z - d / 2 + (i + .5) * d / count;
        box(masonry, tones[(course + i * 3) % 4], east + .095, .27 + course * .49, bz,
          .09, .465, d / count - .035);
      }
    }
    for (const side of [-1, 1]) {
      const corner = z + side * (d / 2 - .25);
      for (let row = 0; row < 11; row++) {
        const y = platformY + .17 + row * .36;
        if (y + .17 >= eaves) break;
        for (const sx of [-1,1]) {
          box(masonry, row % 2 ? pale : 0xc5aa83, x + sx*(w/2-.20), y, corner,
            row % 2 ? .50 : .64, .32, row % 2 ? .61 : .70);
        }
      }
      box(timber, frame, east + .075, (eaves + 1.55) / 2, z + side * d * .29, .12, eaves - 1.55, .16);
    }
    box(timber, pale, east + .07, eaves - .19, z, .19, .19, d);
    if (main) {
      for (const offset of [-6.6, -3.6, 0, 3.6, 6.6]) windowOrDoor(east, z + offset, offset === 0 ? 1.25 : 1.67, offset === 0);
    } else {
      windowOrDoor(east, z - 2.65, 1.3, false);
      windowOrDoor(east, z + .7, 2.15, true);
    }
    roof(house, main ? 2.05 : 1.6);
    const chimneyZ = z + (main ? 5.5 : -2.55);
    box(masonry, 0x896450, x - .7, eaves + 1.75, chimneyZ, .82, 2.65, .93);
    box(masonry, pale, x - .7, eaves + 3.07, chimneyZ, 1.0, .14, 1.08);
    for (const offset of [-.22, .22]) cylinder(masonry, 0xa96245, x - .7, eaves + 3.31, chimneyZ + offset, .31, .44);
  }

  building(stationHouse, true);
  building(parcelOffice, false);

  // Cast-iron brackets, fluted columns and scalloped valance under the passenger canopy.
  const awningMid = -63, awningLength = 20.25;
  box(metal, 0x465d57, 82.49, 5.63, awningMid, 4.10, .16, awningLength, aroundZ(-.12));
  box(timber, cream, 84.50, 5.27, awningMid, .16, .24, awningLength);
  for (let i = 0; i < 63; i++) {
    const z = awningMid - awningLength / 2 + (i + .5) * awningLength / 63;
    piece(roofFinial, timber, cream, 84.50, 5.07, z, .15, .24, .28, aroundZ(Math.PI));
  }
  for (const z of canopyPostZ) {
    cylinder(metal, iron, 84.05, 3.36, z, .15, 3.82);
    for (const [y, diameter, h] of [[1.62,.27,.34],[1.9,.22,.22],[4.72,.19,.12],[5.11,.28,.26]]) {
      cylinder(metal, iron, 84.05, y, z, diameter, h);
    }
    cylinder(metal, brass, 84.05, 1.95, z, .24, .055);
    for (const s of [-1, 1]) {
      beam(metal, iron, [84.05,4.31,z], [84.05,5.22,z+s*.84], .09);
      beam(metal, cream, [84.05,4.74,z], [84.05,5.22,z+s*.45], .055);
    }
    beam(metal, iron, [84.05,4.50,z],[83.22,5.44,z],.10);
    box(timber, 0xbba783, 82.55, 5.37, z, 4.05, .1, .13, aroundZ(-.12));
  }
  board(80.86, 4.53, -63, 7.25, .94, Math.PI / 2, 'HOGSMEADE', '霍 格 莫 德 车 站');
  board(77.88, 4.67, -73.05, 4.53, 1.02, Math.PI, 'HOGSMEADE', '霍格莫德');
  // The ticket-room gable is the first elevation seen from the ramp.
  for (const x of [76.65,79.05]) {
    box(timber, frame, x, 2.79, -73.06, 1.34, 1.74, .12);
    box(luminous, 0xeab974, x, 2.79, -73.14, 1.18, 1.56, .035);
    box(timber, cream, x, 2.79, -73.17, .07, 1.56, .035);
    box(timber, cream, x, 2.91, -73.17, 1.18, .07, .035);
    box(masonry, pale, x, 1.88, -73.11, 1.6, .12, .24);
  }
  board(80.73, 4.30, -105.6, 3.1, .64, Math.PI / 2, 'PARCELS', '行李房');
  box(metal, iron, 82.74, 4.99, -70.35, .06, .60, .06);
  clock(82.74, 4.23, -70.35);

  function lamp(x, z) {
    cylinder(metal, iron, x, 2.82, z, .115, 2.74);
    cylinder(metal, iron, x, 1.68, z, .29, .46);
    cylinder(metal, brass, x, 3.89, z, .18, .09);
    cylinder(metal, iron, x, 4.12, z, .36, .14);
    piece(lanternGeo, luminous, 0xffca78, x, 4.40, z, .61, .52, .61);
    for (const side of [-1,1]) for (const end of [-1,1]) {
      beam(metal, iron, [x+side*.13,4.15,z+end*.13],[x+side*.18,4.67,z+end*.18],.035);
    }
    piece(roofFinial, metal, iron, x, 4.77, z, .61, .23, .61);
    cylinder(metal, brass, x, 4.92, z, .075, .10);
  }
  for (const z of lampZ) lamp(81, z);
  // This double-sided nameboard can be seen at eye level when the train pulls in.
  for (const z of [-87.8, -81.6]) {
    box(timber, iron, 80.60, 3.12, z, .14, 3.34, .16);
    piece(roofFinial, metal, brass, 80.60, 4.91, z, .22, .27, .22);
  }
  box(timber, frame, 80.60, 4.12, -84.7, .18, 1.12, 6.16);
  board(80.699, 4.12, -84.7, 6.0, 1.02, Math.PI/2, 'HOGSMEADE', '霍格莫德车站');
  board(80.50, 4.12, -84.7, 6.0, 1.02, -Math.PI/2, 'HOGSMEADE', '霍格莫德车站');
  box(timber, iron, 80.64, 3.13, -84.7, .12,.52,3.0);
  board(80.71, 3.13, -84.7, 2.94,.48, Math.PI/2, '← 黑湖码头');

  function bench(z) {
    for (const side of [-1,1]) {
      const end = z + .99 * side;
      box(metal, iron, 81.27, 1.73, end, .61,.56,.10);
      box(metal, iron, 80.99, 2.25, end, .075,1.01,.08);
    }
    for (let i = 0; i < 4; i++) box(timber, 0xa3734e, 81.05 + .15*i, 2.01, z, .13,.10,2.65);
    for (let i = 0; i < 3; i++) box(timber, 0x8f6549, 81.02, 2.24 + i*.17, z, .095,.13,2.65);
  }
  benchZ.forEach(bench);

  function trunk(x, y, z, w, h, d, tint) {
    box(timber, tint, x,y+h/2,z,w,h,d);
    for (const side of [-1,1]) box(metal,brass,x,y+h/2,z+side*d*.32,w+.015,h+.02,.055);
    box(timber,frame,x+w/2+.025,y+h*.58,z,.04,.075,d*.30);
  }
  box(timber, frame, cart.x, platformY+.29, cart.z, .90,.14,1.9);
  for (const side of [-1,1]) for (const end of [-1,1]) {
    piece(roundGeo, metal, iron, cart.x + side*.36, platformY+.15, cart.z+end*.67, .28,.12,.28, aroundZ(Math.PI/2));
  }
  trunk(cart.x,platformY+.36,cart.z-.22,.79,.55,1.18,0x965743);
  trunk(cart.x-.025,platformY+.91,cart.z-.23,.62,.38,.83,0x766851);
  box(metal, iron, cart.x,platformY+.86,cart.z+.84,.76,.10,.09);
  for (const side of [-1,1]) box(metal, iron, cart.x+side*.34,platformY+.60,cart.z+.84,.075,.58,.08);

  // Rural steam-era water tank beyond the goods office.
  const tankX = 76.65, tankZ = -111.65;
  for (const dx of [-.98,.98]) for (const dz of [-.98,.98]) {
    box(timber, frame, tankX+dx,1.98,tankZ+dz,.21,3.96,.21);
  }
  for (const s of [-1,1]) {
    beam(timber,frame,[tankX+s*.98,.7,tankZ-.98],[tankX+s*.98,3.65,tankZ+.98],.13);
    beam(timber,frame,[tankX+s*.98,.7,tankZ+.98],[tankX+s*.98,3.65,tankZ-.98],.13);
  }
  cylinder(timber, 0x82614d, tankX,5.04,tankZ,2.76,2.3);
  for (const y of [4.02,4.5,5.55,6.12]) cylinder(metal,iron,tankX,y,tankZ,2.80,.09);
  piece(roofFinial,metal,slate,tankX,6.53,tankZ,3.07,.72,3.07);
  for (const [geometry, materials] of batches) {
    for (const [material, items] of materials) {
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      items.forEach(([matrix, tint], i) => { mesh.setMatrixAt(i,matrix); mesh.setColorAt(i,color.setHex(tint)); });
      mesh.castShadow = material !== luminous; mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); group.add(mesh);
    }
  }
  return group;
}
