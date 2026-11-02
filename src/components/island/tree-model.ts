import * as THREE from "three";

import type { Season } from "@/lib/season";

/**
 * 섬 나무 — 면이 살짝 보이는 둥근 잎 덩어리(정이십면체를 한 번 쪼갠 모양)로 만든다.
 * 모델 파일 없이 코드로 만들고, 계절에 따라 색이 바뀐다. 전나무는 12월에 크리스마스 트리로 꾸밀 수 있다.
 * 밑동이 원점, 키는 약 2.5m.
 */

export type TreeKind = "common" | "pine" | "birch";
export type TreeOpts = {
  kind: TreeKind | "apple" | "orange";
  variant: number;
  season: Season;
  /** 봄 벚꽃 나무 */
  cherry?: boolean;
  /** 과일을 딴 뒤(열매 없음) */
  picked?: boolean;
  /** 크리스마스 장식 (전나무) */
  xmas?: boolean;
};

type Mat = (color: string) => THREE.Material;

const geoCache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};

/** 울퉁불퉁한 둥근 잎 덩어리 */
const blobGeo = (seed: number) =>
  cached(`blob-${seed}`, () => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 5.2 + seed) * Math.cos(v.z * 4.4 + seed * 2) * Math.sin(v.y * 3.6 + seed);
      v.multiplyScalar(1 + n * 0.07);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });

const PALETTE: Record<Season, string[][]> = {
  spring: [["#6cbb58", "#7cc866", "#5dab4c"], ["#64b553", "#75c262", "#58a548"]],
  summer: [["#5aa94b", "#66b556", "#4f9c43"], ["#55a247", "#62ae52", "#4a9540"]],
  autumn: [["#e0913a", "#eaa64a", "#d27a30"], ["#e8c04a", "#efcf63", "#d9aa38"], ["#c9573a", "#d86c47", "#b84a31"]],
  winter: [["#eef3f6", "#ffffff", "#dfe8ee"]],
};
const CHERRY = ["#f4b8cc", "#f8cada", "#eaa3bd"];

export function buildTree(o: TreeOpts, mat: Mat): THREE.Group {
  const g = new THREE.Group();
  const mesh = (geo: THREE.BufferGeometry, color: string) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const blob = (r: number, color: string, x: number, y: number, z: number, sy = 1, seed = 1) => {
    const m = mesh(blobGeo(seed), color);
    m.scale.set(r, r * sy, r);
    m.position.set(x, y, z);
    return m;
  };
  const trunk = (h: number, rt: number, rb: number, color = "#8a5a3a") => {
    const m = mesh(cached(`trunk-${h}-${rt}-${rb}`, () => new THREE.CylinderGeometry(rt, rb, h, 7)), color);
    m.position.y = h / 2;
    return m;
  };

  if (o.kind === "pine") {
    g.add(trunk(0.42, 0.15, 0.2, "#7a4f33"));
    const greens = o.season === "autumn" ? ["#3a8050", "#3f8655", "#468e5c", "#4d9663"] : ["#3d8a55", "#438f5a", "#4a9862", "#52a06a"];
    const tiers: [number, number, number][] = [[0.94, 0.88, 0.78], [0.75, 0.78, 1.3], [0.55, 0.68, 1.77], [0.34, 0.57, 2.18]];
    const scale = o.variant === 2 ? 0.88 : 1;
    tiers.forEach(([rb, h, y], i) => {
      const cone = mesh(cached(`cone-${rb}-${h}`, () => new THREE.ConeGeometry(rb, h, 8, 1)), greens[i]);
      cone.position.y = y;
      cone.rotation.y = i * 0.4;
      g.add(cone);
      if (o.season === "winter") {
        const cap = mesh(cached(`cap-${rb}-${h}`, () => new THREE.ConeGeometry(rb * 0.7, h * 0.45, 8, 1)), "#f4f7fa");
        cap.position.y = y + h * 0.28;
        cap.rotation.y = i * 0.4;
        g.add(cap);
      }
    });
    if (o.xmas) decorate(g, tiers);
    g.scale.set(scale, scale, scale);
    return g;
  }

  const pal = PALETTE[o.season];
  const leaves = o.cherry ? CHERRY : pal[(o.variant - 1) % pal.length];

  if (o.kind === "birch") {
    g.add(trunk(1.5, 0.09, 0.13, "#ece8e0"));
    for (const y of [0.35, 0.7, 1.05]) {
      const band = mesh(cached("band", () => new THREE.CylinderGeometry(0.112, 0.112, 0.05, 7)), "#3a3a3a");
      band.position.y = y;
      band.rotation.y = y * 3;
      g.add(band);
    }
    g.add(blob(0.55, leaves[0], 0, 2.15, 0, 1.35, 11), blob(0.38, leaves[1], 0.26, 1.72, 0.15, 1, 12));
    return g;
  }

  if (o.kind === "apple" || o.kind === "orange") {
    const leaf = o.season === "winter" ? PALETTE.summer[0] : o.season === "autumn" ? ["#7a9a3f", "#86a64a", "#6e8e38"] : PALETTE.summer[0];
    g.add(trunk(0.95, 0.13, 0.19));
    if (o.kind === "apple") g.add(blob(0.82, leaf[0], 0, 1.72, 0, 0.88, 4));
    else g.add(blob(0.72, leaf[2], 0, 1.62, 0, 0.95, 9), blob(0.46, leaf[1], 0.45, 2.05, -0.12, 1, 10));
    if (!o.picked) {
      const fruit = o.kind === "apple" ? "#d9453a" : "#f0922f";
      const spots: [number, number, number][] =
        o.kind === "apple"
          ? [[0.5, 1.9, 0.5], [-0.42, 1.72, 0.6], [0.12, 2.25, 0.58], [0.68, 1.5, 0.12], [-0.62, 1.95, -0.12], [0.05, 1.4, 0.74]]
          : [[0.5, 1.62, 0.45], [-0.38, 1.5, 0.55], [0.05, 2.05, 0.6], [0.75, 2.0, 0.2], [-0.55, 1.85, -0.25]];
      // 잎 덩어리 겉면에 살짝 묻히게 — 중심에서 방향만 따서 표면 위로 옮긴다
      const [cy, r, sy] = o.kind === "apple" ? [1.72, 0.82, 0.88] : [1.62, 0.72, 0.95];
      for (const [x, y, z] of spots) {
        const d = new THREE.Vector3(x, (y - cy) / sy, z).normalize();
        g.add(blob(0.11, fruit, d.x * r * 0.98, cy + d.y * r * sy * 0.98, d.z * r * 0.98, 1, 2));
      }
    }
    return g;
  }

  // 활엽수 — 모양 세 가지
  if (o.variant === 2) {
    g.add(trunk(0.85, 0.12, 0.18));
    g.add(
      blob(0.55, leaves[0], 0, 1.35, 0, 1, 5),
      blob(0.5, leaves[1], 0.45, 1.78, 0.05, 1, 6),
      blob(0.5, leaves[2], -0.4, 1.82, 0.12, 1, 7),
      blob(0.42, leaves[0], 0, 2.2, 0, 1, 8),
    );
  } else if (o.variant === 3) {
    g.add(trunk(1.0, 0.13, 0.19));
    g.add(blob(0.74, leaves[0], 0, 1.75, 0, 1.05, 13), blob(0.42, leaves[1], 0.36, 2.2, -0.1, 1, 14));
  } else {
    g.add(trunk(1.05, 0.14, 0.21));
    g.add(blob(0.78, leaves[0], 0, 1.75, 0, 0.9, 1), blob(0.5, leaves[1], 0.55, 1.5, 0.25, 1, 2), blob(0.47, leaves[2], -0.5, 1.55, -0.15, 1, 3));
  }
  return g;
}

