import * as THREE from 'three';

// Tapered, cross-sectioned strands share one draw per groom. No torus curls or
// individual strand objects: those looked like thick wire at conversational range.
function groom(kit, parent, material, lines, name) {
  const vertices = [], normals = [];
  for (const { points, width } of lines) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = new THREE.Vector3(...points[i]), b = new THREE.Vector3(...points[i + 1]), direction = b.clone().sub(a).normalize();
      const side = new THREE.Vector3(0, 0, 1).cross(direction);
      if (side.lengthSq() < .001) side.set(1, 0, 0); else side.normalize();
      const other = direction.clone().cross(side).normalize();
      const wa = width * (1 - i / points.length * .85), wb = width * (1 - (i + 1) / points.length * .85);
      const ringA = [], ringB = [], ringN = [];
      for (let k = 0; k < 4; k++) {
        const theta = k / 4 * Math.PI * 2, radial = side.clone().multiplyScalar(Math.cos(theta)).addScaledVector(other, Math.sin(theta));
        ringA.push(a.clone().addScaledVector(radial, wa)); ringB.push(b.clone().addScaledVector(radial, wb)); ringN.push(radial);
      }
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        for (const [point, normal] of [[ringA[k], ringN[k]], [ringB[k], ringN[k]], [ringA[next], ringN[next]], [ringA[next], ringN[next]], [ringB[k], ringN[k]], [ringB[next], ringN[next]]]) { vertices.push(...point); normals.push(...normal); }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
  const mesh = kit.mesh(parent, geometry, material); mesh.name = name;
  return mesh;
}

