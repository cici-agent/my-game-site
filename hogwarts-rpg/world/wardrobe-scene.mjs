import * as THREE from 'three';
import { createAvatar } from './player.mjs';

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff5e2, 0xb5b7a7, 1.85));
  const key = new THREE.DirectionalLight(0xffe0b9, 2.05);
  key.position.set(2.3, 4, -3.5);
  const rim = new THREE.DirectionalLight(0xfbdeaf, 1.6);
  rim.position.set(-1.5, 2, 2.8);
  scene.add(key, rim);
}

function makePlinth() {
  const plinth = new THREE.Group();
  function band(top, base, height, y, color) {
    const geo = new THREE.CylinderGeometry(top, base, height, 72);
    const material = new THREE.MeshStandardMaterial({color, roughness: .63});
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = y;
    plinth.add(mesh);
  }
  band(.81, .86, .05, -.115, 0x465b53);
  band(.79, .81, .04, -.073, 0x748174);
  band(.807, .807, .012, -.05, 0xc3a578);
  band(.79, .802, .049, -.025, 0x7d897a);
  band(.778, .787, .012, -.002, 0xa8ad97);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.706, .713, 96),
    new THREE.MeshBasicMaterial({color: 0xdcc89d, side: THREE.DoubleSide}));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .0045;
  plinth.add(ring);
  return plinth;
}

