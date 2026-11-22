import * as THREE from 'three';
import { loadPlayableCharacter } from '../presentation/playable-character.mjs';
import { applyEquipmentAppearance } from '../presentation/equipment-appearance.mjs';

/** An independent view instance using the same resident workshop source cache. */
export function createCharacterPreview({ container, onError } = {}) {
  if (!container?.ownerDocument) throw new Error('CHARACTER_PREVIEW_CONTAINER_REQUIRED');
  const doc = container.ownerDocument, canvas = doc.createElement('canvas');
  canvas.className = 'character-preview-canvas'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '可拖动旋转的人物三维预览'); canvas.style.touchAction = 'none';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x17252b);
  const camera = new THREE.PerspectiveCamera(36, 1, .06, 30), focus = new THREE.Object3D(); focus.position.y = 1; scene.add(focus);
  scene.add(new THREE.HemisphereLight(0xe9eff2, 0x4c4740, 1.85));
  const key = new THREE.DirectionalLight(0xffead1, 2.2); key.position.set(2.6, 4.2, 4.5); key.target = focus; key.castShadow = true; key.shadow.mapSize.set(512, 512); Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 2.4, bottom: -1.2, near: .1, far: 12 }); key.shadow.normalBias = .025; scene.add(key);
  const fill = new THREE.DirectionalLight(0xd9e9ff, .78); fill.position.set(-3, 2, 3); fill.target = focus; scene.add(fill);
  const rim = new THREE.DirectionalLight(0xefd7ad, 1.25); rim.position.set(1, 2.5, -3); rim.target = focus; scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.MeshStandardMaterial({ color: 0x25373c, roughness: .85 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -.012; scene.add(floor);
  const entries = new Map(), loading = new Map();
  let actor = null, requestedHero = null, generation = 0, disposed = false, frame = null, priorTime = null, yaw = Math.PI, drag = null, viewport = { width: 0, height: 0 };
  container.append(canvas); container.dataset.previewState = 'loading';
  function resize() {
    if (disposed) return;
    const box = container.getBoundingClientRect(), width = Math.max(0, Math.round(box.width)), height = Math.max(0, Math.round(box.height));
    viewport = { width, height }; if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    const distance = Math.max(3.15, .62 / (Math.tan(Math.PI / 10) * camera.aspect));
    camera.position.set(0, 1.08, distance); camera.lookAt(0, .93, 0);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(container); globalThis.addEventListener?.('resize', resize); resize();
  function rotate(delta) { if (disposed || !Number.isFinite(delta)) return; yaw += delta; if (actor) actor.root.rotation.y = yaw; }
  function resetView() { if (disposed) return; yaw = Math.PI; if (actor) actor.root.rotation.y = yaw; resize(); }
  function pointerdown(event) { if (event.button !== 0) return; drag = { id: event.pointerId, x: event.clientX }; canvas.setPointerCapture?.(event.pointerId); event.preventDefault(); }
  function pointermove(event) { if (!drag || drag.id !== event.pointerId) return; rotate((event.clientX - drag.x) * .009); drag.x = event.clientX; }
  function pointerup(event) { if (drag?.id === event.pointerId) drag = null; }
  const listeners = [['pointerdown', pointerdown], ['pointermove', pointermove], ['pointerup', pointerup], ['pointercancel', pointerup], ['lostpointercapture', pointerup]];
  for (const [type, handler] of listeners) canvas.addEventListener(type, handler);
  function animate(time) {
    if (disposed) return;
    const dt = priorTime === null ? 0 : Math.min(.05, Math.max(0, (time - priorTime) / 1000)); priorTime = time;
    if (!doc.hidden && container.isConnected !== false && viewport.width > 0 && viewport.height > 0) {
      actor?.updateTravel(dt, 0, true, 0); renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);
  async function setCharacter(character) {
    if (disposed) return null;
    const ticket = ++generation, heroId = character?.heroId;
    if (!heroId) throw new Error('CHARACTER_PREVIEW_HERO_REQUIRED');
    requestedHero = heroId;
    if (!entries.has(heroId) && !loading.has(heroId)) {
      if (actor) actor.root.visible = false;
      container.dataset.previewState = 'loading';
      const promise = Promise.resolve().then(() => loadPlayableCharacter(heroId)).then(value => {
        if (disposed) { value.dispose(); return null; }
        entries.set(heroId, value); value.root.visible = false; scene.add(value.root); return value;
      }).finally(() => loading.delete(heroId));
      loading.set(heroId, promise);
    }
    try {
      const value = entries.get(heroId) ?? await loading.get(heroId);
      if (disposed || ticket !== generation || requestedHero !== heroId || !value) return null;
      if (actor !== value) {
        if (actor) actor.root.visible = false;
        actor = value; actor.resetPresentation({ position: [0, 0, 0], yaw }); actor.setExpressionContext?.({ mood: 'curious', intensity: .35 });
      }
      actor.root.visible = true; applyEquipmentAppearance(actor, character); container.dataset.previewState = 'ready'; resize();
      return actor;
    } catch (error) {
      if (!disposed && ticket === generation) { container.dataset.previewState = 'error'; onError?.(error); }
      throw error;
    }
  }
  function dispose() {
    if (disposed) return; disposed = true; generation++; drag = null;
    cancelAnimationFrame(frame); observer?.disconnect(); globalThis.removeEventListener?.('resize', resize);
    for (const [type, handler] of listeners) canvas.removeEventListener(type, handler);
    for (const value of entries.values()) value.dispose(); entries.clear();
    floor.geometry.dispose(); floor.material.dispose(); key.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove();
    container.dataset.previewState = 'closed'; scene.clear();
  }
  return { setCharacter, rotate, resetView, resize, dispose };
}