function coverHagridRearScalp(kit, head, hair, strand) {
  const face = head.getObjectByName('SculptedFace');
  if (!face) return;
  const source = face.geometry, points = source.attributes.position, normals = source.attributes.normal;
  const vertices = [], indices = [], covered = [], roots = [];
  // The workshop-derived head has broader rear temples than the old ellipsoid.
  // Follow that actual surface so the hair roots cannot sit inside its skin.
  for (let i = 0; i < points.count; i++) {
    const x=points.getX(i),y=points.getY(i),z=points.getZ(i),n=new THREE.Vector3().fromBufferAttribute(normals,i);
    const back=z>-.045,temple=Math.abs(x)>.145&&z>-.105&&y>-.065;
    covered.push((back||temple)&&y>-.185+Math.sin(x*73)*.008);
    const lift=.0065+Math.sin(x*97+y*71)*.0012;
    vertices.push(x+n.x*lift,y+n.y*lift,z+n.z*lift);
    if(covered[i]&&y>-.08&&y<.21&&z>-.04)roots.push([x+n.x*.010,y+n.y*.010,z+n.z*.010]);
  }
  const sourceIndex=source.index;
  for(let i=0;i<sourceIndex.count;i+=3){const a=sourceIndex.getX(i),b=sourceIndex.getX(i+1),c=sourceIndex.getX(i+2);if(covered[a]&&covered[b]&&covered[c])indices.push(a,b,c);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',source.attributes.uv.clone());geometry.setIndex(indices);geometry.computeVertexNormals();
  const support=kit.mesh(head,geometry,hair);support.name='FittedRearHairRoots';support.userData.keepSeparate=true;
  const locks=[],stride=Math.max(1,Math.ceil(roots.length/95));
  for(let i=0;i<roots.length;i+=stride){
    const start=roots[i],points=[],length=.16+(Math.sin(i*.71)+1)*.045;
    for(let j=0;j<=6;j++){const t=j/6,curl=Math.sin(t*7+i*.37)*.0035;points.push([start[0]+Math.sign(start[0])*.018*Math.sin(t*Math.PI*.7)+curl,start[1]-length*t,start[2]+.023*t+Math.cos(t*7+i*.37)*.003]);}
    locks.push({points,width:.0011});
  }
  groom(kit,head,strand,locks,'RearTempleHairLocks');
}

export function createNpcHair({ kit, head, id, design, hair }) {
  const long = design.longHair, wave = id === 'hagrid' ? .007 : id === 'snape' ? .001 : .003;
  const strand = kit.material({ color: new THREE.Color(design.hair).multiplyScalar(id === 'hagrid' ? 1.18 : 1.12), roughness: .82, side: THREE.DoubleSide });
  const fine = kit.material({ color: new THREE.Color(design.hair).multiplyScalar(1.03), roughness: .9, side: THREE.DoubleSide });
  if(id==='hagrid')coverHagridRearScalp(kit,head,hair,strand);
  const width = id === 'hagrid' ? .209 : .186, crown = id === 'hagrid' ? .278 : .264;
  const hairline = angle => {
    const front = Math.max(0, -Math.cos(angle));
    const parted = id === 'hagrid' || id === 'snape' ? .22 * Math.exp(-((Math.sin(angle) / .28) ** 2)) * front : 0;
    const base = 1.76 - front * .72 - parted + Math.sin(angle * 3) * .025;
    return base + Math.sin(angle * 19) * .021 + Math.sin(angle * 37) * .008;
  };
  const scalp = (angle, t, lift = 0) => {
    const theta = hairline(angle) * t;
    return [Math.sin(angle) * (width + lift) * Math.sin(theta), crown * Math.cos(theta) + .006, Math.cos(angle) * (.202 + lift) * Math.sin(theta) - .042];
  };
  // An irregular hairline and hidden dark root volume keep the fine groom from
  // showing a hard, straight cap seam between the strands.
  const rows = 22, columns = 64, vertices = [], indices = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) vertices.push(...scalp(column / columns * Math.PI * 2, row / rows));
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + columns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const cap = new THREE.BufferGeometry(); cap.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); cap.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2)); cap.setIndex(indices); cap.computeVertexNormals();
  const scalpMesh = kit.mesh(head, cap, hair); scalpMesh.name = 'ContouredHairRoots';
  const main = [], details = [], count = id === 'hagrid' ? 740 : long ? 540 : 360;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963229728653, start = .06 + ((i * .61803398875) % 1) * .65;
    const front = Math.max(0, -Math.cos(angle)), extension = long ? (id === 'hagrid' ? .40 : id === 'snape' ? .25 : .29) * Math.max(0, Math.min(1, (.94 - front) / .28)) : 0;
    const points = [];
    for (let j = 0; j <= 9; j++) {
      const progress = j / 9, t = start + (1.05 - start) * progress;
      const bend = Math.sin(progress * 6 + i * .8) * wave;
      const position = scalp(angle + Math.sin(progress * 2 + i) * .025, Math.min(1, t), .0025 + Math.sin(i * 1.7) * .001);
      const hanging = Math.max(0, (progress - .50) / .50);
      position[0] += Math.sin(angle) * (extension * .05 * hanging + bend);
      position[1] -= extension * hanging + Math.max(0, t - 1) * .06;
      position[2] += Math.cos(angle) * bend;
      points.push(position);
    }
    (i % 4 === 0 ? details : main).push({ points, width: id === 'hagrid' ? .00105 : .0008 });
  }
  groom(kit, head, strand, main, 'DirectionalHairStrands'); groom(kit, head, fine, details, 'FineHairStrands');
  if (design.bun) {
    kit.oval(head, hair, [0, .12, .178], [.083, .083, .066]);
    const bun = [];
    for (let i = 0; i < 90; i++) {
      const a = i * 2.399963, points = [];
      for (let j = 0; j <= 8; j++) { const t = j / 8 * Math.PI * 1.8, radius = .068 + Math.sin(i * 1.6) * .005; points.push([Math.sin(a + t) * radius, .12 + Math.cos(a + t) * radius, .18 + Math.sin(t * .52) * .06]); }
      bun.push({ points, width: .0009 });
    }
    groom(kit, head, strand, bun, 'WoundHairBun');
  }
  if (design.beard) {
    const length = design.longBeard ? .48 : id === 'hagrid' ? .32 : .22;
    // Fine tapered locks hide the root volume; the upper centre stays clear so
    // the mouth can articulate rather than disappearing behind a beard slab.
    const beardVertices = [], beardIndices = [];
    for (let row = 0; row <= 18; row++) for (let column = 0; column <= 32; column++) {
      const t = row / 18, u = column / 32 * 2 - 1, taper = 1 - .58 * t ** 1.6;
      beardVertices.push(u * .16 * taper, -.09 - t * length - (1 - Math.abs(u)) * .038 * (1 - t) + t * Math.abs(u) ** 1.5 * .095 + Math.sin(u * 13) * .006 * t, -.162 + t * .024 + u * u * .041 + Math.sin(u * 21 + t * 5) * .002);
    }
    for (let row = 0; row < 18; row++) for (let column = 0; column < 32; column++) { const a = row * 33 + column, b = a + 33; beardIndices.push(a, a + 1, b, a + 1, b + 1, b); }
    const roots = new THREE.BufferGeometry(); roots.setAttribute('position', new THREE.Float32BufferAttribute(beardVertices, 3)); roots.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(beardVertices.length / 3 * 2), 2)); roots.setIndex(beardIndices); roots.computeVertexNormals(); kit.mesh(head, roots, hair);
    const beard = [], beardDetail = [], beardCount = id === 'hagrid' ? 640 : 500;
    for (let i = 0; i < beardCount; i++) {
      const u = (i * .61803398875) % 1, x = (u * 2 - 1) * .159, progress = (i * .41421356) % 1;
      const startY = -.085 - progress * length * .74 - (Math.abs(x) < .052 ? .045 : 0);
      const points = [];
      for (let j = 0; j <= 7; j++) {
        const t = j / 7, endY = -.105 - length + Math.abs(x) / .159 * .075 + Math.sin(i * 2.31) * .017;
        const y = Math.max(endY, startY - t * length * .45), taper = 1 - .48 * Math.max(0, (-y - .08) / length);
        const curl = Math.sin(t * 8 + i * .7) * (id === 'hagrid' ? .0035 : .0014);
        points.push([x * taper + curl, y, -.166 + (Math.abs(x) / .16) ** 2 * .041 + (-y - .08) * .023 + Math.cos(t * 8 + i) * wave * .55]);
      }
      (i % 4 === 0 ? beardDetail : beard).push({ points, width: id === 'hagrid' ? .0010 : .00075 });
    }
    groom(kit, head, strand, beard, 'DirectionalBeardStrands'); groom(kit, head, fine, beardDetail, 'FineBeardStrands');
    const moustache = [];
    for (const side of [-1, 1]) for (let i = 0; i < 70; i++) {
      const points = [];
      for (let j = 0; j <= 6; j++) { const t = j / 6; points.push([side * (.005 + t * (.040 + (Math.sin(i * 2.31) + 1) * .009)), -.075 - t * .018 + Math.sin(i) * .004 + Math.sin(t * 3.1) * .004, -.186 + t * .018 + Math.cos(i) * .003]); }
      moustache.push({ points, width: .00075 });
    }
    groom(kit, head, strand, moustache, 'MoustacheStrands');
  }
}
