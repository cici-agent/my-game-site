// ===== 游乐园里的人物形象 =====
// 统一的 Q 版骨架（大头、短身子），不同皮肤换颜色和配件。朝向 +Z。
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, ...o });
const SKIN_TONE = 0xffd9b8;

// 每个皮肤：颜色 + 配件（批次 2 会补全 12 款）
export const SKINS = {
  explorer: { name: '小探险家', shirt: 0xff6b35, pants: 0xc8a165, shoes: 0x5a3b22, head: SKIN_TONE, hat: 'safari', backpack: 0x3f8f5a },
};

function eyes(head, r, opts = {}) {
  const white = M(0xffffff, { roughness: .2 }), black = M(0x1b1b2a, { roughness: .3 });
  [-1, 1].forEach(s => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r * .17, 12, 10), black);
    e.position.set(s * r * .36, r * .08, r * .9); e.scale.set(1, 1.25, .6); head.add(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(r * .06, 8, 6), white);
    hl.position.set(s * r * .36 + r * .05, r * .15, r * .98); head.add(hl);
    if (opts.cheeks !== false) {
      const ck = new THREE.Mesh(new THREE.SphereGeometry(r * .12, 10, 8), M(0xff9aa2, { transparent: true, opacity: .75 }));
      ck.position.set(s * r * .58, -r * .18, r * .78); ck.scale.set(1, .6, .4); head.add(ck);
    }
  });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(r * .14, r * .03, 6, 12, Math.PI), black);
  smile.rotation.z = Math.PI; smile.position.set(0, -r * .2, r * .93); head.add(smile);
}

function hat(head, r, type) {
  if (type === 'safari') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, r * .08, 24), M(0xe8c98a));
    brim.position.y = r * .55; head.add(brim);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * .82, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(0xe8c98a));
    dome.position.y = r * .55; head.add(dome);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * .83, r * .83, r * .14, 20), M(0x8b5a2b));
    band.position.y = r * .62; head.add(band);
  }
}

export function buildAvatar(skinKey = 'explorer') {
  const S = SKINS[skinKey] || SKINS.explorer;
  const root = new THREE.Group();
  const rig = {};

  // 腿（以胯部为轴）
  const legGeo = new THREE.CapsuleGeometry(.17, .38, 4, 10);
  [-1, 1].forEach(s => {
    const hip = new THREE.Group(); hip.position.set(s * .2, .7, 0); root.add(hip);
    const leg = new THREE.Mesh(legGeo, M(S.pants)); leg.position.y = -.3; hip.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8), M(S.shoes)); shoe.scale.set(1, .6, 1.4); shoe.position.set(0, -.6, .06); hip.add(shoe);
    rig[s < 0 ? 'legL' : 'legR'] = hip;
  });
  // 身体
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.4, .42, 6, 16), M(S.shirt)); body.position.y = 1.08; root.add(body); rig.body = body;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(.41, .41, .1, 20), M(0x5a3b22)); belt.position.y = .8; root.add(belt);
  if (S.backpack) {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(.55, .6, .28), M(S.backpack)); bp.position.set(0, 1.12, -.42); root.add(bp);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(.56, .22, .3), M(new THREE.Color(S.backpack).multiplyScalar(.8))); flap.position.set(0, 1.32, -.43); root.add(flap);
  }
  // 手臂（以肩为轴）
  const armGeo = new THREE.CapsuleGeometry(.12, .4, 4, 10);
  [-1, 1].forEach(s => {
    const sh = new THREE.Group(); sh.position.set(s * .5, 1.33, 0); root.add(sh);
    const arm = new THREE.Mesh(armGeo, M(S.shirt)); arm.position.y = -.25; sh.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), M(S.head)); hand.position.y = -.55; sh.add(hand);
    sh.rotation.z = s * .12;
    rig[s < 0 ? 'armL' : 'armR'] = sh; rig[s < 0 ? 'handL' : 'handR'] = hand;
  });
  // 头
  const neck = new THREE.Group(); neck.position.y = 1.62; root.add(neck);
  const r = .52;
  const head = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), M(S.head)); head.position.y = r * .9; neck.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 20, 12, 0, Math.PI * 2, 0, Math.PI * .42), M(0x4a2e1f));
  hair.position.y = 0; hair.rotation.x = -.25; head.add(hair);
  eyes(head, r); hat(head, r, S.hat);
  rig.head = neck;

  // 脚下的影子
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; root.add(shadow); rig.shadow = shadow;

  root.traverse(o => { if (o.isMesh) o.castShadow = false; });

  let phase = 0;
  // speed: 0~1 走路速度；air: 是否在空中；sitting: 坐着（坐游乐设施）
  function animate(dt, speed, air, sitting) {
    if (sitting) {
      rig.legL.rotation.x = rig.legR.rotation.x = -1.4;
      rig.armL.rotation.x = rig.armR.rotation.x = -.6;
      rig.body.position.y = 1.08; rig.head.rotation.x = 0;
      return;
    }
    phase += dt * (4 + speed * 8);
    const swing = air ? .5 : Math.sin(phase) * .75 * speed;
    rig.legL.rotation.x = air ? -.5 : swing; rig.legR.rotation.x = air ? .3 : -swing;
    rig.armL.rotation.x = air ? -2.4 : -swing * .9; rig.armR.rotation.x = air ? -2.4 : swing * .9;
    const bob = air ? 0 : Math.abs(Math.sin(phase)) * .06 * speed;
    rig.body.position.y = 1.08 + bob; rig.head.position.y = 1.62 + bob;
    rig.head.rotation.x = Math.sin(phase * .5) * .03;
  }
  return { root, rig, animate, height: 2.6 };
}
