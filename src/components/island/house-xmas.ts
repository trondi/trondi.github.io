import * as THREE from "three";

/**
 * 12월의 집 장식 — 앞 박공 지붕선과 포치 처마의 전구, 포치 기둥 사이 갈란드, 현관문 리스.
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
const PORCH_EAVE = { x0: -1.1, x1: 1.12, y: 0.8, z: 1.97 }; // 포치 지붕 앞 끝
const POSTS_X = [-0.95, -0.31, 0.32, 0.96]; // 포치 앞 기둥
const POST_Z = 1.86;
const DOOR = { x: -0.53, y: 0.42, z: 1.2 }; // 갈란드에 가리지 않게 문 가운데쯤

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

  // 현관문 리스 — 초록 고리에 빨간 열매, 아래에 리본
  const wreath = new THREE.Group();
  wreath.position.set(DOOR.x, DOOR.y, DOOR.z);
  wreath.add(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.042, 6, 14), green));
  const berryGeo = new THREE.IcosahedronGeometry(0.022, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const berry = new THREE.Mesh(berryGeo, red);
    berry.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.035);
    wreath.add(berry);
  }
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(bowGeo, red);
    loop.position.set(s * 0.04, -0.11, 0.04);
    loop.scale.set(0.9, 0.6, 0.4);
    wreath.add(loop);
  }
  g.add(wreath);

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
