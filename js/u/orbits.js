// ===== 宇宙轨道布局：纯数据计算，便于在浏览器外做回归测试 =====

export const PLANET_RADIUS = {
  plaza: 13,
  games: 9.5,
  coins: 9,
  create: 8.5,
  home: 8.5,
  magic: 10.5,
  homestead: 9.5,
};

export const ORBIT_RADII = [68, 96, 128, 162, 198, 236, 276];

const ORBIT_TILTS = [-0.035, 0.026, -0.022, 0.032, -0.018, 0.024, -0.028];
const START_ANGLE = 18 * Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function orbitalSlot(index) {
  const last = ORBIT_RADII[ORBIT_RADII.length - 1];
  const radius = index < ORBIT_RADII.length
    ? ORBIT_RADII[index]
    : last + (index - ORBIT_RADII.length + 1) * 42;
  return {
    radius,
    angle: (START_ANGLE + index * GOLDEN_ANGLE) % (Math.PI * 2),
    tilt: ORBIT_TILTS[index % ORBIT_TILTS.length],
  };
}

export function layoutPlanetOrbits(planets) {
  planets.forEach((planet, index) => {
    const orbit = orbitalSlot(index);
    const planarZ = Math.cos(orbit.angle) * orbit.radius;
    planet.radius = PLANET_RADIUS[planet.kind] || 9;
    planet.orbitRadius = orbit.radius;
    planet.orbitAngle = orbit.angle;
    planet.orbitTilt = orbit.tilt;
    planet.pos = [
      Math.sin(orbit.angle) * orbit.radius,
      -planarZ * Math.sin(orbit.tilt),
      planarZ * Math.cos(orbit.tilt),
    ];
  });
  return planets;
}

export function orbitExtent(planets, padding = 76) {
  const outer = planets.reduce((max, planet) => Math.max(max, planet.orbitRadius || 0), 0);
  return outer + padding;
}
