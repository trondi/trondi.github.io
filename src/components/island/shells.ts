import * as THREE from "three";

type Mat = (color: string) => THREE.Material;

/** 바닷가에서 줍는 조개 — 날마다 모래사장 여기저기에 새로 놓인다. weight가 클수록 자주 나온다 */
export const SHELL_KINDS = [
  { id: "pink", name: "분홍 조개", emoji: "🐚", weight: 5 },
  { id: "white", name: "하얀 조개", emoji: "🐚", weight: 5 },
  { id: "conch", name: "소라 껍데기", emoji: "🐚", weight: 2.5 },
  { id: "star", name: "불가사리", emoji: "⭐", weight: 1 },
] as const;
export type ShellKind = (typeof SHELL_KINDS)[number]["id"];
export const SHELL_BY_ID = new Map(SHELL_KINDS.map((k) => [k.id, k]));
/** 하루에 모래사장에 놓이는 조개 수 */
export const SHELLS_PER_DAY = 14;

/** 0~1 사이 값 하나로 종류 고르기 (가중치) */
export function pickShellKind(r: number): ShellKind {
  const total = SHELL_KINDS.reduce((a, k) => a + k.weight, 0);
  let t = r * total;
  for (const k of SHELL_KINDS) {
    t -= k.weight;
    if (t <= 0) return k.id;
  }
  return SHELL_KINDS[0].id;
}

/** 날짜 문자열을 숫자 씨앗으로 */
export const daySeed = (day: string) => [...day].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

const flatShape = (shape: THREE.Shape, depth: number) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
};

/** 모래 위에 놓인 조개 모델 — 밑면이 원점, 폭 약 0.25 */
export function buildShell(kind: ShellKind, mat: Mat): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === "pink" || kind === "white") {
    // 부채꼴 가리비 — 둥근 가장자리에 물결, 경첩 쪽에 작은 귀
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    const n = 7;
    for (let i = 0; i <= n * 4; i++) {
      const a = Math.PI * 0.12 + (i / (n * 4)) * Math.PI * 0.76;
      const r = 0.13 + Math.sin((i / 4) * Math.PI * 2) * 0.008;
      shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.lineTo(0, 0);
    const body = new THREE.Mesh(flatShape(shape, 0.03), mat(kind === "pink" ? "#f4b6c2" : "#fbf3e6"));
    body.position.z = 0.06;
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.035), mat(kind === "pink" ? "#e99aab" : "#ece0cc"));
    ear.position.set(0, 0.012, 0.06);
    // 결 — 가운데에서 퍼지는 줄 세 개
    for (const a of [-0.35, 0, 0.35]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.1), mat(kind === "pink" ? "#e48fa3" : "#e6d6bb"));
      rib.position.set(Math.sin(a) * 0.05, 0.032, 0.06 - Math.cos(a) * 0.05);
      rib.rotation.y = a;
      g.add(rib);
    }
    g.add(body, ear);
    g.rotation.x = -0.12;
  } else if (kind === "conch") {
    // 소라 — 옆으로 누운 원뿔 껍데기와 둥근 몸통, 입구는 분홍
    const shell = mat("#f0d2a2");
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 8), shell);
    spire.rotation.z = Math.PI / 2;
    spire.position.set(-0.08, 0.055, 0);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), shell);
    body.scale.set(1.1, 0.85, 0.9);
    body.position.set(0.03, 0.06, 0);
    const lip = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), mat("#f3a6b4"));
    lip.position.set(0.08, 0.06, 0.03);
    lip.rotation.y = Math.PI / 2.6;
    for (const x of [-0.11, -0.06]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03 + (x + 0.11) * 0.4, 0.008, 4, 10), mat("#d9b37a"));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(x, 0.055, 0);
      g.add(ring);
    }
    g.add(spire, body, lip);
  } else {
    // 불가사리 — 다섯 팔 별 모양
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.05 : 0.13;
      if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const star = new THREE.Mesh(flatShape(shape, 0.028), mat("#f08a4b"));
    g.add(star);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), mat("#f7c08f"));
      dot.position.set(Math.cos(a) * 0.06, 0.03, -Math.sin(a) * 0.06);
      g.add(dot);
    }
  }
  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return g;
}

/** 등불 — 손잡이 고리 꼭대기가 원점, 몸통은 아래로 매달린다 (키 약 0.24) */
export function buildLantern(mat: Mat, glass: THREE.Material): THREE.Object3D {
  const g = new THREE.Group();
  const metal = mat("#3b3340");
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 5, 12), metal);
  ring.position.y = -0.02;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.05, 4), metal);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = -0.065;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.085), glass);
  box.position.y = -0.14;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.1), metal);
  base.position.y = -0.2;
  g.add(ring, cap, box, base);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.012), metal);
    bar.position.set(x * 0.044, -0.14, z * 0.044);
    g.add(bar);
  }
  g.traverse((c) => (c.castShadow = false));
  return g;
}
