const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Every distance is in the actor root's local metres; the actor faces -Z.
// Bone lengths are measured along the standing Y axis. forwardScale accounts
// for a presentation body's different Z/Y scale without scaling bent boots.
// Joint angles are geometric flexion, not a particular skeleton's Euler axes.
export function solveSeatedContact(metrics, seat) {
  const { thighLength, shinLength, soleBelowAnkle, thighRadius, calfRadius, restHip, forwardScale = 1 } = metrics ?? {};
  if (![thighLength, shinLength, soleBelowAnkle, thighRadius, calfRadius, restHip?.y, restHip?.z,
    forwardScale, seat?.surfaceY, seat?.floorY, seat?.frontZ, seat?.backZ].every(Number.isFinite)
    || thighLength <= 0 || shinLength <= 0 || forwardScale <= 0 || thighRadius < 0 || calfRadius < 0
    || seat.frontZ >= seat.backZ || seat.surfaceY <= seat.floorY) return null;
  const clearance = Math.max(.004, Number.isFinite(seat.clearance) ? seat.clearance : .012);
  const hipY = seat.surfaceY + thighRadius + clearance;
  // A horizontal thigh keeps its full underside above the cushion. The shin
  // begins beyond the front edge instead of rotating through the seat volume.
  const kneeZ = seat.frontZ - calfRadius - clearance;
  const hipZ = Math.min(seat.backZ - Math.max(thighRadius, metrics.pelvisBack ?? thighRadius), kneeZ + thighLength * forwardScale);
  const hipAngle = Math.PI / 2;
  const availableDrop = hipY - seat.floorY - soleBelowAnkle;
  // A short student's feet may hang from a high seat. For a lower seat, extend
  // the shins forward until the actual boot soles meet the floor, never below.
  const shinAngle = Math.acos(clamp(availableDrop / shinLength, 0, 1));
  const soleY = hipY - shinLength * Math.cos(shinAngle) - soleBelowAnkle;
  return {
    hipAngle, kneeAngle: shinAngle - hipAngle, ankleAngle: -shinAngle,
    hipTarget: { y: hipY, z: hipZ },
    kneeTarget: { y: hipY, z: hipZ - thighLength * forwardScale },
    ankleTarget: { y: hipY - shinLength * Math.cos(shinAngle), z: hipZ - (thighLength + shinLength * Math.sin(shinAngle)) * forwardScale },
    bodyOffset: { y: hipY - restHip.y, z: hipZ - restHip.z },
    footMode: soleY - seat.floorY < .015 ? 'grounded' : 'dangling', soleY, clearance,
  };
}
