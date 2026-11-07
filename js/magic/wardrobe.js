import * as THREE from 'three';
import { HEROES, OUTFITS, WANDS, loadCharacter } from './characters.js';
import { normalizeSelection } from './character-catalog.js';

const $ = id => document.getElementById(id);

function makeStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.07;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, .025, 20);
  scene.add(new THREE.HemisphereLight(0xfff1db, 0x91a298, 1.7));
  const light = (color, intensity, x, y, z) => {
    const lamp = new THREE.DirectionalLight(color, intensity);
    lamp.position.set(x, y, z);
    scene.add(lamp);
  };
  light(0xffe5c5, 2.35, -2, 3, 3.2);
  light(0xc0daec, 1.22, 2.4, 1.7, 1.8);
  light(0xffdc98, 2.3, .9, 2.4, -2.2);

  const mount = new THREE.Group();
  scene.add(mount);
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(.51, .53, .038, 64),
    new THREE.MeshStandardMaterial({ color: 0x334740, roughness: .87 }),
  );
  plinth.position.y = -.023;
  scene.add(plinth);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(.509, .0035, 6, 80),
    new THREE.MeshStandardMaterial({ color: 0xa19256, roughness: .57, metalness: .25 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -.004;
  scene.add(rim);

  // A soft contact shadow anchors the soles even on devices without shadow maps.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const pen = shadowCanvas.getContext('2d');
  const gradient = pen.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(9,16,13,.82)');
  gradient.addColorStop(.45, 'rgba(12,18,14,.52)');
  gradient.addColorStop(1, 'rgba(12,18,14,0)');
  pen.fillStyle = gradient;
  pen.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(.68, .46),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -.002;
  scene.add(shadow);

  let height = 1.7, shot = 'full';
  function frame() {
    const portrait = shot === 'portrait';
    const visibleHeight = Math.max(height * (portrait ? .32 : 1.19), (portrait ? .42 : 1.24) / camera.aspect);
    const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const center = height * (portrait ? .875 : .48);
    camera.position.set(0, center + distance * (portrait ? .012 : .065), distance);
    camera.lookAt(0, center, 0);
    camera.updateProjectionMatrix();
  }
  function resize() {
    const width = Math.max(1, canvas.parentElement.clientWidth);
    const frameHeight = Math.max(1, canvas.parentElement.clientHeight);
    renderer.setSize(width, frameHeight, false);
    camera.aspect = width / frameHeight;
    frame();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  resize();

  return {
    mount,
    setModel(model) {
      mount.add(model.root);
      const bounds = new THREE.Box3().setFromObject(model.root);
      height = Number.isFinite(bounds.max.y) ? THREE.MathUtils.clamp(bounds.max.y, 1.4, 2.2) : 1.7;
      mount.rotation.y = -.1;
      frame();
    },
    turn(radians) { mount.rotation.y += radians; },
    setShot(value) { shot = value; frame(); },
    render() { renderer.render(scene, camera); },
    dispose() {
      observer.disconnect();
      for (const mesh of [plinth, rim, shadow]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      shadowTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

export function createWardrobe({ getSelection, onApply, onOpen, onClose }) {
  const dialog = $('wardrobe');
  let selection, firstTime = false, busy = false, canLeave = false;
  let stage = null, preview = null, version = 0, delayed = 0;
  let frameId = 0, previous = 0, pointer = null, shot = 'full';

  function buttons(parentId, catalog, group, swatch) {
    const parent = $(parentId);
    for (const item of catalog) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wardrobe-choice';
      button.dataset.group = group;
      button.dataset.choice = item.id;
      button.setAttribute('aria-pressed', 'false');
      if (group === 'hero') {
        const portrait = document.createElement('img');
        portrait.className = 'wardrobe-portrait';
        portrait.alt = '';
        portrait.width = portrait.height = 48;
        portrait.loading = 'lazy';
        portrait.src = new URL(`../../assets/3d/magic/characters/${item.id}-portrait.png`, import.meta.url).href;
        portrait.addEventListener('error', () => portrait.remove(), { once: true });
        button.append(portrait);
      }
      if (swatch) {
        const chip = document.createElement('span');
        chip.className = swatch;
        chip.setAttribute('aria-hidden', 'true');
        button.append(chip);
      }
      const name = document.createElement('span');
      name.textContent = group === 'hero' ? item.name.split('·')[0] : item.name;
      button.setAttribute('aria-label', item.name);
      button.append(name);
      button.addEventListener('click', () => choose(group, item));
      parent.append(button);
    }
  }
  buttons('wardrobeHeroes', HEROES, 'hero');
  buttons('wardrobeOutfits', OUTFITS, 'outfit', 'wardrobe-outfit-swatch');
  buttons('wardrobeWands', WANDS, 'wand', 'wardrobe-wand-swatch');

  function paint() {
    const hero = HEROES.find(item => item.id === selection.hero);
    const outfit = OUTFITS.find(item => item.id === selection.outfit);
    const wand = WANDS.find(item => item.id === selection.wand);
    for (const button of dialog.querySelectorAll('[data-choice]')) {
      button.setAttribute('aria-pressed', String(selection[button.dataset.group] === button.dataset.choice));
    }
    $('wardrobeName').textContent = hero.name;
    $('wardrobeEnglish').textContent = hero.english;
    $('wardrobeHeroDetail').textContent = hero.description;
    $('wardrobeOutfitDetail').textContent = outfit.description;
    $('wardrobeWandDetail').textContent = wand.description;
    $('wardrobeCanvas').setAttribute('aria-label', hero.name + '的三维模型，可拖动或用左右方向键旋转');
    $('wardrobeApply').disabled = !preview || busy;
    $('wardrobeOptions').inert = busy;
    const hideExit = firstTime && !canLeave;
    $('wardrobeBack').hidden = hideExit;
    $('wardrobeClose').hidden = hideExit;
    $('wardrobeBack').disabled = busy;
    $('wardrobeClose').disabled = busy;
    $('wardrobeBack').textContent = firstTime ? '稍后选择' : '取消';
  }
  function notify(message = '', retry = false) {
    $('wardrobeStatus').textContent = message;
    $('wardrobeNotice').hidden = !message;
    $('wardrobeRetry').hidden = !retry;
  }
  function dropPreview() {
    if (!preview) return;
    stage?.mount.remove(preview.root);
    preview.dispose();
    preview = null;
  }
  async function refreshModel() {
    const current = ++version;
    clearTimeout(delayed);
    dropPreview();
    canLeave = false;
    paint();
    notify('正在准备角色模型……');
    delayed = window.setTimeout(() => {
      if (!dialog.open || current !== version) return;
      canLeave = true;
      paint();
      notify('模型加载较慢，可以重试或稍后选择。', true);
    }, 18000);
    try {
      if (!stage) {
        // A fresh canvas also gives retries a fresh WebGL context.
        const old = $('wardrobeCanvas');
        const fresh = old.cloneNode(false);
        old.replaceWith(fresh);
        bindCanvas(fresh);
        stage = makeStage(fresh);
        stage.setShot(shot);
      }
      const model = await loadCharacter({ ...selection });
      if (!dialog.open || current !== version) { model.dispose(); return; }
      preview = model;
      preview.setEquipment(selection);
      stage.setModel(preview);
      canLeave = false;
      notify();
    } catch (error) {
      if (!dialog.open || current !== version) return;
      dropPreview();
      canLeave = true;
      notify('角色模型暂时无法显示，请重试或选择其他人物。', true);
      console.warn('角色预览加载失败', error);
    } finally {
      if (current === version) {
        clearTimeout(delayed);
        paint();
      }
    }
  }
  function choose(group, item) {
    if (busy || selection[group] === item.id) return;
    selection[group] = item.id;
    if (group === 'hero') {
      selection.wand = item.defaultWand;
      refreshModel();
      return;
    }
    preview?.setEquipment(selection);
    paint();
  }
  function setShot(value) {
    shot = value;
    stage?.setShot(shot);
    for (const button of dialog.querySelectorAll('[data-shot]')) {
      button.setAttribute('aria-pressed', String(button.dataset.shot === value));
    }
  }
  function draw(time) {
    if (!dialog.open) return;
    const dt = Math.min((time - previous) / 1000, .05);
    previous = time;
    preview?.animate(dt, 0);
    stage?.render();
    frameId = requestAnimationFrame(draw);
  }
  function finish() {
    ++version;
    clearTimeout(delayed);
    cancelAnimationFrame(frameId);
    pointer = null;
    dropPreview();
    stage?.dispose();
    stage = null;
    onClose?.();
    (firstTime ? $('scene') : $('openWardrobe')).focus({ preventScroll: true });
  }
  function dismiss() {
    if (!busy && (!firstTime || canLeave)) dialog.close();
  }
  function open({ firstTime: initial = false } = {}) {
    if (dialog.open) return;
    selection = normalizeSelection(getSelection?.());
    firstTime = initial;
    $('wardrobeApplyLabel').textContent = firstTime ? '穿戴并进入学院' : '应用装扮';
    busy = false;
    canLeave = false;
    notify();
    setShot('full');
    paint();
    onOpen?.();
    dialog.showModal();
    $('wardrobeTitle').focus({ preventScroll: true });
    $('wardrobeOptions').scrollTop = 0;
    previous = performance.now();
    frameId = requestAnimationFrame(draw);
    refreshModel();
  }
  async function apply() {
    if (busy || !preview) return;
    busy = true;
    paint();
    notify('正在穿戴……');
    try {
      // The game takes ownership of this exact model when it accepts the selection.
      await onApply({ ...selection }, preview);
      preview = null;
      dialog.close();
    } catch (error) {
      stage.mount.add(preview.root);
      canLeave = true;
      notify('暂时无法应用装扮，可以再次确认或稍后选择。');
      console.warn('应用角色装扮失败', error);
    } finally {
      busy = false;
      paint();
    }
  }
  function bindCanvas(canvas) {
    canvas.addEventListener('pointerdown', event => {
      if (busy || !preview || pointer) return;
      pointer = { id: event.pointerId, x: event.clientX };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (pointer?.id !== event.pointerId) return;
      stage?.turn((event.clientX - pointer.x) * .012);
      pointer.x = event.clientX;
    });
    function end(event) { if (pointer?.id === event.pointerId) pointer = null; }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      stage?.turn(event.key === 'ArrowLeft' ? -.15 : .15);
    });
  }

  for (const button of dialog.querySelectorAll('[data-shot]')) {
    button.addEventListener('click', () => setShot(button.dataset.shot));
  }
  for (const button of dialog.querySelectorAll('[data-turn]')) {
    button.addEventListener('click', () => stage?.turn(Number(button.dataset.turn) * Math.PI / 8));
  }
  $('openWardrobe').addEventListener('click', () => open());
  $('wardrobeClose').addEventListener('click', dismiss);
  $('wardrobeBack').addEventListener('click', dismiss);
  $('wardrobeRetry').addEventListener('click', () => { if (!busy) refreshModel(); });
  $('wardrobeApply').addEventListener('click', apply);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('close', finish);
  // Keep game movement, interaction and story shortcuts out of the dialog.
  for (const type of ['keydown', 'keyup']) {
    dialog.addEventListener(type, event => { if (dialog.open) event.stopPropagation(); });
  }
  return { open, get isOpen() { return dialog.open; } };
}