/** 전나무를 크리스마스 트리로 — 오너먼트, 나선 전구, 꼭대기 별, 선물 상자 */
function decorate(g: THREE.Group, tiers: [number, number, number][]) {
  const cols = ["#e0453a", "#f2c94c", "#4f8fe0", "#f28bb3", "#ffffff"];
  const ballGeo = cached("orn", () => new THREE.IcosahedronGeometry(0.075, 1));
  let k = 0;
  tiers.forEach(([rb, h, y], i) => {
    const n = 6 - i;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + i * 0.5;
      const c = cols[k++ % cols.length];
      const o = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.3, emissive: c, emissiveIntensity: 0.15 }));
      o.position.set(Math.cos(a) * rb * 0.82, y - h * 0.38, Math.sin(a) * rb * 0.82);
      g.add(o);
    }
  });
  const bulb = new THREE.MeshBasicMaterial({ color: "#ffe38a" });
  const bulbGeo = cached("bulb", () => new THREE.SphereGeometry(0.03, 6, 4));
  for (let t = 0; t < 30; t++) {
    const u = t / 30;
    const y = 0.5 + u * 1.75;
    const rr = 0.9 * (1 - u) + 0.12;
    const a = u * Math.PI * 7;
    const l = new THREE.Mesh(bulbGeo, bulb);
    l.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    g.add(l);
  }
  const shape = new THREE.Shape();
  for (let s = 0; s < 10; s++) {
    const a = (s / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = s % 2 ? 0.09 : 0.2;
    if (s) shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const star = new THREE.Mesh(
    cached("star", () => new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false })),
    new THREE.MeshStandardMaterial({ color: "#f5c542", emissive: "#f5c542", emissiveIntensity: 0.5 }),
  );
  star.position.set(0, 2.6, -0.03);
  g.add(star);
  for (const [x, z, c, rc] of [[0.62, 0.55, "#e0453a", "#f2c94c"], [-0.55, 0.6, "#4f8fe0", "#ffffff"]] as const) {
    const box = new THREE.Mesh(cached("gift", () => new THREE.BoxGeometry(0.26, 0.2, 0.26)), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    box.position.set(x, 0.1, z);
    const rib = new THREE.Mesh(cached("rib", () => new THREE.BoxGeometry(0.27, 0.21, 0.05)), new THREE.MeshStandardMaterial({ color: rc, roughness: 0.6 }));
    rib.position.copy(box.position);
    box.castShadow = true;
    g.add(box, rib);
  }
}
