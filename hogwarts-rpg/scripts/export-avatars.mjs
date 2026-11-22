// Export the same joint hierarchy, equipment, and poses used in the game.
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createAvatar} from '../world/player.mjs';
import {normalizeEquipment} from '../world/wardrobe.mjs';

const destination = process.argv[2];
if (!destination) throw new Error('请在命令后指定 GLB 输出目录。');
await mkdir(resolve(destination), {recursive:true});

// The texture-free binary exporter only needs this part of the browser FileReader API.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
};

function recordAnimation(model, name, duration, state, loop) {
  const tracks = [];
  const groups = [];
  model.root.traverse(node=>{
    if (node.isGroup && node !== model.root) groups.push(node);
  });
  const states = groups.map(node=>({
    node, restPosition:node.position.clone(), restRotation:node.quaternion.clone(),
    positions:[], rotations:[]
  }));
  const times = [];
  const frames = Math.ceil(duration * 30);
  const dt = duration / frames;
  for (let i=0; i<30; i++) model.animate(dt, {...state(0), time:i*dt});
  for (let i=0; i<=frames; i++) {
    const time = i * dt;
    times.push(time);
    model.animate(dt, {...state(time), time});
    for (const sample of states) {
      if (loop && i === frames) {
        sample.positions.push(...sample.positions.slice(0,3));
        sample.rotations.push(...sample.rotations.slice(0,4));
      } else {
        sample.positions.push(...sample.node.position.toArray());
        sample.rotations.push(...sample.node.quaternion.toArray());
      }
    }
  }
  for (const {node, restPosition, restRotation, positions, rotations} of states) {
    if (positions.some((value,i)=>Math.abs(value-restPosition.getComponent(i%3))>1e-5))
      tracks.push(new VectorKeyframeTrack(node.uuid+'.position',times,positions));
    const quaternion = restRotation.toArray();
    if (rotations.some((value,i)=>Math.abs(value-quaternion[i%4])>1e-5))
      tracks.push(new QuaternionKeyframeTrack(node.uuid+'.quaternion',times,rotations));
    node.position.copy(restPosition);
    node.quaternion.copy(restRotation);
  }
  return new AnimationClip(name, duration, tracks);
}

for (const [variant,name] of Object.entries({base:'新生',harry:'哈利',ron:'罗恩',hermione:'赫敏'})) {
  const equipment = normalizeEquipment(variant);
  const model = createAvatar({variant, name, isPlayer:true, equipment});
  try {
    model.animate(0,{time:0});
    const clips = [
      recordAnimation(model,'Idle',2*Math.PI/1.75,()=>({}),true),
      recordAnimation(model,'Walk',2*Math.PI/(5+3.1*1.6),()=>({moving:true,speed:3.1}),true),
      recordAnimation(model,'Cast',1.45,t=>({casting:t>.16 && t<.75}),false)
    ];
    for (const effect of ['ContactShadow','CastGlow']) {
      const node = model.root.getObjectByName(effect);
      if (node) node.visible=false;
    }
    model.root.userData = {...model.root.userData,variant,equipment};
    const glb = await new GLTFExporter().parseAsync(model.root,{binary:true,animations:clips});
    await writeFile(join(destination, variant+'.glb'),new Uint8Array(glb));
  } finally {
    model.dispose();
  }
}
