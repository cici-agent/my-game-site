// ===== 菜鸟家园 · 跑出来的动物、牵绳（用户说的） =====
// 养动物的地方门开着：动物有可能从里面跑出来，在空地里乱跑；空地的大门也开着，就可能跑到外面去。
// 用牵绳把它们牵住，带回自己的窝（走进窝的围栏里就自动回去了）。也能用牵绳把窝里的动物牵出来遛。
import * as THREE from 'three';
import { buildChicken } from './coop.js';
import { ANIMAL_MODELS, SPECIES } from './ranch.js';
import { plotToWorld, worldToPlot } from './garden.js';

export const LOOSE_NAME = { chicken: ['母鸡', '小鸡'], cow: ['奶牛', '小牛'], sheep: ['羊', '小羊'], pig: ['猪', '小猪'], duck: ['鸭子', '小鸭'] };
export const LOOSE_ICON = { chicken: '🐔', cow: '🐄', sheep: '🐑', pig: '🐷', duck: '🦆' };
const SPEED = { chicken: 1.3, cow: 1, sheep: 1.1, pig: 1.1, duck: 1.2 };
const NECK = { chicken: .4, cow: 1.2, sheep: .8, pig: .6, duck: .4 };
const GROW = { chicken: 20 * 60 * 1000, cow: SPECIES.cow.grow * 60000, sheep: SPECIES.sheep.grow * 60000, pig: SPECIES.pig.grow * 60000, duck: SPECIES.duck.grow * 60000 };
const rnd = (a, b) => a + Math.random() * (b - a);

export function createLoose({ scene, plot, gateOpen = () => false, avoid = () => false, isNight = () => false, notify = () => {} }) {
  const KEY = 'xcn_loose_v1', h = plot.size / 2;
  let st = []; try { st = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st.map(a => ({ kind: a.kind, rec: a.rec, x: a.x, z: a.z, out: a.out })))); } catch (e) {} };
  const W = (lx, lz) => plotToWorld(plot, lx, lz), L = (x, z) => worldToPlot(plot, x, z);
  const isBaby = a => Date.now() - a.rec.born < GROW[a.kind];
  function model(a) {
    const baby = isBaby(a), m = a.kind === 'chicken' ? buildChicken(baby) : ANIMAL_MODELS[a.kind](baby);
    if (baby && a.kind !== 'chicken') m.root.scale.setScalar(.6);
    scene.add(m.root); a.m = m; a.baby = baby;
  }
  function inside() { for (let i = 0; i < 40; i++) { const lx = rnd(-h + 3, h - 3), lz = rnd(-h + 3, h - 3); if (Math.abs(lx) < 11 && lz > -12 && lz < 6) continue; const [x, z] = W(lx, lz); if (avoid(x, z)) continue; return [x, z]; } return W(0, h - 6); }
  const outside = () => W(rnd(-14, 14), rnd(h + 3, h + 14));
  st.forEach(a => { a.t = rnd(1, 4); a.path = []; a.ph = Math.random() * 9; a.face = 0; model(a); });

  let led = null;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xc9a66b }));
  line.frustumCulled = false; line.visible = false; scene.add(line);
  let saveT = 0;
  function update(dt, player) {
    const night = isNight(), open = gateOpen();
    for (const a of st) {
      a.ph += dt;
      if (isBaby(a) !== a.baby) { scene.remove(a.m.root); model(a); }
      let tx = null, tz = null, sp = SPEED[a.kind];
      if (a === led) {
        const d = Math.hypot(player.pos.x - a.x, player.pos.z - a.z);
        if (d > 1.8) { tx = player.pos.x; tz = player.pos.z; sp = Math.min(9, d * 2.2); }
        const [, lz] = L(a.x, a.z); a.out = lz > h + .5;
      } else if (!night) {
        if (!a.path.length) {
          if ((a.t -= dt) <= 0) {
            a.t = rnd(2, 7);
            const [lx, lz] = L(a.x, a.z), gIn = W(0, h - 1.5), gOut = W(0, h + 2.5);
            if (!a.out && open && Math.random() < .25) { a.path = [gIn, gOut, outside()]; a.leaving = true; }        // 大门开着：溜出去
            else if (a.out && open && Math.random() < .1) a.path = [gOut, gIn, inside()];                           // 偶尔自己溜回来
            else a.path = [a.out ? outside() : inside()];
            if (!a.out && Math.abs(lx) > h - 1) a.path.unshift(W(lx * .9, lz * .9));
          }
        }
        if (a.path.length) { [tx, tz] = a.path[0]; }
      }
      a.walking = false;
      if (tx !== null) {
        const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
        if (d < .3 && a !== led) {
          a.path.shift();
          if (!a.path.length) { const [, lz] = L(a.x, a.z), wasOut = a.out; a.out = lz > h + .5; if (a.out && !wasOut) notify(`${LOOSE_ICON[a.kind]} 空地的大门没关，一只${LOOSE_NAME[a.kind][a.baby ? 1 : 0]}跑到外面去了！`); }
        } else if (d > .05) { const s = Math.min(d, sp * dt); a.x += dx / d * s; a.z += dz / d * s; a.face = Math.atan2(dx, dz); a.walking = true; }
      }
      const r = a.m.root; r.position.set(a.x, a.walking ? Math.abs(Math.sin(a.ph * 9)) * .04 : 0, a.z); r.rotation.y = a.face;
    }
    line.visible = !!led;
    if (led) { const p = line.geometry.attributes.position, f = player.face; p.setXYZ(0, player.pos.x + Math.sin(f + .6) * .35, player.pos.y + 1, player.pos.z + Math.cos(f + .6) * .35); p.setXYZ(1, led.x + Math.sin(led.face) * .3, NECK[led.kind] * (led.baby ? .6 : 1), led.z + Math.cos(led.face) * .3); p.needsUpdate = true; }
    if ((saveT += dt) > 3) { saveT = 0; save(); }
  }
  const api = {
    get list() { return st; }, get led() { return led; },
    nameOf: a => LOOSE_NAME[a.kind][isBaby(a) ? 1 : 0], iconOf: a => LOOSE_ICON[a.kind],
    add(kind, rec, x, z, leadIt) { const a = { kind, rec, x, z, out: false, t: rnd(.5, 2), path: [], ph: 0, face: 0 }; model(a); st.push(a); if (leadIt) led = a; save(); return a; },
    remove(a) { scene.remove(a.m.root); st.splice(st.indexOf(a), 1); if (led === a) led = null; save(); },
    nearest(p, r = 1.8) { let best = null, bd = r; st.forEach(a => { const d = Math.hypot(a.x - p.x, a.z - p.z); if (d < bd) { bd = d; best = a; } }); return best; },
    lead(a) { led = a; a.path = []; },
    unlead() { if (led) { led.t = rnd(3, 6); led.path = []; } led = null; save(); },
    update,
  };
  return api;
}
