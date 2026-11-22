import * as THREE from 'three';
import { telegraphDescriptors } from './scene-geometry.mjs';

const clamp = n => Math.max(0, Math.min(1, n));
const point = p => new THREE.Vector3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);
const up = new THREE.Vector3(0, 1, 0);
function dispose(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(object => { if (object.geometry) geometries.add(object.geometry); for (const material of [].concat(object.material ?? [])) materials.add(material); });
  root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear();
}
const material = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
function floorMesh(parent, geometry, mat, x = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, mat); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .035, z); parent.add(mesh); return mesh;
}

// Deliberately flat warnings. The warning describes an attack area, while the
// subsequent silk/swoop effect describes the attack; neither is a damage ray.
export function createEnemyWarning(attack, templateId = '') {
  const root = new THREE.Group(); root.name = `AttackWarning:${attack.id}`;
  root.userData.attack = attack;
  const fills = [], rings = [];
  for (const d of telegraphDescriptors(attack)) {
    const area = new THREE.Group(); area.position.set(d.x, 0, d.z); area.rotation.y = d.shape === 'cone' ? Math.PI + d.yaw : d.yaw; root.add(area);
    const ink = material(0xdcb47b, .07), border = material(0xe9c795, .45);
    let geometry;
    if (d.shape === 'line') {
      geometry = new THREE.PlaneGeometry(d.width, d.length);
      // Dashed edges and small floor chevrons replace the solid red beam.
      const stripe = new THREE.PlaneGeometry(.035, .23);
      for (let z = -d.length / 2 + .2; z < d.length / 2; z += .55) {
        for (const side of [-1, 1]) floorMesh(area, stripe, border, side * d.width / 2, z);
      }
      const chevron = new THREE.Shape(); chevron.moveTo(-.14, -.05); chevron.lineTo(0, .12); chevron.lineTo(.14, -.05); chevron.lineTo(0, .025); chevron.closePath();
      const arrow = new THREE.ShapeGeometry(chevron);
      for (let z = -d.length / 2 + .7; z < d.length / 2 - .2; z += 1.4) floorMesh(area, arrow, border, 0, z);
    } else {
      geometry = d.shape === 'circle' ? new THREE.CircleGeometry(d.radius, 48) : new THREE.CircleGeometry(d.radius, 48, Math.PI / 2 - d.arc / 2, d.arc);
      floorMesh(area, d.shape === 'circle' ? new THREE.RingGeometry(d.radius - .045, d.radius, 48) : new THREE.RingGeometry(d.radius - .045, d.radius, 48, 1, Math.PI / 2 - d.arc / 2, d.arc), border);
    }
    fills.push(floorMesh(area, geometry, ink));
  }
  const source = point(attack.origin), charge = floorMesh(root, new THREE.RingGeometry(.48, .52, 48), material(0xefd5a5, .7), source.x, source.z); rings.push(charge);
  root.userData.update = now => {
    const progress = clamp((now - attack.startAt) / Math.max(1, attack.releaseAt - attack.startAt));
    fills.forEach(fill => { fill.material.opacity = .045 + progress * .11; });
    rings.forEach(ring => { ring.scale.setScalar(1.45 - progress * .55); ring.material.opacity = .35 + progress * .45; });
  };
  root.userData.dispose = () => dispose(root); root.userData.templateId = templateId;
  return root;
}

export function createEnemyStrike({ attack, templateId = '', hit = false } = {}) {
  if (!attack?.origin || !attack?.aim) return null;
  const root = new THREE.Group(); root.name = `EnemyStrike:${attack.id}`;
  const spider = templateId.startsWith('PAPER'), bat = templateId.startsWith('BOX');
  const start = point(attack.origin), end = point(attack.aim);
  start.y += spider ? .43 : bat ? 1.08 : 1.1; end.y += .95;
  const length = end.distanceTo(start);
  const duration = Math.max(.23, Math.min(.48, length / 23));
  const moving = new THREE.Group(); root.add(moving);
  const silk = material(spider ? 0xc7dec9 : bat ? 0xb7cbd1 : 0xe5b37c, .84);
  const halo = material(spider ? 0xc8e5d3 : 0xd4e4e6, .2);
  const core = new THREE.Mesh(new THREE.SphereGeometry(spider ? .09 : .055, 10, 8), silk); moving.add(core);
  const puff = new THREE.Mesh(new THREE.SphereGeometry(spider ? .17 : .1, 10, 8), halo); moving.add(puff);
  if (spider) {
    const strandGeometry = new THREE.TorusGeometry(.13, .009, 4, 12);
    for (let i = 0; i < 3; i++) { const strand = new THREE.Mesh(strandGeometry, silk); strand.rotation.set(i * .8, i * .63, i * 1.1); moving.add(strand); }
  }
  const trail = [], beadGeometry = new THREE.SphereGeometry(bat ? .045 : .035, 7, 5);
  for (let i = 0; i < 9; i++) { const bead = new THREE.Mesh(beadGeometry, material(spider ? 0xd8e9d8 : 0xbfcdd2, .5 - i * .045)); root.add(bead); trail.push(bead); }
  const impact = new THREE.Group(); root.add(impact); impact.position.copy(end); impact.visible = false;
  const bits = [];
  for (let i = 0; i < 10; i++) { const bit = new THREE.Mesh(beadGeometry, material(spider ? 0xd8e9d8 : 0xc7d6d6, .65)); const angle = i * Math.PI * 2 / 10; bit.userData.velocity = new THREE.Vector3(Math.cos(angle) * .7, .2 + i % 3 * .12, Math.sin(angle) * .7); impact.add(bit); bits.push(bit); }
  let elapsed = 0, disposed = false;
  return { root, duration,
    update(dt) {
      if (disposed) return true;
      elapsed += Math.max(0, Math.min(.1, dt)); const t = clamp(elapsed / duration);
      moving.position.copy(start).lerp(end, t); moving.rotation.z += dt * 8; moving.visible = t < 1;
      trail.forEach((bead, i) => { const tail = t - (i + 1) * .035; bead.visible = tail > 0 && elapsed < duration + .1; bead.position.copy(start).lerp(end, clamp(tail)); if (bat) bead.position.addScaledVector(up, Math.sin(tail * Math.PI) * .18); bead.scale.setScalar(1 - i * .065); });
      impact.visible = hit && t >= 1;
      const after = Math.max(0, elapsed - duration);
      bits.forEach(bit => { bit.position.copy(bit.userData.velocity).multiplyScalar(after); bit.material.opacity = Math.max(0, .65 * (1 - after / .3)); });
      return elapsed >= duration + .3;
    },
    dispose() { if (!disposed) { disposed = true; dispose(root); } },
  };
}
