import * as THREE from 'three';

// Stationary camera and actor, with world-space paving translating opposite travel.
export function createGaitFloor(){
  const material=new THREE.ShaderMaterial({
    uniforms:{visibility:{value:1},travel:{value:0},left:{value:new THREE.Vector3()},right:{value:new THREE.Vector3()}},
    vertexShader:`varying vec3 p;
      void main(){vec4 world=modelMatrix*vec4(position,1.0);p=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`varying vec3 p;
      uniform float travel;uniform float visibility;uniform vec3 left;uniform vec3 right;
      float seam(float value){float px=fwidth(value);float d=abs(fract(value+.5)-.5);
        return (1.-smoothstep(.002,.002+px,d))*min(1.,.23/max(px,.001));}
      float contact(vec3 foot){
        vec2 d=(p.xz-foot.xz-vec2(0.,.060))/vec2(.135,.205);
        float lift=max(0.,foot.y-p.y-.13);
        return .15*exp(-dot(d,d)*1.45-lift*11.);
      }
      void main(){
        float along=(p.z+travel)/.48+.202;
        float across=p.x/.58+.39+mod(floor(along),2.)*.5;
        float grout=max(seam(along),seam(across));
        float fade=exp(-.63*dot(p.xz,p.xz));
        float tone=.009+.008*mod(floor(along)+floor(across)*.37,2.);
        float alpha=(.17*grout+tone)*fade+contact(left)+contact(right);
        gl_FragColor=vec4(.27,.245,.21,min(alpha,.30)*visibility);
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,toneMapped:false
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(12,12),material);
  mesh.rotation.x=-Math.PI/2;mesh.visible=false;mesh.renderOrder=1;
  return mesh;
}
