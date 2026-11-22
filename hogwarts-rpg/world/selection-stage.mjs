import * as THREE from 'three';
import { HEROES } from '../js/magic/adventure-rules.mjs';
import { createAvatar } from './player.mjs';
import { loadEquipment, supportsWardrobe, equipmentStorageKey } from './wardrobe.mjs';

const front = Math.PI + .14;
const platformHeight = .13;
const frontZ = 1;

function platformDial() {
  const dial = document.createElement('canvas');
  dial.width = dial.height = 512;
  const ink = dial.getContext('2d');
  ink.translate(256, 256);
  const stone = ink.createRadialGradient(-52, -65, 0, 0, 0, 252);
  stone.addColorStop(0, '#536162');
  stone.addColorStop(.76, '#344544');
  stone.addColorStop(1, '#253635');
  ink.fillStyle = stone;
  ink.fillRect(-256, -256, 512, 512);
  ink.strokeStyle = '#d1b47e';
  for (const radius of [190, 222, 241, 247]) {
    ink.lineWidth = radius === 241 ? 3 : 1.5;
    ink.beginPath(); ink.arc(0, 0, radius, 0, 2 * Math.PI); ink.stroke();
  }
  for (let i = 0; i < 72; i++) {
    ink.save(); ink.rotate(i * Math.PI / 36);
    ink.lineWidth = i % 6 === 0 ? 3 : 1.3;
    ink.beginPath(); ink.moveTo(0, -239); ink.lineTo(0, i % 6 === 0 ? -218 : -230); ink.stroke();
    if (i % 18 === 0) {
      ink.fillStyle = '#e3ca91';
      ink.beginPath(); ink.moveTo(0, -215); ink.lineTo(5, -204); ink.lineTo(0, -194); ink.lineTo(-5, -204); ink.closePath(); ink.fill();
    }
    ink.restore();
  }
  const texture = new THREE.CanvasTexture(dial);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function contactLight() {
  const paper = document.createElement('canvas');
  paper.width = paper.height = 192;
  const ink = paper.getContext('2d');
  const wash = ink.createRadialGradient(96, 96, 0, 96, 96, 96);
  wash.addColorStop(0, 'rgba(5,10,12,.9)');
  wash.addColorStop(.55, 'rgba(6,10,11,.85)');
  wash.addColorStop(.71, 'rgba(14,15,12,.72)');
  wash.addColorStop(.78, 'rgba(222,175,100,.19)');
  wash.addColorStop(1, 'rgba(217,177,106,0)');
  ink.fillStyle = wash;
  ink.fillRect(0, 0, 192, 192);
  const texture = new THREE.CanvasTexture(paper);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPlinth() {
  const group = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({color:'#a68956', roughness:.53, metalness:.34});
  const slate = new THREE.MeshStandardMaterial({color:'#253633', roughness:.82});
  const dial = platformDial();
  const face = new THREE.MeshStandardMaterial({map:dial, roughness:.82});
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.85, .91, .095, 80), slate);
  base.position.y = .065;
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, .016, 80), brass);
  lip.position.y = platformHeight - .009;
  const top = new THREE.Mesh(new THREE.CircleGeometry(.85, 80), face);
  top.rotation.x = -Math.PI / 2;
  top.position.y = platformHeight;
  const contactMap = contactLight();
  const shadow = new THREE.MeshBasicMaterial({map:contactMap, transparent:true, depthWrite:false, toneMapped:false});
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 2.55), shadow);
  contact.rotation.x = -Math.PI / 2;
  group.add(contact, base, lip, top);
  group.position.z = frontZ;
  return {
    group,
    dispose() {
      for (const part of group.children) part.geometry.dispose();
      for (const mat of [brass, slate, face, shadow]) mat.dispose();
      contactMap.dispose();
      dial.dispose();
    }
  };
}

