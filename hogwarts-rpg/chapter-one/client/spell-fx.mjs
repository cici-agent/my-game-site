import * as THREE from 'three';

const forward = new THREE.Vector3(0, 0, -1);
function vector(value, label) {
  const components = Array.isArray(value) ? value : [value?.x, value?.y, value?.z];
  if (components.length !== 3 || !components.every(Number.isFinite)) throw new Error(`INVALID_${label}`);
  return new THREE.Vector3(...components);
}
function delta(dt) { if (!Number.isFinite(dt) || dt < 0) throw new Error('INVALID_EFFECT_DELTA'); }
function material(color, opacity = 1, additive = true) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
}
function mesh(root, name, geometry, paint) {
  const object = new THREE.Mesh(geometry, paint); object.name = name; root.add(object); return object;
}
function lifetime(root) {
  let disposed = false;
  return {
    get disposed() { return disposed; },
    dispose() {
      if (disposed) return; disposed = true;
      const geometries = new Set(), materials = new Set();
      root.traverse(node => {
        if (node.geometry) geometries.add(node.geometry);
        for (const value of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) materials.add(value);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const paint of materials) paint.dispose();
      root.removeFromParent(); root.clear();
    },
  };
}

/** Pure presentation: the caller moves root and owns hit detection/lifetime. */
export function createBoltVisual({ origin, direction } = {}) {
  const at = vector(origin, 'BOLT_ORIGIN'), heading = vector(direction, 'BOLT_DIRECTION');
  if (!Number.isFinite(heading.lengthSq()) || heading.lengthSq() < 1e-12) throw new Error('INVALID_BOLT_DIRECTION');
  const root = new THREE.Group(); root.name = 'RedGoldSpellBolt'; root.position.copy(at);
  root.quaternion.setFromUnitVectors(forward, heading.normalize());
  const core = mesh(root, 'white-hot-core', new THREE.SphereGeometry(.0864, 14, 10), material(0xffedb0, 1, false));
  core.scale.set(.68, .68, 2.15); core.position.z = -.027;
  const mantle = mesh(root, 'red-gold-mantle', new THREE.SphereGeometry(.135, 14, 10), material(0xff673d, .55));
  mantle.scale.set(.80, .80, 2.3);
  const glow = mesh(root, 'soft-outer-glow', new THREE.SphereGeometry(.192, 14, 10), material(0xff3424, .10));
  glow.scale.set(1, 1, 1.7);
  // Local -Z travels forward. Every tail tapers behind the core along +Z.
  const tail = mesh(root, 'gold-trailing-flame', new THREE.ConeGeometry(.095, 1.072, 12), material(0xffb149, .51));
  tail.rotation.x = Math.PI / 2; tail.position.z = .584;
  const ember = mesh(root, 'red-trailing-aura', new THREE.ConeGeometry(.140, .726, 12), material(0xff472b, .18));
  ember.rotation.x = Math.PI / 2; ember.position.z = .413;
  const resources = lifetime(root); let age = 0;
  return {
    root, duration: .5,
    update(dt) {
      delta(dt); if (resources.disposed) return false; age += dt;
      const pulse = .5 + .5 * Math.sin(age * 43);
      glow.material.opacity = .08 + pulse * .04; mantle.material.opacity = .46 + pulse * .14;
      tail.material.opacity = .41 + pulse * .13; tail.scale.y = .91 + pulse * .15;
      ember.material.opacity = .14 + pulse * .07;
      return true;
    },
    dispose: resources.dispose,
  };
}

/** World-space impact center; local particles never move the owner's root. */
export function createImpactVisual({ kind, position } = {}) {
  if (!['wall', 'target'].includes(kind)) throw new Error('INVALID_IMPACT_KIND');
  const root = new THREE.Group(); root.name = kind === 'wall' ? 'WallEmberImpact' : 'TargetMagicImpact';
  root.position.copy(vector(position, 'IMPACT_POSITION'));
  const wall = kind === 'wall', duration = wall ? .46 : .38;
  const core = mesh(root, 'impact-core', new THREE.SphereGeometry(wall ? .07 : .10, 14, 10), material(wall ? 0xffd698 : 0xffc17a, .9));
  const glow = mesh(root, 'impact-glow', new THREE.SphereGeometry(wall ? .15 : .20, 14, 10), material(wall ? 0xbda87f : 0xff4f31, .25));
  const sparks = [];
  for (let index = 0; index < 14; index++) {
    const angle = index * 2.399963229728653, y = 1 - 2 * (index + .5) / 14, radius = Math.sqrt(1 - y * y);
    const velocity = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius).multiplyScalar((wall ? 1.4 : 1.9) + index % 3 * .18);
    const shard = wall && index % 2 === 0;
    const particle = mesh(root, shard ? 'wall-fragment' : 'magic-spark',
      shard ? new THREE.TetrahedronGeometry(.027 + index % 3 * .005) : new THREE.SphereGeometry(.022, 7, 5),
      material(shard ? 0xa8a29a : wall ? 0xffc06b : index % 2 ? 0xffd793 : 0xff653b, shard ? .8 : .95, !shard));
    if (!shard) { particle.scale.set(.65, .65, 2.3); particle.quaternion.setFromUnitVectors(forward, velocity.clone().normalize()); }
    sparks.push({ particle, velocity, shard, opacity: particle.material.opacity });
  }
  const resources = lifetime(root); let age = 0;
  return {
    root, duration,
    update(dt) {
      delta(dt); if (resources.disposed) return false; age = Math.min(duration, age + dt);
      const progress = age / duration, fade = (1 - progress) ** 2;
      core.scale.setScalar(1 + progress * 2.1); core.material.opacity = .9 * fade;
      glow.scale.setScalar(1 + progress * 2.7); glow.material.opacity = .25 * fade;
      for (const { particle, velocity, shard, opacity } of sparks) {
        particle.position.copy(velocity).multiplyScalar(age);
        if (wall) particle.position.y -= (shard ? 3.8 : 1.4) * age * age;
        if (shard) particle.rotation.set(age * 4.3, age * 2.8, age * 3.7);
        particle.material.opacity = opacity * fade;
      }
      return age < duration;
    },
    dispose: resources.dispose,
  };
}
