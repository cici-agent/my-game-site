import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPlanetOrbits, orbitExtent, ORBIT_RADII } from '../js/u/orbits.js';

const kinds = ['plaza', 'games', 'coins', 'create', 'home', 'magic', 'homestead'];

test('planets occupy distinct, progressively wider orbital layers', () => {
  const planets = layoutPlanetOrbits(kinds.map(kind => ({ kind })));
  assert.deepEqual(planets.map(p => p.orbitRadius), ORBIT_RADII);
  for (let i = 1; i < planets.length; i++) {
    assert.ok(planets[i].orbitRadius > planets[i - 1].orbitRadius);
  }
  assert.equal(new Set(planets.map(p => p.orbitAngle.toFixed(5))).size, planets.length);
});

test('the default planets stay comfortably separated in three dimensions', () => {
  const planets = layoutPlanetOrbits(kinds.map(kind => ({ kind })));
  let closest = Infinity;
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const distance = Math.hypot(...planets[i].pos.map((value, axis) => value - planets[j].pos[axis]));
      closest = Math.min(closest, distance - planets[i].radius - planets[j].radius);
    }
  }
  assert.ok(closest > 70, `expected at least 70 world units between planet surfaces, got ${closest}`);
});

test('extra database planets receive deterministic outer tracks and a reachable boundary', () => {
  const planets = layoutPlanetOrbits(Array.from({ length: 9 }, (_, i) => ({ kind: `custom-${i}` })));
  assert.equal(planets[7].orbitRadius, ORBIT_RADII.at(-1) + 42);
  assert.equal(planets[8].orbitRadius, ORBIT_RADII.at(-1) + 84);
  assert.equal(orbitExtent(planets), planets[8].orbitRadius + 76);
});
