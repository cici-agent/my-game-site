// ===== 商店里的人物展示台：拖动旋转，自动转 =====
import * as THREE from 'three';
import { buildAvatar, buildPet } from './avatar.js';

export function createAvatarStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6bd1, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(4, 8, 6); scene.add(key);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, .25, 48), new THREE.MeshStandardMaterial({ color: 0xffd8a8, roughness: .6 }));
  pad.position.y = -.13; scene.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, .05, 8, 64), new THREE.MeshBasicMaterial({ color: 0xff922b }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .01; scene.add(ring);

  const holder = new THREE.Group(); scene.add(holder);
  let av = null, pet = null, yaw = .5, drag = null, idle = 0, alive = true;
  function show(skin, decor = {}) {
    holder.clear();
    av = buildAvatar(skin, decor); holder.add(av.root);
    pet = null;
    if (decor.pet) { pet = buildPet(decor.pet); pet.group.position.set(1.4, 0, .6); pet.group.rotation.y = -.5; holder.add(pet.group); }
  }
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { drag = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (drag === null) return; yaw -= (e.clientX - drag) * .012; drag = e.clientX; idle = 0; });
  const up = () => drag = null; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);

  function resize() { const w = container.clientWidth || 300, h = container.clientHeight || 200; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let last = performance.now(), t = 0;
  (function loop() {
    if (!alive) return;
    const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; t += dt; idle += dt;
    if (drag === null && idle > 2) yaw += dt * .5;
    holder.rotation.y = yaw;
    camera.position.set(0, 2.6, 9.5); camera.lookAt(0, 1.45, 0);
    if (av) av.animate(dt, 0, false, false);
    if (pet) pet.update(dt, t, false);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  return { show, dispose() { alive = false; ro.disconnect(); renderer.dispose(); el.remove(); } };
}
