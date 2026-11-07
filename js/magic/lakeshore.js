// The bridge rises from the landing to the actual castle threshold.
export const landingHeight = .85;
export const gateHeight = 12;
export const bridgeStart = -98;
export const bridgeEnd = -133.4;
export function bridgeHeight(z) {
  const progress = Math.max(0, Math.min(1, (z - bridgeStart) / (bridgeEnd - bridgeStart)));
  return landingHeight + (gateHeight - landingHeight) * progress;
}

export function onBridge(x, z) {
  return Math.abs(x + 42) < 4.8 && z >= bridgeEnd + .8 && z <= bridgeStart;
}

export function onWestPier(x, z) {
  return x >= -73 && x <= -37.2 && z >= -98.65 && z <= -93.5;
}

export function onEastPier(x, z) {
  return x >= 73.4 && x <= 77.5 && z >= -80.6 && z <= -76.2;
}

export function bridgeStepAllowed(fromX, fromZ, toX, toZ) {
  const fromBridge = onBridge(fromX, fromZ), toBridge = onBridge(toX, toZ);
  if (fromBridge === toBridge) return true;
  return toBridge ? onWestPier(fromX, fromZ) : onWestPier(toX, toZ);
}

export function pierHeight(x) {
  return landingHeight * Math.max(0, Math.min(1, (x + 73) / 6));
}
