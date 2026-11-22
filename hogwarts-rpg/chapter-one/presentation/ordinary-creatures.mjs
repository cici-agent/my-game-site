import * as THREE from 'three';
import { createSculptureKit } from './npcs.mjs';
import { creatureSurface, creatureTufts, visualDt, creatureFloorSupport } from './creature-detail.mjs';

const clamp = THREE.MathUtils.clamp;
function pivot(parent, name, x = 0, y = 0, z = 0) { const root = new THREE.Group(); root.name = name; root.position.set(x, y, z); parent.add(root); return root; }
function fur(kit, parent, material, center, radii, count, length) {
  return creatureTufts(kit, parent, material, { name: `${parent.name}FineFur`, center, radii, count, length, lower: -1 });
}

export function createCommonSpider() {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedCreature:CommonSpider';
  root.userData.visualKind = 'common-spider'; root.userData.legCount = 8;
  const surface = creatureSurface(kit, 'fur');
  const shell = kit.material({ color: '#776052', roughness: .58, map: surface, bumpMap: surface, bumpScale: .0018 });
  const abdomenSkin = kit.material({ color: '#665446', roughness: .83, map: surface, bumpMap: surface, bumpScale: .002 });
  const stripe = kit.material({ color: '#9b8061', roughness: .88 });
  const dark = kit.material({ color: '#27241f', roughness: .7 });
  const eye = kit.material({ color: '#151411', roughness: .17, metalness: .12 });
  const glint = kit.material({ color: '#b5ac8d', roughness: .23 });
  const body = pivot(root, 'SpiderBody', 0, .28, 0), head = pivot(body, 'SpiderHead', 0, .025, -.25);
  kit.oval(body, abdomenSkin, [0, .08, .23], [.245, .22, .295]); kit.oval(body, shell, [0, .015, -.08], [.19, .145, .23]);
  kit.oval(head, shell, [0, 0, -.015], [.15, .11, .13]);
  for (let i = 0; i < 5; i++) {
    const z = .06 + i * .073, width = .13 * Math.sin((i + 1) / 6 * Math.PI);
    kit.tube(body, stripe, [[-width, .235 - Math.abs(i - 2) * .019, z], [0, .295 - Math.abs(i - 2) * .024, z + .018], [width, .235 - Math.abs(i - 2) * .019, z]], .006);
  }
  const fangs = [], palps = [];
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      const x = side * (.025 + row % 2 * .055), y = .029 + Math.floor(row / 2) * .037, z = -.125 + (row % 2) * .012;
      kit.oval(head, eye, [x, y, z], [row < 2 ? .022 : .015, row < 2 ? .024 : .017, .014]);
      kit.oval(head, glint, [x - .004, y + .006, z - .011], [.004, .004, .003]);
    }
    const fang = pivot(head, `SpiderFang:${side}`, side * .047, -.035, -.09);
    kit.tube(fang, dark, [[0, 0, 0], [side * .019, -.045, -.07], [-side * .015, -.065, -.10]], .017); kit.bake(fang); fangs.push({ joint: fang, side });
    const palp = pivot(head, `SpiderPalp:${side}`, side * .1, -.015, -.04);
    kit.tube(palp, shell, [[0, 0, 0], [side * .08, -.035, -.11], [side * .05, -.07, -.17]], .012); kit.bake(palp); palps.push({ joint: palp, side });
    kit.oval(body, dark, [side * .055, -.02, .505], [.026, .042, .047]);
  }
  fur(kit, body, stripe, [0, .08, .23], [.245, .22, .295], 100, .020);
  fur(kit, head, shell, [0, 0, -.015], [.15, .11, .13], 48, .012);
  kit.bake(body); kit.bake(head);

  const boneGeometry = kit.geometry(new THREE.CylinderGeometry(1, .72, 1, 10, 1)), jointGeometry = kit.geometry(new THREE.SphereGeometry(1, 12, 8));
  const bones = new THREE.InstancedMesh(boneGeometry, shell, 24), joints = new THREE.InstancedMesh(jointGeometry, dark, 24);
  kit.trackInstance(bones); kit.trackInstance(joints);
  bones.name = 'SpiderArticulatedLegs'; joints.name = 'SpiderLegJoints'; bones.castShadow = bones.receiveShadow = joints.castShadow = joints.receiveShadow = true; body.add(bones, joints);
  bones.instanceMatrix.setUsage(THREE.DynamicDrawUsage); joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bones.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.2); joints.boundingSphere = bones.boundingSphere.clone();
  const dummy = new THREE.Object3D(), start = new THREE.Vector3(), end = new THREE.Vector3(), delta = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const legPoints = new Float32Array(8 * 4 * 3);
  const floorSupport = creatureFloorSupport(body, new Set([bones,joints])), supportPoint = new THREE.Vector3();
  const legBounds = new THREE.Box3(); bones.boundingBox = new THREE.Box3(); joints.boundingBox = new THREE.Box3();
  let time = 0, gait = 0, down = 0, recoil = 0, lastAction = 'idle', releaseAge = 2, disposed = false;
  function update(dt, state = {}) {
    if (disposed) return; dt = visualDt(dt); time += dt;
    const action = state.action ?? 'idle', speed = Math.max(0, state.speed ?? 0), walking = clamp(speed / 1.1, 0, 1), attacking = action === 'attack';
    if (lastAction === 'attack' && !attacking && state.attackPhase === 'recover' && !['hurt','downed','dead'].includes(action)) releaseAge = 0;
    if (action === 'hurt' && lastAction !== action) recoil = 1;
    if (['downed','dead'].includes(action)) releaseAge = 2;
    recoil *= Math.exp(-dt * 10); releaseAge += dt; lastAction = action;
    gait += dt * speed * 8; down = THREE.MathUtils.damp(down, ['downed', 'dead'].includes(action) ? 1 : 0, 7, dt);
    const windup = attacking ? clamp(state.windupProgress ?? .5, 0, 1) : 0, lunge = releaseAge < .4 ? Math.sin(releaseAge / .4 * Math.PI) : 0;
    body.position.y = .28 - down * .16 + Math.sin(time * 3) * .005 + lunge * .035;
    body.position.z = -lunge * .09 + recoil * .035; body.rotation.set(windup * .16 - lunge * .12 - recoil * .11, 0, down * .32 + Math.sin(gait) * .012 * walking + recoil * .07);
    head.rotation.x = -windup * .10; head.rotation.y = Math.sin(time * 1.1) * .045 * (1 - down);
    for (const { joint, side } of fangs) joint.rotation.y = side * (windup * .32 - lunge * .18) * (1 - down);
    for (const { joint, side } of palps) { joint.rotation.y = side * (.06 * Math.sin(time * 2.6 + side) + windup * .18) * (1 - down); joint.rotation.x = recoil * .2; }
    for (let leg = 0; leg < 8; leg++) {
      const side = leg < 4 ? -1 : 1, row = leg % 4, phase = gait + (row % 2 + (side < 0 ? 0 : 1)) * Math.PI;
      const lift = Math.max(0, Math.sin(phase)) * .085 * walking * (1 - down), sweep = Math.cos(phase) * .085 * walking * (1 - down);
      const z = -.22 + row * .13, footZ = [-.48, -.17, .19, .48][row], raised = row === 0 ? windup * .31 : 0;
      const points = [[side * .14, .015, z], [side * (.37 - down * .10), .11 + raised * .22, z + (row - 1.5) * .045], [side * (.54 - down * .23), -.08 + lift + raised * .85 + down * .13, footZ + sweep * .7], [side * (.64 - down * .36), -.265 + lift + raised + down * .24, footZ + sweep]];
      points.forEach((p, i) => legPoints.set(p, (leg * 4 + i) * 3));
      for (let part = 0; part < 3; part++) {
        start.fromArray(points[part]); end.fromArray(points[part + 1]); delta.subVectors(end, start);
        dummy.position.copy(start).addScaledVector(delta, .5); dummy.quaternion.setFromUnitVectors(up, delta.clone().normalize()); dummy.scale.set(.026 - part * .006, delta.length(), .026 - part * .006); dummy.updateMatrix(); bones.setMatrixAt(leg * 3 + part, dummy.matrix);
        dummy.position.copy(start); dummy.quaternion.identity(); dummy.scale.setScalar(.033 - part * .006); dummy.updateMatrix(); joints.setMatrixAt(leg * 3 + part, dummy.matrix);
      }
    }
    bones.instanceMatrix.needsUpdate = true; joints.instanceMatrix.needsUpdate = true;
    // Dynamic leg bounds must follow curled feet instead of retaining the first
    // standing pose. The 32 authored joint points also provide floor support.
    let legMinimum = Infinity; legBounds.makeEmpty(); body.updateMatrix();
    for (let point = 0; point < 32; point++) {
      supportPoint.fromArray(legPoints,point*3); legBounds.expandByPoint(supportPoint);
      legMinimum = Math.min(legMinimum,supportPoint.applyMatrix4(body.matrix).y-.033);
    }
    legBounds.expandByScalar(.033); bones.boundingBox.copy(legBounds); joints.boundingBox.copy(legBounds);
    if (down > .0001) floorSupport.lift(.002,legMinimum);
  }
  update(0);
  return { root, forward: 'negative-z', dimensions: { height: .65, radius: .42 }, update,
    debugSnapshot: () => ({ kind: 'spider', legs: 8, jointsPerLeg: 3, legPoints: [...legPoints], down, recoil, releaseAge }),
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); kit.dispose(); root.clear(); } };
}

