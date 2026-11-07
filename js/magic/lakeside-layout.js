// Ground fixtures use the same footprints for construction and navigation.
export const platformY = 1.45;
export const stationHouse = { x: 77.85, z: -63, w: 5.7, d: 20, eaves: 5.65 };
export const parcelOffice = { x: 77.95, z: -103.5, w: 5.15, d: 9, eaves: 4.65 };
export const canopyPostZ = [-71.55, -65.9, -60.1, -54.45];
export const lampZ = [-111.7, -94.5, -82.1, -50.15];
export const benchZ = [-68.7, -57.5, -105.5];
export const cart = { x: 81.45, z: -98.4 };

function bounds(x, z, w, d, bottom, top) {
  return { left: x - w / 2, right: x + w / 2, front: z - d / 2, back: z + d / 2, bottom, top };
}

export const arrivalWalkingSolids = [
  ...[stationHouse, parcelOffice].map(h => bounds(h.x, h.z, h.w, h.d, 0, h.eaves)),
  ...canopyPostZ.map(z => bounds(84.05, z, .26, .26, platformY, 5.45)),
  ...lampZ.map(z => bounds(81, z, .35, .35, platformY, 4.4)),
  ...benchZ.map(z => bounds(81.27, z, .76, 2.65, platformY, platformY + 1.23)),
  bounds(cart.x, cart.z, .94, 1.9, platformY, platformY + 1.64),
  bounds(76.65, -111.65, 2.5, 2.5, 0, 7.25),
];

export const arrivalCameraSolids = [
  ...arrivalWalkingSolids,
  bounds(82.48, -63, 4.15, 20.35, 5.34, 5.94),
  bounds(stationHouse.x, stationHouse.z, stationHouse.w - .7, stationHouse.d, stationHouse.eaves, 7.6),
  bounds(parcelOffice.x, parcelOffice.z, parcelOffice.w - .7, parcelOffice.d, parcelOffice.eaves, 6.25),
];
