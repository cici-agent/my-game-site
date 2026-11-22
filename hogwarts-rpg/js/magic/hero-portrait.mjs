import * as THREE from 'three';
import { createAvatar } from '../../world/player.mjs';
import { loadEquipment, supportsWardrobe } from '../../world/wardrobe.mjs';

let renderer;
export function showPortrait(canvas,hero){
  try{
    renderer??=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    const w=210,h=200;renderer.setSize(w,h,false);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(27,w/h,.1,12);
    camera.position.set(.65,1.54,-2.65);camera.lookAt(0,1.23,0);
    scene.add(new THREE.HemisphereLight(0xfff4d4,0xa7ac92,2.0));
    const light=new THREE.DirectionalLight(0xffdeaf,2.6);light.position.set(-1,3,-3);scene.add(light);
    const equipment=supportsWardrobe(hero.id)?loadEquipment(hero.id):undefined;
    const model=createAvatar({name:hero.name,variant:hero.id,isPlayer:true,equipment});scene.add(model.root);
    renderer.render(scene,camera);canvas.width=w;canvas.height=h;
    canvas.getContext('2d').drawImage(renderer.domElement,0,0);model.dispose();
  }catch{canvas.hidden=true;}
}
