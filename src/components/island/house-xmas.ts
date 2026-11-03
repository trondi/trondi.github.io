import * as THREE from "three";

/**
 * 크리스마스 시즌(11월~1월 6일)의 집 장식 — 지붕 라인(앞 박공·용마루·양옆 박공·처마)·포치 처마·벽 모서리의 전구, 창문 테두리 전구,
 * 오른쪽 지붕 경사면에 걸쳐 놓은 큰 산타 양말, 포치 기둥 사이 갈란드, 현관문 리스.
 * 좌표는 집 모델(포치 달린 2층 집, House.glb) 기준이라 집 오브젝트의 자식으로 붙인다.
 * 전구는 색마다 재질을 하나씩 두고, 밤이 되면 밝아지며 번갈아 반짝인다.
 */

type Mat = (color: string) => THREE.Material;
export type HouseXmas = {
  group: THREE.Group;
  /** 매 프레임 — time(초), night(0 낮 ~ 1 밤) */
  update: (time: number, night: number) => void;
};

const BULB_COLORS = ["#ff5a4f", "#ffd54a", "#5fd17a", "#5aa8ff"];

// 집 모델에서 잰 자리 (현관 포치가 +z 쪽)
const GABLE_Z = 1.36; // 앞 박공 지붕 끝
const GABLE_EAVE = { x: 1.3, y: 1.68 }; // 박공 양쪽 처마 끝
const GABLE_PEAK_Y = 3.06;
// 본채 지붕 — 용마루는 x축 방향(z -0.77), 양옆 박공 끝은 x ±1.66
const RIDGE = { x: 1.6, y: 3.21, z: -0.77 };
const SIDE_RAKE = { x: 1.69, top: { y: 3.16, z: -0.77 }, eave: { y: 1.66, z: 0.29 } };
const SIDE_EAVE_X0 = 1.36; // 옆 처마가 앞 박공 벽 뒤로 숨기 시작하는 곳
const PORCH_EAVE = { x0: -1.1, x1: 1.12, y: 0.8, z: 1.97 }; // 포치 지붕 앞 끝
const POSTS_X = [-0.95, -0.31, 0.32, 0.96]; // 포치 앞 기둥
const POST_Z = 1.86;
const DOOR = { x: -0.53, y: 0.42, z: 1.2 }; // 갈란드에 가리지 않게 문 가운데쯤
const WALL_Z = 1.22; // 앞벽(창문 앞)
const WINDOWS = [
  { x0: -0.74, x1: -0.4, y0: 1.21, y1: 1.61 }, // 2층 왼쪽
  { x0: 0.39, x1: 0.74, y0: 1.21, y1: 1.61 }, // 2층 오른쪽
  { x0: -0.18, x1: 0.17, y0: 1.96, y1: 2.37 }, // 다락
];
const CORNER = { x: 1.37, y0: 0.22, y1: 1.6 }; // 앞벽 양쪽 모서리
// 본채 지붕 앞 경사면 — 용마루(z -0.77, y 3.17)에서 처마(z 0.25, y 1.69)로 내려온다. 앞 박공 오른쪽에 보이는 자리
const ROOF_TILT = Math.atan2(1.02, 1.48); // 경사면이 앞쪽(+z)에서 뒤로 누운 각도
const STOCKING_TOP = { x: 1.24, y: 3.02, z: -0.6 }; // 경사면 위로 살짝 띄운 양말 고리 자리

