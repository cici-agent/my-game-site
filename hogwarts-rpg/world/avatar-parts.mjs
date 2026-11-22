import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function rings(rows, segments=14) {
  return new THREE.LatheGeometry(rows.map(([r,y]) => new THREE.Vector2(r,y)), segments);
}

export function tailPatch(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(),3));
  geometry.computeVertexNormals();
  return geometry;
}

// Bake rigid costume pieces into one colored mesh per animated joint.
export function costumePart(parent, material, resources) {
  const pieces = [];
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), size = new THREE.Vector3();
  const quaternion = new THREE.Quaternion(), angles = new THREE.Euler();
  function shape(source, tint, x,y,z, sx=1,sy=1,sz=1, rx=0,ry=0,rz=0) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute('uv');
    quaternion.setFromEuler(angles.set(rx,ry,rz));
    geometry.applyMatrix4(matrix.compose(position.set(x,y,z),quaternion,size.set(sx,sy,sz)));
    const color = new THREE.Color(tint);
    const colors = new Float32Array(geometry.attributes.position.count*3);
    for (let i=0; i<colors.length; i+=3) color.toArray(colors,i);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    pieces.push(geometry);
  }
  return {
    shape,
    oval(tint,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0) {
      shape(new THREE.SphereGeometry(1,12,9),tint,x,y,z,sx,sy,sz,rx,ry,rz);
    },
    finish() {
      const geometry = mergeGeometries(pieces);
      for (const piece of pieces) piece.dispose();
      const mesh = new THREE.Mesh(geometry,material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      resources?.push(geometry);
      return mesh;
    }
  };
}

