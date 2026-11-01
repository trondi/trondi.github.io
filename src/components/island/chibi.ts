import * as THREE from "three";

/**
 * 섬 주민 같은 캐릭터 — 크고 살짝 넓은 머리, 볼륨 있는 머리카락, 작은 종 모양 몸통,
 * 가는 팔다리와 둥근 손발. 모델 파일 없이 기본 도형으로 만들고 동작도 코드로 움직인다.
 * 발바닥이 원점, 키는 약 1.3m.
 */

export type ChibiAnim = "Idle" | "Walk" | "Run" | "PickUp" | "Victory";
export type ChibiColors = { skin: string; shirt: string; pants: string; hair: string };

export type Chibi = {
  root: THREE.Group;
  head: THREE.Object3D;
  hand: THREE.Object3D;
  setColors: (c: ChibiColors) => void;
  setHair: (style: "a" | "b") => void;
  /** 모자 밑면 높이(머리 중심 기준) — 앞머리를 그 아래로 눌러 모자를 뚫지 않게 한다. null이면 원래대로 */
  setHatLine: (y: number | null) => void;
  play: (anim: ChibiAnim) => void;
  current: () => ChibiAnim;
  busy: () => boolean;
  update: (dt: number, holdingRod: boolean) => void;
};

export function buildChibi(wrapMaterial: (m: THREE.Material) => THREE.Material = (m) => m): Chibi {
  const mats = {
    skin: new THREE.MeshStandardMaterial({ color: "#f6d7bd", roughness: 0.85 }),
    shirt: new THREE.MeshStandardMaterial({ color: "#4f4a8a", roughness: 0.9 }),
    pants: new THREE.MeshStandardMaterial({ color: "#1f2a44", roughness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ color: "#4a1f1a", roughness: 0.75 }),
    shoe: new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 0.8 }),
    sole: new THREE.MeshStandardMaterial({ color: "#f2ece0", roughness: 0.9 }),
    eye: new THREE.MeshStandardMaterial({ color: "#2a1f1f", roughness: 0.35 }),
    shine: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    blush: new THREE.MeshBasicMaterial({ color: "#f7a8a8", transparent: true, opacity: 0.55 }),
  };
  Object.values(mats).forEach(wrapMaterial);
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };
  const ball = (r: number, mat: THREE.Material, sx = 1, sy = 1, sz = 1, seg = 18) => {
    const m = mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat);
    m.scale.set(sx, sy, sz);
    return m;
  };

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.27;
  root.add(hips);

  // 몸통 — 아래가 살짝 넓은 종 모양 상의 + 짧은 바지
  const torso = new THREE.Group();
  hips.add(torso);
  const shirtProfile = [
    new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.165, 0.0), new THREE.Vector2(0.17, 0.04),
    new THREE.Vector2(0.155, 0.14), new THREE.Vector2(0.135, 0.22), new THREE.Vector2(0.1, 0.27), new THREE.Vector2(0.0, 0.285),
  ];
  const shirt = mesh(new THREE.LatheGeometry(shirtProfile, 20), mats.shirt);
  shirt.position.y = 0.04;
  shirt.scale.z = 0.85;
  const shorts = mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.09, 18), mats.pants);
  shorts.position.y = 0.02;
  shorts.scale.z = 0.85;
  torso.add(shirt, shorts);

  // 다리 — 짧고 가늘게, 둥근 신발
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.075, 0.0, 0);
    const leg = mesh(new THREE.CapsuleGeometry(0.045, 0.12, 6, 10), mats.skin);
    leg.position.y = -0.1;
    const shoe = ball(0.07, mats.shoe, 1, 0.75, 1.35);
    shoe.position.set(0, -0.215, 0.025);
    const sole = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 14), mats.sole);
    sole.scale.z = 1.35;
    sole.position.set(0, -0.255, 0.025);
    pivot.add(leg, shoe, sole);
    hips.add(pivot);
    legs.push(pivot);
  }

  // 팔 — 가는 팔, 장갑 같은 둥근 손
  const arms: THREE.Group[] = [];
  const hand = new THREE.Object3D();
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.26, 0);
    const sleeve = ball(0.06, mats.shirt, 1, 1.1, 1);
    sleeve.position.y = -0.02;
    const arm = mesh(new THREE.CapsuleGeometry(0.036, 0.1, 6, 10), mats.skin);
    arm.position.y = -0.1;
    const mitt = ball(0.05, mats.skin, 1, 1.05, 0.9);
    mitt.position.y = -0.18;
    pivot.add(sleeve, arm, mitt);
    if (side === 1) {
      hand.position.y = -0.18;
      pivot.add(hand);
    }
    torso.add(pivot);
    arms.push(pivot);
  }

  // 머리 — 몸통 위에 바로 얹는다 (목은 보이지 않게)
  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  const face = ball(0.31, mats.skin, 1.1, 0.96, 0.97, 32);
  head.add(face);
  for (const side of [-1, 1]) {
    const ear = ball(0.055, mats.skin, 0.6, 1, 0.9);
    ear.position.set(side * 0.335, -0.02, 0);
    // 눈 — 세로로 긴 타원 + 큰 하이라이트
    const eye = ball(0.05, mats.eye, 0.78, 1.18, 0.4, 16);
    eye.position.set(side * 0.115, 0.0, 0.282);
    eye.rotation.y = side * 0.22;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), mats.shine);
    shine.position.set(side * 0.115 + 0.012 * side, 0.025, 0.3);
    const shine2 = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), mats.shine);
    shine2.position.set(side * 0.105 - 0.008 * side, -0.02, 0.302);
    const brow = mesh(new THREE.CapsuleGeometry(0.009, 0.045, 4, 6), mats.hair, false);
    brow.rotation.z = Math.PI / 2 - side * 0.15;
    brow.position.set(side * 0.115, 0.085, 0.285);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.042, 16), mats.blush);
    cheek.scale.y = 0.6;
    cheek.position.set(side * 0.19, -0.075, 0.262);
    cheek.rotation.y = side * 0.6;
    head.add(ear, eye, shine, shine2, brow, cheek);
  }
  const nose = ball(0.022, mats.skin, 1.1, 0.8, 0.8);
  nose.position.set(0, -0.045, 0.3);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12, Math.PI), mats.eye);
  mouth.position.set(0, -0.1, 0.287);
  mouth.rotation.z = Math.PI;
  head.add(nose, mouth);

  // 머리카락 — 뒤통수 덩어리 + 앞머리 가닥 + 옆머리, 긴 머리는 뒤로 흘러내림
  const hairGroup = new THREE.Group();
  head.add(hairGroup);
  const crown = ball(0.33, mats.hair, 1.1, 0.95, 1.0, 28);
  crown.position.set(0, 0.06, -0.045);
  const fringe: [number, number, number, number][] = [
    [-0.2, 0.17, 0.2, 0.35], [-0.07, 0.2, 0.25, 0.1], [0.07, 0.2, 0.25, -0.1], [0.2, 0.17, 0.2, -0.35],
  ];
  const fringeLocks: THREE.Mesh[] = [];
  for (const [x, y, z, rz] of fringe) {
    const lock = ball(0.11, mats.hair, 1.15, 0.8, 0.75);
    lock.position.set(x, y, z);
    lock.rotation.z = rz;
    hairGroup.add(lock);
    fringeLocks.push(lock);
  }
  for (const side of [-1, 1]) {
    const sideLock = ball(0.09, mats.hair, 0.7, 1.4, 0.85);
    sideLock.position.set(side * 0.31, 0.02, 0.07);
    hairGroup.add(sideLock);
  }
  hairGroup.add(crown);
  const longHair = new THREE.Group();
  const back = ball(0.27, mats.hair, 1.15, 1.25, 0.75);
  back.position.set(0, -0.12, -0.15);
  longHair.add(back);
  for (const side of [-1, 1]) {
    const tail = ball(0.1, mats.hair, 0.9, 1.6, 0.8);
    tail.position.set(side * 0.27, -0.2, -0.06);
    tail.rotation.z = side * 0.15;
    longHair.add(tail);
  }
  hairGroup.add(longHair);

  let anim: ChibiAnim = "Idle";
  let t = 0;
  let oneShotEnd = 0;

  return {
    root,
    head,
    hand,
    setColors: (c) => {
      mats.skin.color.set(c.skin);
      mats.shirt.color.set(c.shirt);
      mats.pants.color.set(c.pants);
      mats.hair.color.set(c.hair);
    },
    setHair: (style) => {
      longHair.visible = style === "a";
    },
    setHatLine: (line) => {
      // 정수리 머리는 모자 안에 들어가게 살짝 줄이고, 앞머리는 아래쪽 끝은 그대로 둔 채 위를 눌러 테두리 밑에 맞춘다
      crown.scale.set(line === null ? 1.1 : 1.07, line === null ? 0.95 : 0.93, line === null ? 1.0 : 0.99);
      crown.position.y = line === null ? 0.06 : 0.05;
      fringe.forEach(([x, y, z, rz], i) => {
        const lock = fringeLocks[i];
        const half = 0.11 * 0.8;
        const top = line === null ? y + half : Math.min(y + half, line - 0.012);
        const bottom = Math.min(y - half, top - 0.05);
        const k = (top - bottom) / (2 * half);
        lock.position.set(x, (top + bottom) / 2, line === null ? z : z + 0.02);
        lock.scale.set(1.15, 0.8 * k, 0.75);
        lock.rotation.z = line === null ? rz : rz * 0.6;
      });
    },
    play: (next) => {
      if (next === anim && next !== "PickUp" && next !== "Victory") return;
      anim = next;
      t = 0;
      oneShotEnd = next === "PickUp" ? 0.55 : next === "Victory" ? 2.2 : 0;
    },
    current: () => anim,
    busy: () => oneShotEnd > 0 && t < oneShotEnd,
    update: (dt, holdingRod) => {
      t += dt;
      if (oneShotEnd && t >= oneShotEnd) {
        anim = "Idle";
        oneShotEnd = 0;
        t = 0;
      }
      let hipY = 0.27;
      let lean = 0;
      let legSwing = 0;
      let armSwing = 0;
      const armOut = 0.18;
      let armUp = 0;
      let headTilt = 0;
      let squash = 1;
      if (anim === "Walk" || anim === "Run") {
        const run = anim === "Run";
        const ph = t * (run ? 14 : 10);
        legSwing = Math.sin(ph) * (run ? 0.85 : 0.6);
        armSwing = Math.sin(ph) * (run ? 1.0 : 0.55);
        hipY += Math.abs(Math.sin(ph)) * (run ? 0.045 : 0.025);
        lean = run ? 0.16 : 0.05;
        headTilt = Math.sin(ph * 2) * 0.03;
      } else if (anim === "PickUp") {
        const k = Math.sin(Math.min(1, t / 0.55) * Math.PI);
        hipY -= k * 0.07;
        lean = k * 0.45;
        armSwing = -k * 1.1;
        headTilt = k * 0.15;
      } else if (anim === "Victory") {
        const hop = t < 1.4 ? Math.max(0, Math.sin(t * 9)) : 0;
        hipY += hop * 0.07;
        squash = 1 - (t < 1.4 ? Math.max(0, -Math.sin(t * 9)) * 0.05 : 0);
        armUp = Math.min(1, t * 5);
        headTilt = -0.1;
      } else {
        hipY += Math.sin(t * 2.2) * 0.006;
        headTilt = Math.sin(t * 1.3) * 0.04;
      }
      hips.position.y = hipY;
      hips.scale.y = squash;
      torso.rotation.x = lean;
      legs[0].rotation.x = legSwing;
      legs[1].rotation.x = -legSwing;
      arms[0].rotation.set(-armSwing, 0, -armOut - armUp * 2.0);
      arms[1].rotation.set(armSwing, 0, armOut + armUp * 2.0);
      if (holdingRod && anim !== "Victory") arms[1].rotation.set(-1.0, 0, 0.3);
      head.rotation.x = headTilt;
    },
  };
}