export function buildHouseXmas(mat: Mat): HouseXmas {
  const g = new THREE.Group();
  g.name = "house-xmas";

  const bulbMats = BULB_COLORS.map(
    (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.4 }),
  );
  const bulbGeo = new THREE.SphereGeometry(0.034, 6, 4);
  let k = 0;
  const bulb = (x: number, y: number, z: number) => {
    const m = new THREE.Mesh(bulbGeo, bulbMats[k++ % bulbMats.length]);
    m.position.set(x, y, z);
    g.add(m);
  };
  // a→b 사이에 간격 step으로 전구를 늘어놓는다 (sag만큼 사이사이 살짝 처지게)
  const string = (a: THREE.Vector3, b: THREE.Vector3, step: number, sag = 0, every = 1) => {
    const n = Math.max(1, Math.round(a.distanceTo(b) / step));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = a.clone().lerp(b, u);
      p.y -= sag * Math.abs(Math.sin(u * n * Math.PI / every));
      bulb(p.x, p.y, p.z);
    }
  };

  // 앞 박공 지붕선
  const peak = new THREE.Vector3(0, GABLE_PEAK_Y, GABLE_Z);
  string(new THREE.Vector3(-GABLE_EAVE.x, GABLE_EAVE.y, GABLE_Z), peak, 0.13);
  string(peak, new THREE.Vector3(GABLE_EAVE.x, GABLE_EAVE.y, GABLE_Z), 0.13);

  // 본채 지붕 라인 — 용마루, 앞 박공 용마루, 양옆 박공의 앞쪽 경사와 처마
  string(new THREE.Vector3(-RIDGE.x, RIDGE.y, RIDGE.z), new THREE.Vector3(RIDGE.x, RIDGE.y, RIDGE.z), 0.13);
  string(new THREE.Vector3(0, GABLE_PEAK_Y + 0.09, GABLE_Z - 0.14), new THREE.Vector3(0, RIDGE.y - 0.02, RIDGE.z + 0.16), 0.13);
  for (const sx of [-1, 1]) {
    const top = new THREE.Vector3(sx * SIDE_RAKE.x, SIDE_RAKE.top.y, SIDE_RAKE.top.z);
    const eave = new THREE.Vector3(sx * SIDE_RAKE.x, SIDE_RAKE.eave.y, SIDE_RAKE.eave.z);
    string(top, eave, 0.13);
    string(eave, new THREE.Vector3(sx * SIDE_EAVE_X0, SIDE_RAKE.eave.y, SIDE_RAKE.eave.z), 0.11);
  }

  // 벽 — 앞벽 양쪽 모서리를 따라 내려오는 전구, 창문마다 테두리 전구
  for (const sx of [-1, 1]) {
    string(new THREE.Vector3(sx * CORNER.x, CORNER.y1, WALL_Z - 0.04), new THREE.Vector3(sx * CORNER.x, CORNER.y0, WALL_Z - 0.04), 0.11);
  }
  for (const w of WINDOWS) {
    const m = 0.05;
    const c = [
      new THREE.Vector3(w.x0 - m, w.y1 + m, WALL_Z),
      new THREE.Vector3(w.x1 + m, w.y1 + m, WALL_Z),
      new THREE.Vector3(w.x1 + m, w.y0 - m, WALL_Z),
      new THREE.Vector3(w.x0 - m, w.y0 - m, WALL_Z),
    ];
    // 모서리 전구가 겹치지 않게 각 변의 끝점은 빼고 늘어놓는다
    c.forEach((a, i) => {
      const b = c[(i + 1) % 4];
      const n = Math.max(1, Math.round(a.distanceTo(b) / 0.09));
      for (let j = 0; j < n; j++) {
        const p = a.clone().lerp(b, j / n);
        bulb(p.x, p.y, p.z);
      }
    });
  }

  // 포치 처마 — 짧게 늘어진 고리 모양
  string(
    new THREE.Vector3(PORCH_EAVE.x0, PORCH_EAVE.y, PORCH_EAVE.z),
    new THREE.Vector3(PORCH_EAVE.x1, PORCH_EAVE.y, PORCH_EAVE.z),
    0.1,
    0.05,
    2,
  );

  // 포치 기둥 사이 갈란드 + 기둥마다 빨간 리본
  const green = mat("#2f6b3a");
  const red = mat("#d33a35");
  for (let i = 0; i < POSTS_X.length - 1; i++) {
    const a = new THREE.Vector3(POSTS_X[i], 0.74, POST_Z);
    const b = new THREE.Vector3(POSTS_X[i + 1], 0.74, POST_Z);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 0.16;
    mid.z += 0.04;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.034, 5), green));
  }
  const bowGeo = new THREE.IcosahedronGeometry(0.045, 0);
  for (const x of POSTS_X) {
    for (const s of [-1, 1]) {
      const loop = new THREE.Mesh(bowGeo, red);
      loop.position.set(x + s * 0.045, 0.76, POST_Z + 0.04);
      loop.scale.set(1, 0.7, 0.5);
      g.add(loop);
    }
  }

  // 현관문 리스
  const wreath = buildWreath(mat);
  wreath.position.set(DOOR.x, DOOR.y, DOOR.z);
  g.add(wreath);

  // 산타 양말 — 오른쪽 지붕 경사면에 크게 걸쳐 둔다 (발끝은 오른쪽)
  const stocking = buildStocking(mat);
  stocking.position.set(STOCKING_TOP.x, STOCKING_TOP.y, STOCKING_TOP.z);
  stocking.rotation.set(-ROOF_TILT, 0, 0.12, "XYZ");
  stocking.scale.setScalar(1.4);
  g.add(stocking);

  return {
    group: g,
    update(time, night) {
      // 낮에는 은은하게, 밤에는 밝게 — 색마다 박자를 달리해 번갈아 반짝인다
      bulbMats.forEach((m, i) => {
        const tw = 0.5 + 0.5 * Math.sin(time * 2.4 + i * 1.7);
        m.emissiveIntensity = 0.35 + night * (0.5 + 0.9 * tw);
      });
    },
  };
}