export function createWardrobeScene(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  lights(scene);
  const plinth = makePlinth();
  scene.add(plinth);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 20);
  camera.position.set(0, 1.52, -5);
  camera.lookAt(0, 1, 0);
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  let model, yaw = -.17, animation = 'idle', running = true, frame;
  let previous = 0, elapsed = 0, pointer = null, lastX = 0, renderNeeded = true;
  let width = 0, height = 0, view = 'full', wandMesh, arm, handHalf = .39;
  const handTarget = new THREE.Vector3();
  const handDirection = new THREE.Vector3(0,.52,-5);
  const wandCenter = new THREE.Vector3();

  function measureWand() {
    arm = model?.root.getObjectByName('ArmR');
    wandMesh = null;
    model?.root.traverse(node => {
      if (node.isMesh && node.userData.wardrobeSlot === 'weapon') wandMesh = node;
    });
    if (wandMesh) {
      const geometry=wandMesh.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      wandCenter.copy(geometry.boundingSphere.center);
      // Keep the entire wand and a margin of sleeve around the hand, even for long staffs.
      handHalf=Math.max(.32,geometry.boundingSphere.radius*1.28);
    } else handHalf=.37;
  }

  function aimAtHand() {
    if (!arm) return;
    if (wandMesh) { handTarget.copy(wandCenter); wandMesh.localToWorld(handTarget); }
    else arm.localToWorld(handTarget.set(.065,-.405,-.03));
    camera.position.copy(handTarget).add(handDirection);
    camera.lookAt(handTarget);
  }

  function frameView() {
    const aspect = width / height;
    const half = view === 'hand' ? Math.max(handHalf, handHalf/aspect)
      : Math.max(1.22, .98 / aspect);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    if(view==='hand') aimAtHand();
    else {camera.position.set(0,1.52,-5);camera.lookAt(0,1,0);}
    renderNeeded=true;
  }
  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    frameView();
    renderer.setSize(width, height, false);
    renderNeeded = true;
  }

  function draw(time) {
    if (!running) return;
    frame = requestAnimationFrame(draw);
    const dt = Math.min(.07, (time - previous) / 1000);
    previous = time;
    if (!model || document.hidden || (media.matches && !renderNeeded && animation === 'idle')) return;
    elapsed += dt;
    model.root.rotation.y = yaw;
    model.animate(dt, {time: media.matches && animation === 'idle' ? 0 : elapsed,
      moving: animation === 'walk', speed: 2.6, casting: animation === 'cast' && elapsed % 2.4 < .85});
    if (view === 'hand') aimAtHand();
    renderer.render(scene, camera);
    renderNeeded = false;
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const drag = new AbortController();
  const options = {signal: drag.signal};
  canvas.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    pointer = e.pointerId;
    lastX = e.clientX;
    canvas.setPointerCapture(pointer);
  }, options);
  canvas.addEventListener('pointermove', e => {
    if (pointer !== e.pointerId) return;
    yaw += (e.clientX - lastX) * .013;
    lastX = e.clientX;
    renderNeeded = true;
  }, options);
  canvas.addEventListener('lostpointercapture', () => { pointer = null; }, options);
  resize();
  frame = requestAnimationFrame(draw);

  // Use the live rig and one WebGL context for both the mirror and its catalogue photographs.
  // Every thumbnail is copied to a 2D canvas before the drawing buffer is reused.
  const tabletop = new THREE.Scene();
  lights(tabletop);
  function photograph(target, box, direction, margin) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.length()) || size.length() < .001) return;
    const reach = Math.max(size.x, size.y, size.z) * margin;
    const lens = new THREE.OrthographicCamera(-reach, reach, reach, -reach, .005, 20);
    lens.position.copy(center).addScaledVector(direction.clone().normalize(), 4);
    lens.lookAt(center);
    renderer.setPixelRatio(1);
    renderer.setSize(144, 144, false);
    renderer.render(tabletop, lens);
    target.width = target.height = 144;
    target.getContext('2d').drawImage(canvas, 0, 0);
  }
  function restoreMirror() {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    if (model) renderer.render(scene, camera);
    renderNeeded = true;
  }
  function portraits(cast) {
    for (const {id, target, equipment} of cast) {
      const actor = createAvatar({variant: id, equipment, isPlayer: true});
      tabletop.add(actor.root);
      const faceBox = new THREE.Box3(new THREE.Vector3(-.26, 1.21, -.24), new THREE.Vector3(.26, 1.90, .25));
      photograph(target, faceBox, new THREE.Vector3(-.12, .045, -1), .54);
      actor.dispose();
    }
    restoreMirror();
  }
  const inventoryPhotos = new Map();
  function goods(variant, equipment, slot, cards) {
    const pending = [];
    for (const card of cards) {
      const key = `${variant}:${slot}:${card.id}`;
      const cached = inventoryPhotos.get(key);
      if (cached) {
        card.target.width = card.target.height = cached.width;
        card.target.getContext('2d').drawImage(cached, 0, 0);
        card.target.classList.add('wd-photo-ready');
      } else {
        pending.push({...card, key});
      }
    }
    if (!pending.length) return;
    const actor = createAvatar({variant, isPlayer: true, equipment});
    tabletop.add(actor.root);
    const direction = new THREE.Vector3(-.5, .18, -1);
    try {
      for (const {id, target, key} of pending) {
        actor.setEquipment({...equipment, [slot]: id});
        actor.root.updateMatrixWorld(true);
        const meshes = [];
        actor.root.traverse(node => {
          if (!node.isMesh) return;
          node.visible = node.userData.wardrobeSlot === slot;
          if (node.visible) meshes.push(node);
        });
        if (!meshes.length) continue;
        // A fitting-room pair is legible in the mirror; the inventory photograph
        // fills the small swatch with the detail on a single shoe or glove.
        if (['gloves', 'shoes'].includes(slot) && meshes.length > 1) {
          for (const counterpart of meshes.splice(1)) counterpart.visible = false;
        }
        const box = new THREE.Box3();
        for (const mesh of meshes) box.expandByObject(mesh, true);
        photograph(target, box, direction, .69);
        target.classList.add('wd-photo-ready');
        inventoryPhotos.set(key, target);
      }
    } finally {
      actor.dispose();
      restoreMirror();
    }
  }

  return {
    setCharacter(variant, equipment) {
      model?.dispose();
      model = createAvatar({variant, isPlayer: true, equipment});
      model.root.rotation.y = yaw;
      scene.add(model.root);
      measureWand();frameView();
    },
    setEquipment(equipment) { model.setEquipment(equipment);measureWand();frameView(); },
    setView(next) { view=next==='hand'?'hand':'full';frameView(); },
    rotate(angle) { yaw += angle; renderNeeded = true; },
    setAnimation(value) { animation = value; elapsed = 0; renderNeeded = true; },
    portraits, goods,
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      drag.abort();
      observer.disconnect();
      model?.dispose();
      plinth.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