export function createSelectionStage({renderer, canvas}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 80);
  scene.background = new THREE.Color('#20353c');
  let disposed = false;
  const backdrop = canvas.ownerDocument?.createElementNS
    ? new THREE.TextureLoader().load('/assets/rpg/cast-station.webp', texture => {
        if (disposed) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        scene.background = texture;
      })
    : null;
  const skylight = new THREE.HemisphereLight('#cfecff', '#9a8271', 1.65);
  const fill = new THREE.DirectionalLight('#fff2e0', .82);
  fill.position.set(-3, 5, 7);
  const key = new THREE.PointLight('#ffe7c6', 18, 7, 2);
  key.position.set(-1.65, 2.9, frontZ + 2.5);
  const rim = new THREE.PointLight('#b8def9', 14, 5, 2);
  rim.position.set(1.45, 2.4, frontZ - 1.2);
  scene.add(skylight, fill, key, rim);

  const plinth = createPlinth();
  const pedestal = new THREE.Group();
  pedestal.position.set(0, platformHeight, frontZ);
  scene.add(plinth.group, pedestal);
  const view = canvas.ownerDocument?.defaultView;
  const surface = canvas.ownerDocument?.getElementById('cast-surface');
  const reduced = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const pointer = new THREE.Vector2(), ray = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  const bounds = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(0, platformHeight + .99, frontZ), new THREE.Vector3(.95, 2.04, .88)
  );
  let selected = null, model = null, angle = front, zoomStep = 0, clock = 0;

  function refreshOutfit(event) {
    if (!model || !supportsWardrobe(selected)) return;
    const matching = event.type === 'storage'
      ? event.key === null || event.key === equipmentStorageKey(selected)
      : event.detail?.variant === selected;
    if (matching) model.setEquipment(loadEquipment(selected));
  }
  view?.addEventListener('wardrobe-change', refreshOutfit);
  view?.addEventListener('storage', refreshOutfit);

  function resetView() {
    angle = front;
    zoomStep = 0;
  }

  function select(id, immediate = false) {
    if (!Object.hasOwn(HEROES, id) || id === selected) return;
    const equipment = supportsWardrobe(id) ? loadEquipment(id) : undefined;
    const next = createAvatar({variant:id, name:HEROES[id].name, isPlayer:true, equipment});
    model?.dispose();
    selected = id;
    model = next;
    pedestal.add(model.root);
    resetView();
    model.root.rotation.y = angle;
    if (!immediate && !reduced) model.playAction('bolt');
  }

  function frameCamera() {
    const screen = canvas.getBoundingClientRect();
    if (!screen.width || !screen.height) return;
    const rect = surface?.getBoundingClientRect();
    const region = rect?.width && rect.height ? rect : screen;
    const w = screen.width, h = screen.height;
    if (backdrop?.image) {
      const imageAspect = backdrop.image.width / backdrop.image.height;
      const aspect = w / h;
      // The portrait layout lifts the plinth above the dossier. Keep the floor beneath it.
      const portrait = aspect < 1;
      const crop = portrait ? .64 : 1;
      backdrop.repeat.set(crop * Math.min(1, aspect / imageAspect), crop * Math.min(1, imageAspect / aspect));
      backdrop.offset.set((1 - backdrop.repeat.x) / 2, portrait ? 0 : (1 - backdrop.repeat.y) / 2);
    }
    const cx = region.left - screen.left + region.width / 2;
    const cy = region.top - screen.top + region.height / 2;
    const fit = Math.min(region.height, region.width * 1.55) / h;
    camera.zoom = fit * 1.18 ** zoomStep;
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    const targetHeight = platformHeight + .96 + Math.max(0, zoomStep) * .112;
    camera.position.set(.08, targetHeight + .47, frontZ + 4.25);
    camera.lookAt(0, targetHeight, frontZ);
    camera.updateMatrixWorld();
  }

  function render(dt = 0) {
    dt = Math.min(.1, Math.max(0, dt));
    if (!reduced) clock += dt;
    if (model) {
      model.root.rotation.y = angle;
      model.animate(reduced ? 0 : dt, {time:clock});
    }
    frameCamera();
    renderer.render(scene, camera);
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right ||
        clientY < rect.top || clientY > rect.bottom) return null;
    pointer.set((clientX-rect.left)/rect.width*2-1, 1-(clientY-rect.top)/rect.height*2);
    ray.setFromCamera(pointer, camera);
    return ray.ray.intersectBox(bounds, hit) ? selected : null;
  }

  function dispose() {
    view?.removeEventListener('wardrobe-change', refreshOutfit);
    view?.removeEventListener('storage', refreshOutfit);
    model?.dispose();
    plinth.dispose();
    disposed = true;
    backdrop?.dispose();
    scene.background = null;
    scene.clear();
  }

  return {select, render, pick, dispose, resetView,
    rotate(radians) { if (Number.isFinite(radians)) angle = (angle + radians) % (Math.PI * 2); },
    zoom(delta) { if (Number.isFinite(delta)) zoomStep = THREE.MathUtils.clamp(zoomStep + delta, -2, 4); }
  };
}
