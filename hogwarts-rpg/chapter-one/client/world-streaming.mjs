import * as THREE from 'three';
import { getWorldArea, getAreaLinks } from '../world-atlas.mjs';
import { createSceneEnvironment } from './scene-environment.mjs';
import { createAtlasEnvironment, openRegionPortals } from './journey-environment.mjs';

// Every room has a permanent address. Rebasing the renderer never moves a
// doorway relative to its neighbour, and never changes authoritative positions.
export function areaOffset(fromId, toId) {
  const from = getWorldArea(fromId).origin, to = getWorldArea(toId).origin;
  return { x: from.x - to.x, y: from.y - to.y, z: from.z - to.z };
}

// Outdoor views see actual permanent castle regions, not a second decorative
// castle occupying a different position. Interior lesson props remain streamed
// only at their doors; the skyline set has a bounded cost (~200 static draws).
const CASTLE_SKYLINE = ['ENTRANCE', 'CORRIDOR_G', 'CORRIDOR_1', 'CORRIDOR_2', 'CORRIDOR_3', 'STAIR_G1', 'STAIR_12', 'STAIR_23', 'STAIR_3T', 'SC04', 'SC11', 'GRYFFINDOR', 'MIRROR_ROOM'];
const OUTDOOR_VIEWS = new Set(['GROUNDS', 'FORECOURT', 'SC03', 'LAKESHORE_PATH', 'HOGSMEADE_STATION', 'ARRIVAL_ROAD', 'SC08', 'SC09', 'SC10', 'SC12', 'ENTRANCE', 'CORRIDOR_G']);
export function getVisibleAreaIds(areaId) {
  const area=getWorldArea(areaId);if(!area)return [];
  const ids=new Set([area.id,...getAreaLinks(area.id).filter(link=>link.kind==='walk').map(link=>link.to)]);
  if(area.realm==='LONDON')for(const id of ['SC01','LONDON_PLATFORM','SC02_LONDON'])ids.add(id);
  else if(OUTDOOR_VIEWS.has(area.id)) {
    for(const id of CASTLE_SKYLINE)ids.add(id);
    ids.add('GROUNDS');ids.add('SC03');
    if(['SC03','LAKESHORE_PATH','HOGSMEADE_STATION','ARRIVAL_ROAD'].includes(area.id))for(const id of ['HOGSMEADE_STATION','SC02_HOGSMEADE','ARRIVAL_ROAD','LAKESHORE_PATH','FORECOURT'])ids.add(id);
  }
  return [...ids].filter(id=>getWorldArea(id)?.realm===area.realm);
}

export function createWorldStreaming(scene, { createRoom = createSceneEnvironment, createConnector = createAtlasEnvironment, openPortals = openRegionPortals } = {}) {
  const entries = new Map();
  let active = null, pending = [], disposed = false;
  function remove(entry) {
    entry.portals?.dispose(); entry.map.dispose(); entry.root.removeFromParent();
    entries.delete(entry.area.id);
  }
  function materialize(id, context = {}) {
    const area = getWorldArea(id), stamp = context.combat?.id ?? '';
    let entry = entries.get(id);
    if (entry && entry.stamp !== stamp) { remove(entry); entry = null; }
    if (entry) return entry;
    const links = getAreaLinks(id), legacy = /^SC\d\d(?:[-_]|$)/.test(id);
    const root = new THREE.Group(); root.name = `WorldArea:${id}`;
    const map = legacy ? createRoom(area.sceneId, root, { questId: area.questId ?? context.questId, combat: context.combat }) : createConnector(area, { portals: links });
    if (!legacy && map.root) root.add(map.root);
    const portals = legacy && !context.combat ? openPortals(root, area, { portals: links }) : null;
    const lights = [];
    root.traverse(object => { if (object.isLight) lights.push(object); });
    if (!lights.length) {
      const ambient = new THREE.HemisphereLight(0xdbe7e7, 0x817462, 1.35);
      const sun = new THREE.DirectionalLight(0xffecc8, 2.0); sun.position.set(-10, 20, 9);
      root.add(ambient, sun); lights.push(ambient, sun);
    }
    for (const light of lights) if (light.isDirectionalLight && !light.target.parent) root.add(light.target);
    map.setTrainStopped?.(true);
    entry = { area, root, map, portals, lights, stamp }; entries.set(id, entry); scene.add(root);
    return entry;
  }
  function position(entry) {
    const offset = areaOffset(entry.area.id, active.area.id);
    entry.root.position.set(offset.x, offset.y, offset.z);
    for (const light of entry.lights) light.visible = entry === active;
  }
  function activate(id, context = {}) {
    if (disposed) throw new Error('WORLD_STREAM_DISPOSED');
    const area = getWorldArea(id), old = active;
    const neighbours = context.combat ? [] : getVisibleAreaIds(id);
    const wanted = new Set([id, ...neighbours]);
    // Keep the immediately previous room until it is behind the player. There
    // are no transient bridge meshes and no camera animation between rooms.
    if (old && old.area.realm === area.realm && !context.combat) wanted.add(old.area.id);
    active = materialize(id, context);
    for (const entry of [...entries.values()]) {
      if (!wanted.has(entry.area.id)) remove(entry);
      else position(entry);
    }
    pending = [...wanted].filter(key => !entries.has(key));
    // All directly visible doors are prepared before input can cross them.
    for (const key of pending.splice(0)) position(materialize(key));
    return { root: active.root, map: active.map, area: active.area };
  }
  function update(dt, elapsed) {
    for (const entry of entries.values()) entry.map.update?.(dt, elapsed);
  }
  return {
    activate, update,
    setTransit(value) { for (const entry of entries.values()) entry.root.visible = !value || entry === active; },
    get active() { return active; },
    get entries() { return [...entries.values()]; },
    clear() { for (const entry of [...entries.values()]) remove(entry); active = null; pending = []; },
    dispose() { if (disposed) return; disposed = true; this.clear(); },
  };
}
