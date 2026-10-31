// ===== 飞船展示台：拖动旋转、自动转、滚轮缩放 =====
import * as THREE from 'three';
import { buildShip } from './ships.js';
import { glowTex, rand } from './tex.js';

export function createShipViewer(container, { background = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !background });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';

  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(0x0b0f26);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 200);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a1a55, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(5, 8, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fd6ff, 1.4); rim.position.set(-6, 3, -6); scene.add(rim);

  // 展台：发光圆环 + 星点
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, .25, 64), new THREE.MeshStandardMaterial({ color: 0x1a2050, metalness: .7, roughness: .3 }));
  pad.position.y = -1.6; scene.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.75, .05, 8, 96), new THREE.MeshBasicMaterial({ color: 0x3ee8ff }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.47; scene.add(ring);
  if (background) {
    const N = 500, pos = new Float32Array(N * 3), r = rand(3);
    for (let i = 0; i < N; i++) { const a = r() * Math.PI * 2, b = r() * Math.PI, R = 60 + r() * 30; pos.set([R * Math.sin(b) * Math.cos(a), R * Math.cos(b), R * Math.sin(b) * Math.sin(a)], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: .8, map: glowTex(), transparent: true, depthWrite: false })));
  }

  const holder = new THREE.Group(); scene.add(holder);
  let ship = null, yaw = .55, pitch = .6, dist = 13, dragging = null, idle = 0, alive = true;
  function show(keyName) {
    if (ship) holder.remove(ship.group);
    ship = buildShip(keyName);
    holder.add(ship.group);
  }
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { dragging = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw -= (e.clientX - dragging.x) * .01; pitch = Math.max(-.2, Math.min(1.3, pitch + (e.clientY - dragging.y) * .008));
    dragging = { x: e.clientX, y: e.clientY }; idle = 0;
  });
  const up = () => { dragging = null; el.style.cursor = 'grab'; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(7, Math.min(22, dist + e.deltaY * .01)); }, { passive: false });

  function resize() {
    const w = container.clientWidth || 300, h = container.clientHeight || 200;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let last = performance.now(), t = 0;
  (function loop() {
    if (!alive) return;
    const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; t += dt; idle += dt;
    if (!dragging && idle > 2.5) yaw += dt * .35;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(0, -.2, 0);
    if (ship) {
      ship.group.position.y = Math.sin(t * 1.5) * .12;
      ship.flames.forEach(f => f.scale.setScalar((f.userData.base || 1) * 1.6 + Math.random() * .3));
      ship.update && ship.update(t);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

  return { show, dispose() { alive = false; ro.disconnect(); renderer.dispose(); el.remove(); } };
}