export function createCommonBat() {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedCreature:CommonBat'; root.userData.visualKind = 'common-bat';
  const furMap = creatureSurface(kit, 'fur');
  const furMaterial = kit.material({ color: '#83705a', roughness: .91, map: furMap, bumpMap: furMap, bumpScale: .002 });
  const furEdge = kit.material({ color: '#b09b77', roughness: .96 });
  const membrane = kit.material({ color: '#755c50', roughness: .79, side: THREE.DoubleSide, bumpMap: kit.texture('skin'), bumpScale: .001, metalness: 0 });
  const veins = kit.material({ color: '#b49578', roughness: .72 }), cartilage = kit.material({ color: '#473a31', roughness: .7 });
  const innerEar = kit.material({ color: '#9d7c6a', roughness: .88 }), eye = kit.material({ color: '#151715', roughness: .12 }), glint = kit.material({ color: '#bbb395', roughness: .2 });
  const body = pivot(root, 'BatBody', 0, 1.1, 0), head = pivot(body, 'BatHead', 0, .18, -.045);
  kit.oval(body, furMaterial, [0, -.015, .01], [.135, .235, .14]); kit.oval(body, furEdge, [0, -.04, -.11], [.092, .14, .032]);
  kit.oval(head, furMaterial, [0, 0, 0], [.145, .125, .118]); kit.oval(head, cartilage, [0, -.035, -.12], [.06, .038, .048]);
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = pivot(head, `BatEar:${side}`, side * .095, .08, .01); ear.rotation.z = side * -.22;
    ears.push({ear,side});
    kit.oval(ear, furMaterial, [0, .105, 0], [.064, .16, .035]); kit.oval(ear, innerEar, [0, .105, -.025], [.041, .12, .015]);
    kit.tube(ear, cartilage, [[side * .019, .015, -.024], [side * .032, .09, -.035], [0, .23, -.012]], .0035); kit.bake(ear);
    kit.oval(head, eye, [side * .074, .015, -.105], [.021, .023, .012]); kit.oval(head, glint, [side * .074 - .005, .020, -.115], [.004, .004, .003]);
    kit.oval(head, eye, [side * .023, -.034, -.163], [.009, .006, .005]);
    kit.tube(body, cartilage, [[side * .065, -.18, .01], [side * .09, -.29, .06], [side * .065, -.30, .02]], .014);
    for (let toe = 0; toe < 3; toe++) kit.tube(body, cartilage, [[side * .067 + toe * .01, -.29, .04], [side * .067 + toe * .01, -.32, .005], [side * .067 + toe * .01, -.30, -.01]], .004);
  }
  fur(kit, body, furEdge, [0, -.015, .01], [.135, .235, .14], 90, .013); fur(kit, head, furMaterial, [0, 0, 0], [.145, .125, .118], 54, .01);
  const tailGeometry = new THREE.BufferGeometry(); tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.09, -.24, .05, 0, -.32, .27, .09, -.24, .05, -.09, -.24, .05, .09, -.24, .05, 0, -.10, .12], 3)); tailGeometry.computeVertexNormals(); kit.mesh(body, tailGeometry, membrane);
  kit.tube(body, cartilage, [[0, -.16, .12], [0, -.24, .20], [0, -.32, .27]], .009);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = pivot(body, side < 0 ? 'BatLeftWing' : 'BatRightWing', side * .11, .06, -.01), shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.quadraticCurveTo(side * .18, -.15, side * .40, -.23); shape.lineTo(side * .91, -.12);
    shape.quadraticCurveTo(side * .61, -.01, side * .74, .28); shape.quadraticCurveTo(side * .46, .13, side * .43, .47);
    shape.quadraticCurveTo(side * .25, .30, side * .08, .25); shape.lineTo(0, 0);
    const geometry = new THREE.ShapeGeometry(shape, 18); geometry.rotateX(Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setY(i, -.022 * Math.sin(Math.abs(positions.getX(i)) * Math.PI / .92));
    geometry.computeVertexNormals(); kit.mesh(wing, geometry, membrane);
    const elbow = [side * .23, .015, -.10], wrist = [side * .40, 0, -.23];
    kit.tube(wing, cartilage, [[0, 0, 0], elbow, wrist], .014);
    for (const tip of [[side * .91, 0, -.12], [side * .74, 0, .28], [side * .43, 0, .47], [side * .08, 0, .25]]) {
      kit.tube(wing, cartilage, [wrist, [tip[0] * .8, -.015, tip[2] * .6], tip], .006);
      kit.tube(wing, veins, [elbow, [tip[0] * .62, -.026, tip[2] * .6], [tip[0] * .86, -.010, tip[2] * .86]], .002);
    }
    kit.tube(wing, cartilage, [elbow, [side * .27, .065, -.19], [side * .26, .09, -.24]], .009);
    kit.bake(wing); wings.push({ wing, side });
  }
  kit.bake(body); kit.bake(head);
  const floorSupport = creatureFloorSupport(body);
  let time = 0, down = 0, recoil = 0, lastAction = 'idle', diveAge = 2, disposed = false;
  function update(dt, state = {}) {
    if (disposed) return; dt = visualDt(dt); time += dt;
    const action = state.action ?? 'idle', attacking = action === 'attack';
    if (lastAction === 'attack' && !attacking && state.attackPhase === 'recover' && !['hurt','downed','dead'].includes(action)) diveAge = 0;
    if(action === 'hurt' && lastAction !== action) recoil = 1;
    if(['downed','dead'].includes(action)) diveAge = 2;
    recoil *= Math.exp(-dt * 9); diveAge += dt; lastAction = action;
    down = THREE.MathUtils.damp(down, ['downed', 'dead'].includes(action) ? 1 : 0, 6, dt);
    const windup = attacking ? clamp(state.windupProgress ?? .5, 0, 1) : 0, dive = diveAge < .55 ? Math.sin(diveAge / .55 * Math.PI) : 0;
    body.position.set(0, 1.1 + Math.sin(time * 11) * .028 + windup * .10 - dive * .17 - down * .91, -dive * .18 + recoil * .045);
    body.rotation.set(windup * .13 - dive * .42 - recoil * .18, 0, down * .7 + Math.sin(time * 2.2) * .025 * (1 - down) + recoil * .20);
    head.rotation.y = Math.sin(time * 1.4) * .055 * (1 - down);
    for (const {ear,side} of ears) { ear.rotation.z=side*(-.22+Math.sin(time*2.1+side)*.025*(1-down)-recoil*.15); ear.rotation.x=windup*-.12; }
    for (const { wing, side } of wings) { wing.rotation.z = side * ((.10 + Math.sin(time * 18) * (.65 - windup * .18)) * (1 - down) + down * 1.22); wing.rotation.y = side * (-windup * .32 + dive * .18); }
    if (down > .0001) floorSupport.lift(.002);
  }
  update(0);
  return { root, forward: 'negative-z', dimensions: { height: 1.7, radius: .36 }, update,
    debugSnapshot: () => ({ kind: 'bat', wingCount: wings.length, bodyHeight: body.position.y, wingAngles: wings.map(({ wing }) => wing.rotation.z), down, recoil, diveAge }),
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); kit.dispose(); root.clear(); } };
}
