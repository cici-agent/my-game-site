import * as THREE from 'three';

const lancet = new THREE.Shape();
lancet.moveTo(-.5,0); lancet.lineTo(.5,0); lancet.lineTo(.5,.56);
lancet.quadraticCurveTo(.45,.80,0,1); lancet.quadraticCurveTo(-.45,.80,-.5,.56); lancet.closePath();
const gable = new THREE.Shape();
gable.moveTo(-.5,0); gable.lineTo(.5,0); gable.lineTo(0,1); gable.closePath();
const ridge = new THREE.ExtrudeGeometry(gable,{depth:1,bevelEnabled:false}); ridge.translate(0,0,-.5);
const geometries = {
  block: new THREE.BoxGeometry(1,1,1), blade: new THREE.PlaneGeometry(1,1),
  round: new THREE.CylinderGeometry(1,1,1,12), pillar: new THREE.CylinderGeometry(.85,1,1,10),
  octagon: new THREE.CylinderGeometry(1,1,1,8), spire: new THREE.ConeGeometry(1,1,10),
  foliage: new THREE.IcosahedronGeometry(1,0), sphere: new THREE.SphereGeometry(1,12,8),
  arch: new THREE.ShapeGeometry(lancet,6), ridge,
  ring: new THREE.TorusGeometry(1,.085,7,32), flag: new THREE.BufferGeometry(),
};
geometries.flag.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,-.17,.12, 0,-1,0],3));
geometries.flag.computeVertexNormals();
const surface = new THREE.MeshStandardMaterial({color:0xffffff, roughness:.86, side:THREE.DoubleSide});
const masonry = surface.clone();
masonry.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStoneCoord;varying vec3 vStoneNormal;').replace('#include <project_vertex>', `#include <project_vertex>
    vStoneCoord=(instanceMatrix*vec4(transformed,1.)).xyz; vStoneNormal=normalize(mat3(instanceMatrix)*normal);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vStoneCoord;varying vec3 vStoneNormal;').replace('#include <color_fragment>',`#include <color_fragment>
    vec3 an=abs(vStoneNormal);vec2 uv=an.y>max(an.x,an.z)?vStoneCoord.xz:(an.x>an.z?vStoneCoord.zy:vStoneCoord.xy);
    uv*=vec2(.76,2.2);uv.x+=mod(floor(uv.y),2.)*.49;vec2 tile=floor(uv);
    float variation=fract(sin(dot(tile,vec2(34.782,51.16)))*5384.73);
    vec2 f=fract(uv);vec2 edge=min(f,1.-f);
    vec2 aa=max(fwidth(uv),vec2(.007));vec2 joint=smoothstep(vec2(.008),vec2(.037)+aa*.6,edge);
    float lod=1.-smoothstep(.10,.7,max(aa.x,aa.y));
    diffuseColor.rgb*=mix(1.,(.84+.27*variation)*mix(.68,1.,min(joint.x,joint.y)),lod);`);
};
const light = new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
const glass = new THREE.MeshStandardMaterial({color:0xb2d4cf,metalness:.15,roughness:.32,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide});
const transform = new THREE.Object3D(), vector = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);

// One instance buffer per primitive/material per landmark. Repeated windows,
// roof shingles, trees and steel ribs share geometry and never allocate in tick.
export function meshBatch(parent, name, stoneTints = null) {
  const group = new THREE.Group(); group.name = name; parent.add(group);
  const batches = new Map();
  function record(shape, tint, material) {
    if (material === 'matte' && stoneTints?.has(tint)) material='masonry';
    const key = shape + material;
    if (!batches.has(key)) batches.set(key,{geometry:geometries[shape],material,entries:[]});
    transform.updateMatrix(); batches.get(key).entries.push([transform.matrix.clone(),new THREE.Color(tint)]);
  }
  function put(shape,x,y,z,w,h,d,color,yaw=0,material='matte',tilt=0,roll=0) {
    transform.position.set(x,y,z); transform.scale.set(w,h,d); transform.rotation.set(tilt,yaw,roll,'YXZ');
    record(shape,color,material);
  }
  function beam(ax,ay,az,bx,by,bz,r,color,material='matte') {
    vector.set(bx-ax,by-ay,bz-az); const len = vector.length();
    if (len < .001) return;
    transform.quaternion.setFromUnitVectors(up,vector.divideScalar(len));
    transform.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2); transform.scale.set(r,len,r);
    record('round',color,material);
  }
  function finish() {
    batches.forEach(({geometry,material,entries})=>{
      const mat = material === 'glow' ? light : material === 'glass' ? glass : material === 'masonry' ? masonry : surface;
      const mesh = new THREE.InstancedMesh(geometry,mat,entries.length);
      entries.forEach(([matrix,color],i)=>{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color);});
      mesh.receiveShadow=mesh.castShadow=material === 'matte'||material === 'masonry'; mesh.computeBoundingSphere(); group.add(mesh);
    });
    return group;
  }
  return {group,put,beam,finish};
}