/** 리스 — 초록 고리에 빨간 열매, 아래에 리본. 고리 중심이 원점이고 앞(+z)을 본다. 반지름 약 0.11 */
export function buildWreath(mat: Mat) {
  const green = mat("#2f6b3a");
  const red = mat("#d33a35");
  const wreath = new THREE.Group();
  wreath.add(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.042, 6, 14), green));
  const berryGeo = new THREE.IcosahedronGeometry(0.022, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const berry = new THREE.Mesh(berryGeo, red);
    berry.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.035);
    wreath.add(berry);
  }
  const bowGeo = new THREE.IcosahedronGeometry(0.045, 0);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(bowGeo, red);
    loop.position.set(s * 0.04, -0.11, 0.04);
    loop.scale.set(0.9, 0.6, 0.4);
    wreath.add(loop);
  }
  return wreath;
}

/** 산타 양말 — 빨간 양말에 흰 털 단, 호랑가시 잎과 열매, 거는 고리. 고리 아래(단 윗면)가 원점 */
function buildStocking(mat: Mat) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-0.11, 0);
  s.lineTo(-0.11, -0.36);
  s.quadraticCurveTo(-0.11, -0.48, 0.0, -0.48);
  s.lineTo(0.17, -0.48);
  s.quadraticCurveTo(0.27, -0.48, 0.27, -0.395);
  s.quadraticCurveTo(0.27, -0.31, 0.17, -0.31);
  s.lineTo(0.11, -0.31);
  s.lineTo(0.11, 0);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
    curveSegments: 6,
  });
  body.translate(0, 0, -0.035);
  g.add(new THREE.Mesh(body, mat("#cf2f2b")));
  // 흰 털 단 (위쪽)과 발끝
  const white = mat("#f7f3ea");
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.11, 0.13), white);
  cuff.position.set(0, -0.03, 0);
  g.add(cuff);
  const toe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), white);
  toe.position.set(0.22, -0.4, 0);
  toe.scale.set(1, 1, 0.75);
  g.add(toe);
  // 털 단 위의 호랑가시 잎 두 장과 빨간 열매
  const leaf = mat("#2f6b3a");
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), leaf);
    l.position.set(-0.05 + sx * 0.035, -0.03, 0.075);
    l.scale.set(1.3, 0.6, 0.4);
    l.rotation.z = sx * 0.4;
    g.add(l);
  }
  const berry = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), mat("#d33a35"));
  berry.position.set(-0.05, -0.03, 0.09);
  g.add(berry);
  // 거는 고리
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 4, 10), white);
  loop.position.set(-0.08, 0.04, 0);
  g.add(loop);
  return g;
}
