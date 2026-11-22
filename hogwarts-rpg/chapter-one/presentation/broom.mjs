import * as THREE from 'three';
import { createSculptureKit } from './npcs.mjs';

/** Attach root below the rider's pelvis; all coordinates are local metres.
 * Forward is -Z. The caller owns root position/yaw and riding physics. */
export function createBroom({ scale = 1 } = {}) {
  const root = new THREE.Group(); root.name = 'RidingBroom';
  const visual = new THREE.Group(), brush = new THREE.Group();
  visual.name = 'BroomVisual'; brush.name = 'BroomTwigs'; brush.position.z = .43;
  root.add(visual); visual.add(brush);
  const kit = createSculptureKit(), grain = kit.texture('wood');
  const shaft = kit.material({ color: '#775237', roughness: .67, bumpMap: grain, bumpScale: .0016 });
  const woodDark = kit.material({ color: '#493321', roughness: .89, bumpMap: grain, bumpScale: .0011 });
  const twigLight = kit.material({ color: '#9c7c4b', roughness: .94, bumpMap: grain, bumpScale: .0012 });
  const twigMid = kit.material({ color: '#78603e', roughness: .98, bumpMap: grain, bumpScale: .0012 });
  const brass = kit.material({ color: '#b4995c', metalness: .68, roughness: .36 });
  const leather = kit.material({ color: '#372a20', roughness: .85, bumpMap: kit.texture('cloth'), bumpScale: .0011 });

  kit.tube(visual, shaft, [[0, .065, -1.02], [0, .015, -.91], [0, 0, -.67], [0, 0, -.15], [.008, -.008, .30], [0, -.018, .56]], .026);
  kit.oval(visual, shaft, [0, .065, -1.02], [.026, .025, .028]);
  // Fine longitudinal grain and a small, visibly wrapped gripping area.
  for (let side = 0; side < 5; side++) {
    const angle = side * Math.PI * 2 / 5, x = Math.cos(angle) * .024, y = Math.sin(angle) * .024;
    kit.tube(visual, woodDark, [[x, .01 + y, -.90], [x + .0015, y, -.65], [x, y, -.29], [x + .006, y - .005, .19]], .0011);
  }
  for (let i = 0; i < 11; i++) kit.mesh(visual, new THREE.TorusGeometry(.0272, .0038, 6, 20), leather, [0, 0, -.72 + i * .014], [1, 1, 1], [0, .025, 0]);
  kit.mesh(visual, new THREE.TorusGeometry(.029, .004, 8, 24), brass, [0, 0, -.74]);
  kit.mesh(visual, new THREE.TorusGeometry(.029, .004, 8, 24), brass, [0, 0, -.56]);

  // Each branch follows its own taper and uneven tip; three materials avoid
  // the flat cone silhouette while batching to a small number of draw calls.
  for (let i = 0; i < 58; i++) {
    const angle = i * 2.399963, layer = .45 + (i % 7) / 12;
    const length = .58 + (Math.sin(i * 13.7) + 1) * .042;
    const spread = .145 * layer, x = Math.sin(angle), y = Math.cos(angle);
    const mat = i % 5 === 0 ? woodDark : i % 2 ? twigLight : twigMid;
    const radius = .004 + (i % 3) * .0007;
    kit.tube(brush, mat, [[x * .032, y * .032, -.13], [x * .047, y * .047, .01], [x * spread * .78, y * spread * .78, length * .55], [x * spread, y * spread - .035, length]], radius);
    if (i % 4 === 0) kit.tube(brush, mat, [[x * spread * .7, y * spread * .7, length * .52], [x * (spread + .022), y * spread - .015, length * .82], [x * (spread + .028), y * spread - .02, length + .015]], radius * .60);
  }
  for (const [z, radius] of [[.34, .045], [.41, .053], [.48, .063]]) {
    kit.mesh(visual, new THREE.TorusGeometry(radius, .008, 8, 32), brass, [0, 0, z]);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; kit.oval(visual, woodDark, [Math.sin(a) * radius, Math.cos(a) * radius, z - .005], [.004, .004, .004]); }
  }
  kit.bake(visual); kit.bake(brush);
  root.scale.setScalar(Number.isFinite(scale) && scale > 0 ? scale : 1);
  root.userData.forward = 'negative-z';
  root.userData.riderMount = { x: 0, y: 0, z: 0 };
  root.userData.handGrip = { x: 0, y: 0, z: -.64 };
  let time = 0, bankValue = 0, disposed = false;
  function update(dt, { speed = 0, bank = 0 } = {}) {
    if (disposed) return;
    dt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, .1) : 0;
    speed = Number.isFinite(speed) ? THREE.MathUtils.clamp(speed, 0, 12) : 0;
    bank = Number.isFinite(bank) ? THREE.MathUtils.clamp(bank, -.55, .55) : 0;
    time += dt; bankValue = THREE.MathUtils.damp(bankValue, bank, 8, dt);
    visual.rotation.z = bankValue;
    // Subtle airflow response belongs to the brush, not the authoritative mount.
    brush.rotation.x = Math.sin(time * 7) * Math.min(.022, speed * .002);
    brush.rotation.y = Math.sin(time * 5.7 + .8) * Math.min(.012, speed * .0012);
  }
  function dispose() { if (disposed) return; disposed = true; root.removeFromParent(); kit.dispose(); root.clear(); }
  return { root, forward: 'negative-z', update, dispose };
}
