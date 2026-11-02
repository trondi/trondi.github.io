import * as THREE from "three";

/**
 * 둥이 — 은회색 고등어 무늬에 흰 주둥이·가슴·발을 가진 통통한 고양이.
 * 모델 파일 없이 기본 도형으로 만들고, 걷기·쉬기 동작도 코드로 움직인다.
 * 발바닥이 원점, 머리는 +z 쪽을 본다. 앉은키 약 0.5m.
 */

export type CatAnimator = {
  play: (name: string, once?: boolean) => void;
  current: () => string;
  busy: () => boolean;
  update: (dt: number) => void;
};

export function buildDungi(wrapMaterial: (m: THREE.Material) => THREE.Material = (m) => m) {
  const mats = {
    fur: new THREE.MeshStandardMaterial({ color: "#b8bcc4", roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: "#7d828c", roughness: 0.95 }),
    stripe: new THREE.MeshStandardMaterial({ color: "#6e737c", roughness: 0.95 }),
    tailTip: new THREE.MeshStandardMaterial({ color: "#5c6069", roughness: 0.95 }),
    white: new THREE.MeshStandardMaterial({ color: "#f6f4ef", roughness: 0.95 }),
    pink: new THREE.MeshStandardMaterial({ color: "#f0a7b0", roughness: 0.7 }),
    eye: new THREE.MeshStandardMaterial({ color: "#c9d675", roughness: 0.3 }),
    pupil: new THREE.MeshStandardMaterial({ color: "#1d1d1d", roughness: 0.3 }),
    shine: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  };
  Object.values(mats).forEach(wrapMaterial);
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const ball = (r: number, mat: THREE.Material, sx = 1, sy = 1, sz = 1, seg = 16) => {
    const m = mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat);
    m.scale.set(sx, sy, sz);
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // 몸통 — 동그란 식빵 모양, 등에 진한 무늬, 가슴과 배는 하얗게
  const torso = ball(0.2, mats.fur, 1.12, 0.88, 1.3, 22);
  torso.position.set(0, 0.2, -0.02);
  const chest = ball(0.15, mats.white, 1.0, 1.05, 0.8);
  chest.position.set(0, 0.2, 0.15);
  const belly = ball(0.17, mats.white, 0.95, 0.6, 1.1);
  belly.position.set(0, 0.12, 0);
  const patchL = ball(0.11, mats.dark, 0.5, 0.9, 1.2);
  patchL.position.set(0.17, 0.23, 0.04);
  const patchR = patchL.clone();
  patchR.position.x = -0.17;
  const back = ball(0.15, mats.dark, 1.0, 0.45, 1.25);
  back.position.set(0, 0.33, -0.08);
  body.add(torso, chest, belly, patchL, patchR, back);

  // 다리 — 짧고 통통, 앞발은 하얀 양말
  const legs: THREE.Group[] = [];
  for (const [x, z, mat] of [
    [0.1, 0.13, mats.white], [-0.1, 0.13, mats.white], [0.11, -0.15, mats.fur], [-0.11, -0.15, mats.fur],
  ] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.13, z);
    const leg = mesh(new THREE.CapsuleGeometry(0.045, 0.06, 4, 8), mat);
    leg.position.y = -0.06;
    const paw = ball(0.05, mats.white, 1, 0.65, 1.2);
    paw.position.set(0, -0.11, 0.015);
    pivot.add(leg, paw);
    body.add(pivot);
    legs.push(pivot);
  }

  // 꼬리 — 회색에 끝은 진하게, 뒤에서 위로 살짝 말린다
  const tail = new THREE.Group();
  tail.position.set(0, 0.2, -0.27);
  body.add(tail);
  const tailSegs: THREE.Object3D[] = [];
  let parent: THREE.Object3D = tail;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0 : 0.07, i === 0 ? 0 : -0.02);
    const piece = ball(0.04 - i * 0.003, i >= 2 ? mats.tailTip : mats.dark, 1, 1.4, 1);
    piece.position.y = 0.035;
    seg.add(piece);
    parent.add(seg);
    tailSegs.push(seg);
    parent = seg;
  }

  // 머리 — 크고 둥근 얼굴, 위는 고등어 무늬, 이마 가운데 흰 줄, 주둥이와 턱은 하얗게
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.18);
  body.add(head);
  const skull = ball(0.15, mats.fur, 1.15, 0.98, 1.0, 22);
  const cheeks = ball(0.13, mats.white, 1.15, 0.7, 0.9);
  cheeks.position.set(0, -0.05, 0.05);
  const muzzle = ball(0.07, mats.white, 1.35, 0.85, 0.8);
  muzzle.position.set(0, -0.045, 0.12);
  const blaze = ball(0.05, mats.white, 0.4, 1.35, 0.5);
  blaze.position.set(0, 0.05, 0.116);
  head.add(skull, cheeks, muzzle, blaze);
  // 이마·볼 줄무늬
  for (const [x, y, rz, len] of [[-0.05, 0.1, 0.25, 0.05], [0.05, 0.1, -0.25, 0.05], [-0.025, 0.12, 0.1, 0.04], [0.025, 0.12, -0.1, 0.04]] as const) {
    const s = mesh(new THREE.CapsuleGeometry(0.0055, len, 3, 6), mats.stripe);
    // 이마 곡면을 따라 눕힌다
    s.position.set(x, y - 0.005, 0.098);
    s.rotation.set(-0.85, 0, rz);
    head.add(s);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const s = mesh(new THREE.CapsuleGeometry(0.0055, 0.04, 3, 6), mats.stripe);
      s.position.set(side * 0.155, 0.0 - k * 0.035, 0.03);
      s.rotation.set(0, side * 0.3, Math.PI / 2 + side * 0.25);
      head.add(s);
    }
  }
  // 귀
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.055, 0.09, 4), mats.dark);
    ear.position.set(side * 0.095, 0.135, -0.01);
    ear.rotation.set(-0.1, side * 0.4, side * -0.3);
    const inner = mesh(new THREE.ConeGeometry(0.032, 0.06, 4), mats.pink);
    inner.position.set(0, -0.01, 0.018);
    ear.add(inner);
    head.add(ear);
  }
  // 초록 눈 — 크고 동그랗게, 세로 동공과 하이라이트
  for (const side of [-1, 1]) {
    const eye = ball(0.032, mats.eye, 1, 1.05, 0.5);
    eye.position.set(side * 0.062, 0.015, 0.135);
    eye.rotation.y = side * 0.35;
    const pupil = ball(0.012, mats.pupil, 0.7, 1.6, 0.5);
    pupil.position.set(side * 0.064, 0.015, 0.148);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), mats.shine);
    shine.position.set(side * 0.07, 0.03, 0.152);
    head.add(eye, pupil, shine);
  }
  // 분홍 코와 입
  const nose = ball(0.016, mats.pink, 1.3, 0.8, 0.8);
  nose.position.set(0, -0.025, 0.178);
  head.add(nose);

  let anim = "Idle";
  let t = 0;
  let blink = 2;
  const eyes = head.children.filter((c) => (c as THREE.Mesh).material === mats.eye || (c as THREE.Mesh).material === mats.pupil);
  for (const e of eyes) e.userData.sy = e.scale.y;

  const animator: CatAnimator = {
    play: (name) => {
      if (name === anim) return;
      anim = name;
      t = 0;
    },
    current: () => anim,
    busy: () => false,
    update: (dt) => {
      t += dt;
      const walk = anim === "Walk";
      const ph = t * 9;
      legs[0].rotation.x = walk ? Math.sin(ph) * 0.6 : 0;
      legs[3].rotation.x = walk ? Math.sin(ph) * 0.6 : 0;
      legs[1].rotation.x = walk ? -Math.sin(ph) * 0.6 : 0;
      legs[2].rotation.x = walk ? -Math.sin(ph) * 0.6 : 0;
      body.position.y = walk ? Math.abs(Math.sin(ph)) * 0.015 : 0;
      // 숨 쉬는 듯 살짝 부풀기 (통통하니까)
      const breathe = 1 + Math.sin(t * 2.2) * (walk ? 0 : 0.012);
      torso.scale.set(1.12 * breathe, 0.88 * breathe, 1.3);
      // 꼬리는 늘 살랑살랑, 걸을 땐 세운다
      const sway = Math.sin(t * (walk ? 6 : 1.8)) * (walk ? 0.25 : 0.4);
      tailSegs.forEach((s, i) => {
        s.rotation.set(i === 0 ? (walk ? -0.4 : -1.25) : -0.25, 0, sway * (0.4 + i * 0.25));
      });
      // 고개는 가끔 갸웃
      head.rotation.set(walk ? 0.05 : Math.sin(t * 0.7) * 0.05, walk ? 0 : Math.sin(t * 0.45) * 0.25, Math.sin(t * 0.9) * 0.04);
      // 눈 깜빡
      blink -= dt;
      const closed = blink < 0.12;
      for (const e of eyes) e.scale.y = closed ? 0.12 : (e.userData.sy as number);
      if (blink < 0) blink = 2.5 + Math.random() * 3;
    },
  };
  return { root, anim: animator };
}
