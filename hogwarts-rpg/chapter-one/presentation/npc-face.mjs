import * as THREE from 'three';
import { createNpcHeadSurface } from './npc-head-surface.mjs';

// A continuous face surface, with small articulated details. These are authored
// supporting-actor faces, not a replacement for any of the workshop GLBs.
const profiles = {
  hagrid: { width: .191, height: .232, jaw: .06, nose: .054, cheek: .019, eye: .070, brow: .012, mouth: .040, age: .35 },
  mcgonagall: { width: .160, height: .235, jaw: .22, nose: .050, cheek: .019, eye: .064, brow: .010, mouth: .032, age: .65 },
  snape: { width: .155, height: .243, jaw: .24, nose: .077, cheek: .005, eye: .061, brow: .014, mouth: .034, age: .35 },
  flitwick: { width: .175, height: .214, jaw: .13, nose: .044, cheek: .017, eye: .065, brow: .012, mouth: .035, age: .8 },
  dumbledore: { width: .166, height: .242, jaw: .18, nose: .055, cheek: .012, eye: .064, brow: .014, mouth: .035, age: 1 },
  quirrell: { width: .161, height: .234, jaw: .21, nose: .047, cheek: .007, eye: .063, brow: .006, mouth: .031, age: .25 },
  molly: { width: .181, height: .222, jaw: .09, nose: .039, cheek: .021, eye: .068, brow: .005, mouth: .038, age: .25 },
  sprout: { width: .184, height: .219, jaw: .08, nose: .045, cheek: .019, eye: .067, brow: .008, mouth: .038, age: .55 },
  filch: { width: .168, height: .246, jaw: .19, nose: .069, cheek: .004, eye: .062, brow: .015, mouth: .036, age: .9 },
  pince: { width: .154, height: .238, jaw: .23, nose: .058, cheek: .013, eye: .061, brow: .009, mouth: .030, age: .65 },
  draco: { width: .156, height: .216, jaw: .16, nose: .038, cheek: .008, eye: .062, brow: .004, mouth: .032, age: 0 },
  wood: { width: .174, height: .226, jaw: .08, nose: .044, cheek: .011, eye: .067, brow: .008, mouth: .037, age: 0 },
  hooch: { width: .166, height: .228, jaw: .15, nose: .044, cheek: .015, eye: .065, brow: .009, mouth: .034, age: .35 },
  default: { width: .170, height: .226, jaw: .14, nose: .047, cheek: .013, eye: .066, brow: .008, mouth: .035, age: .25 },
};
export function createNpcFace({ kit, head, id, skin, skinWarm, hair, ivory, brass, glasses = false }) {
  const p = profiles[id] ?? profiles.default;
  const { geometry, landmarks } = createNpcHeadSurface(p);
  const skinMap = kit.texture('skin', 256), texels = skinMap.image.data;
  skinMap.repeat.set(1, 1); skinMap.wrapS = skinMap.wrapT = THREE.ClampToEdgeWrapping;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4, noise = texels[i] / 255, u = (x / 255 - .5) / 2, v = (y / 255 - .5) / 2;
    const ageMarks = p.age * Math.max(0, Math.sin(u * 119 + Math.sin(v * 37) * 2) * Math.sin(v * 131)) ** 12 * 7;
    const warmth = Math.max(0, 1 - Math.abs(Math.abs(u) - .09) / .06) * Math.max(0, 1 - Math.abs(v + .025) / .07);
    const value = 246 + noise * 7 - ageMarks;
    texels[i] = value; texels[i + 1] = value - warmth * 4; texels[i + 2] = value - warmth * 5; texels[i + 3] = 255;
  }
  skinMap.needsUpdate = true;
  const complexion = kit.material({ color: skin.color, map: skinMap, roughness: .73, bumpMap: skin.bumpMap, bumpScale: .0009, vertexColors: true });
  const mouthPoint = landmarks[13].clone().lerp(landmarks[14], .5), morph = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const x = geometry.attributes.position.getX(i), y = geometry.attributes.position.getY(i), z = geometry.attributes.position.getZ(i);
    const lowerFace = Math.max(0, Math.min(1, (mouthPoint.y - y) / .022));
    const weight = Math.exp(-((x / .083) ** 2)) * Math.max(0, Math.min(1, (-z - .075) / .035)) * lowerFace;
    morph[i * 3 + 1] = -.003 * weight; morph[i * 3 + 2] = -.0005 * weight;
  }
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(morph, 3)]; geometry.morphTargetsRelative = true;
  const surface = kit.mesh(head, geometry, complexion); surface.name = 'SculptedFace'; surface.userData.faceProfile = id; surface.userData.keepSeparate = true;
  surface.userData.sourceTopology = 'mediapipe-canonical-468';
  kit.oval(head, skin, [0, -.215, .018], [.073, .10, .070]);
  const white = kit.material({ color: '#bcb8aa', roughness: .59 });
  const iris = kit.material({ color: id === 'hooch' ? '#89784a' : id === 'hagrid' ? '#392a20' : id === 'snape' ? '#3b3d3a' : '#52625b', roughness: .5 });
  const pupil = kit.material({ color: '#161914', roughness: .38 });
  const mouthDark = kit.material({ color: '#493232', roughness: 1 });
  const gaze = new THREE.Group(); gaze.name = 'EyeGaze'; head.add(gaze);
  const lids = [], eyes = [];
  for (const [side, outer, inner, upper, lower] of [[-1, 33, 133, 159, 145], [1, 263, 362, 386, 374]]) {
    const centre = landmarks[outer].clone().lerp(landmarks[inner], .5);
    centre.y = (landmarks[upper].y + landmarks[lower].y) / 2;
    centre.z = Math.min(landmarks[upper].z, landmarks[lower].z) + .008;
    const halfWidth = Math.abs(landmarks[outer].x - landmarks[inner].x) / 2 + .002;
    const halfHeight = (landmarks[upper].y - landmarks[lower].y) / 2 + .001;
    const earX = side * p.width;
    kit.oval(head, skin, [earX, .002, .007], [.029, .055, .026]);
    kit.oval(head, skinWarm, [earX + side * .012, .002, -.014], [.012, .030, .006]);
    kit.tube(head, skin, [[earX + side * .016, .034, -.010], [earX + side * .024, .002, -.014], [earX + side * .012, -.031, -.011]], .0035);
    kit.oval(head, white, centre.toArray(), [halfWidth, halfHeight, .010]);
    const irisAt = centre.clone(); irisAt.z -= .009;
    kit.oval(gaze, iris, irisAt.toArray(), [.009, halfHeight * .95, .002]);
    kit.oval(gaze, pupil, [irisAt.x, irisAt.y, irisAt.z - .0015], [.004, .005, .001]);
    kit.oval(gaze, ivory, [irisAt.x - .002, irisAt.y + .003, irisAt.z - .0025], [.0010, .0010, .0005]);
    const lid = kit.oval(head, skin, [centre.x, landmarks[upper].y + .002, centre.z - .008], [halfWidth * 1.05, .003, .005]);
    lid.name = side < 0 ? 'UpperEyelidL' : 'UpperEyelidR'; lid.userData.keepSeparate = true;
    lids.push({ mesh: lid, y: landmarks[upper].y + .002, z: centre.z - .008, height: halfHeight });
    const browY = landmarks[upper].y + .022;
    kit.tube(head, hair, [[centre.x - halfWidth * 1.1, browY - .005, centre.z - .012], [centre.x, browY, centre.z - .024], [centre.x + halfWidth * 1.1, browY - .005, centre.z - .012]], id === 'dumbledore' ? .004 : .0026);
    if (glasses) {
      kit.mesh(head, new THREE.TorusGeometry(halfWidth * 1.25, .0023, 6, 28), brass, [centre.x, centre.y, centre.z - .028], [1.05, id === 'dumbledore' ? .64 : .80, 1]);
      kit.tube(head, brass, [[centre.x + side * halfWidth * 1.25, centre.y, centre.z - .027], [earX, centre.y + .005, -.02], [earX, .020, .025]], .0022);
    }
    eyes.push(centre);
  }
  if (glasses) kit.tube(head, brass, [[eyes[0].x + .037, eyes[0].y, eyes[0].z - .028], [0, eyes[0].y + .008, eyes[0].z - .039], [eyes[1].x - .037, eyes[1].y, eyes[1].z - .028]], .0024);
  kit.bake(gaze);
  const mouthWidth = Math.abs(landmarks[61].x - landmarks[291].x) / 2 * .90;
  const mouth = kit.oval(head, mouthDark, [mouthPoint.x, mouthPoint.y, mouthPoint.z + .002], [mouthWidth, .005, .005]);
  mouth.name = 'SpeakingMouth'; mouth.userData.keepSeparate = true;
  const seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0), gazeTarget = new THREE.Vector2();
  let time = seed * .029, nextBlink = time + 1.1 + seed % 17 * .13, blinkTime = -1, speaking = 0;
  function update(dt, { lookX = 0, lookY = 0, talking = false, inactive = false } = {}) {
    time += dt; speaking = THREE.MathUtils.damp(speaking, talking && !inactive ? 1 : 0, 10, dt);
    if (blinkTime < 0 && time >= nextBlink) blinkTime = 0;
    let closure = 0;
    if (blinkTime >= 0) {
      blinkTime += dt;
      closure = blinkTime < .075 ? Math.sin(blinkTime / .075 * Math.PI / 2) : Math.cos(Math.min(1, (blinkTime - .075) / .14) * Math.PI / 2);
      if (blinkTime >= .215) { blinkTime = -1; nextBlink = time + 2.8 + (Math.sin(time * 2.73 + seed) + 1) * 1.1; }
    }
    closure = inactive ? .65 : Math.max(0, closure);
    for (const lid of lids) { lid.mesh.position.y = lid.y - closure * (lid.height + .002); lid.mesh.scale.y = .003 + closure * (lid.height + .005); lid.mesh.position.z = lid.z - closure * .006; }
    gazeTarget.set(THREE.MathUtils.clamp(lookX, -1, 1) * .003, THREE.MathUtils.clamp(lookY, -1, 1) * .0015);
    gaze.position.x = THREE.MathUtils.damp(gaze.position.x, inactive ? 0 : gazeTarget.x + Math.sin(time * .67) * .0005, 10, dt);
    gaze.position.y = THREE.MathUtils.damp(gaze.position.y, inactive ? 0 : gazeTarget.y, 10, dt);
    const syllable = speaking * (.3 + .7 * Math.max(0, Math.sin(time * 10.8) * Math.cos(time * 3.1)));
    mouth.scale.y = .004 + syllable * .002; mouth.position.y = mouthPoint.y - syllable * .001;
    surface.morphTargetInfluences[0] = syllable;
    return { blink: closure, speaking, gazeX: gaze.position.x, mouthOpen: syllable };
  }
  return { update, profile: Object.freeze({ ...p }), surface };
}
