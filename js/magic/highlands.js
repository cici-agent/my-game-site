import * as THREE from 'three';
import { seeded } from './grounds-layout.js';

// The train ranges well beyond the campus. Keep the painted horizon behind the
// whole journey, even when the camera travels outside the original campus bounds.
function backgroundLayer(mesh, order) {
  mesh.renderOrder=order;mesh.frustumCulled=false;
  mesh.material.depthWrite=false;mesh.material.depthTest=false;
  mesh.onBeforeRender=(_renderer,_scene,camera)=>{
    mesh.position.set(camera.position.x,0,camera.position.z);mesh.updateMatrixWorld();
  };
  return mesh;
}

export function buildHighlands(scene) {
  const sky=new THREE.Mesh(new THREE.SphereGeometry(535,48,24),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    vertexShader:`varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vDirection;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
void main(){vec3 d=normalize(vDirection);float k=max(d.y,0.);float warm=.5+.5*dot(normalize(vec2(-.44,-.90)),normalize(d.xz+vec2(.001)));
vec3 horizon=mix(vec3(.20,.244,.30),vec3(.53,.32,.25),warm*warm);
vec3 color=mix(horizon,vec3(.056,.094,.163),smoothstep(-.02,.44,k));color=mix(color,vec3(.013,.025,.074),smoothstep(.30,1.,k));
vec2 uv=d.xz/(k+.22);float cloud=n(uv*vec2(2.0,4.2))*.6+n(uv*vec2(4.,8.4)+2.)*.28+n(uv*vec2(8.,16.8))*.12;
float haze=smoothstep(.48,.70,cloud)*(1.-smoothstep(.18,.76,k))*smoothstep(-.04,.11,k);color=mix(color,vec3(.196,.174,.212),haze*.55);
vec3 moon=normalize(vec3(-.44,.48,-.90));float dist=length(d-moon);color+=vec3(.85,.59,.30)*exp(-dist*34.)*.31;
color=mix(color,vec3(1.28,1.03,.67),1.-smoothstep(.022,.0238,dist));gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`
  }));scene.add(backgroundLayer(sky,-100));
  for(let layer=0;layer<2;layer++) {
    const points=[],colours=[],rand=seeded(828+layer),N=164,base=layer?320:420;
    const skyline=[];for(let i=0;i<N;i++) {
      const a=i/N*Math.PI*2, d=base+Math.sin(a*5+layer)*10;
      skyline.push([Math.cos(a)*d,20+(Math.sin(a*5.0+layer)*.5+.5)*17+(Math.cos(a*13.+layer*3)*.5+.5)*15+(layer?0:13)+rand()*7,Math.sin(a)*d]);
    }
    for(let i=0;i<N;i++) {
      const a=skyline[i],b=skyline[(i+1)%N],shade=new THREE.Color(layer?0x48576a:0x657181).multiplyScalar(.83+rand()*.20);
      points.push(a[0],-8,a[2],...a,...b,a[0],-8,a[2],...b,b[0],-8,b[2]);
      for(let k=0;k<6;k++)colours.push(shade.r,shade.g,shade.b);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
    const ridge=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,fog:false}));scene.add(backgroundLayer(ridge,-99+layer));
  }
}

export function lakeSurface() {
  // Lit bands change with the viewing angle and gently move beneath the crossing boat.
  return new THREE.ShaderMaterial({ uniforms:{time:{value:0}},
    vertexShader:`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader:`uniform float time;varying vec3 vWorld;
float wave(vec2 p){return sin(p.y*1.9+p.x*.42+time*.85+sin(p.x*.62+time*.3)*1.3)+.45*sin(p.y*4.19+p.x*.84-time*.66);}
void main(){vec2 p=vWorld.xz;float w=wave(p);vec3 norm=normalize(vec3(.025*cos(p.x*.55+time*.3),1.,w*.062));vec3 eye=normalize(cameraPosition-vWorld);
float fresnel=pow(1.-max(dot(eye,norm),.0),2.4);vec3 c=mix(vec3(.008,.034,.049),vec3(.026,.077,.095),fresnel);
float shimmer=smoothstep(.97,1.35,w);c+=vec3(.012,.027,.027)*shimmer;float torch=exp(-abs(p.x+42.+(p.y+116.)*.21)*.09)*(1.-smoothstep(-108.,-59.,p.y));
float breakup=smoothstep(.18,.86,.5+.5*sin(p.x*1.26+p.y*.30+sin(p.y*.18)*2.));c+=shimmer*breakup*torch*vec3(.235,.102,.028);gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}` });
}
