import * as THREE from "three";

import type { Season } from "@/lib/season";

/**
 * 섬 지형 — 아래 단(마을·과수원·바닷가) + 북쪽 위 단(숲·연못) + 강 + 바다.
 * 위 단은 경사로로 올라가고, 강은 다리로만 건넌다. 단위는 월드 좌표(m)
 */

export const LOW = 0.15;
export const TIER = 1.15;
export const WATER_Y = -0.12;
/** 위 단의 강·연못 수면 */
export const HIGH_WATER_Y = TIER - 0.3;

/** 강 중심선 (z에 따른 x) */
export const riverX = (z: number) => 4.5 + 2.0 * Math.sin(z * 0.17 + 0.5);
/** 위 단 절벽 경계 (x에 따른 z) — 이보다 작으면 위 단 */
export const cliffZ = (x: number) => -8.5 + Math.sin(x * 0.22) * 1.4 + Math.sin(x * 0.63) * 0.4;

export const RAMP = { x: -3.2, halfWidth: 1.2 };
export const POND = { x: -10, z: -14, r: 2.7 };
export const BRIDGES = [
  { z: 1.2, tier: false },
  { z: 10.5, tier: false },
  { z: -13.5, tier: true },
].map((b) => ({ ...b, halfWidth: 0.55, halfLength: 1.9 }));
/** 남쪽 바닷가 선착장 */
export const DOCK = { x: -6, z0: 14.8, z1: 21, halfWidth: 0.8, y: 0.32 };

const smooth = THREE.MathUtils.smoothstep;

/** 섬 외곽 (살짝 일그러진 타원). 1보다 크면 바다 */
export function islandE(x: number, z: number) {
  const dz = z + 1.5;
  const th = Math.atan2(dz, x);
  const wobble = 1 + 0.05 * Math.sin(th * 3 + 0.4) + 0.03 * Math.cos(th * 5);
  return Math.hypot(x / 24, dz / 18.5) * wobble;
}

/** 경사로 가까이일수록 1 */
function rampK(x: number) {
  return 1 - smooth(Math.abs(x - RAMP.x), RAMP.halfWidth, RAMP.halfWidth + 0.7);
}

/** 0 = 아래 단, 1 = 위 단 */
export function tierT(x: number, z: number) {
  const k = rampK(x);
  const lo = THREE.MathUtils.lerp(-0.15, -1.9, k);
  const hi = THREE.MathUtils.lerp(0.35, 1.9, k);
  return smooth(cliffZ(x) - z, lo, hi);
}

export function groundHeight(x: number, z: number) {
  const t = tierT(x, z);
  let h = LOW + t * (TIER - LOW);
  // 연못
  const dp = Math.hypot(x - POND.x, z - POND.z);
  if (dp < POND.r) h -= 0.5;
  else if (dp < POND.r + 0.45) h -= 0.5 * (1 - (dp - POND.r) / 0.45);
  // 강
  const dr = Math.abs(x - riverX(z));
  if (dr < 1.1) h -= 0.5;
  else if (dr < 1.5) h -= 0.5 * (1 - (dr - 1.1) / 0.4);
  // 바다
  const shore = smooth(islandE(x, z), 0.99, 1.12);
  return THREE.MathUtils.lerp(h, -0.8, shore);
}

export function bridgeAt(x: number, z: number) {
  return BRIDGES.find((b) => Math.abs(z - b.z) < b.halfWidth && Math.abs(x - riverX(b.z)) < b.halfLength) ?? null;
}

export function onDock(x: number, z: number) {
  return Math.abs(x - DOCK.x) < DOCK.halfWidth && z > DOCK.z0 && z < DOCK.z1;
}

/** 지형만 고려한 걷기 가능 여부 (나무·집 같은 장애물은 따로) */
export function terrainWalkable(x: number, z: number) {
  if (onDock(x, z)) return true;
  if (bridgeAt(x, z)) return true;
  if (islandE(x, z) > 0.955) return false;
  if (Math.abs(x - riverX(z)) < 1.4) return false;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.35) return false;
  // 절벽 띠는 막고, 경사로만 통과
  const d = cliffZ(x) - z;
  if (d > -0.55 && d < 0.65 && Math.abs(x - RAMP.x) > RAMP.halfWidth - 0.15) return false;
  return true;
}

/** 걸어 다닐 때 발 높이 — 다리·선착장 위에서는 상판 높이 */
export function walkHeight(x: number, z: number) {
  const b = bridgeAt(x, z);
  if (b) {
    const u = (x - riverX(b.z) + b.halfLength) / (b.halfLength * 2);
    return (b.tier ? TIER : LOW) + 0.02 + Math.sin(THREE.MathUtils.clamp(u, 0, 1) * Math.PI) * 0.18;
  }
  if (onDock(x, z)) return Math.max(DOCK.y + 0.05, groundHeight(x, z));
  return groundHeight(x, z);
}

export type WaterKind = "river" | "pond" | "sea";

/** 낚시용 — 이 지점이 물이면 종류와 수면 높이 */
export function waterAt(x: number, z: number): { kind: WaterKind; y: number } | null {
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r - 0.15) return { kind: "pond", y: HIGH_WATER_Y };
  const high = tierT(x, z) > 0.5;
  if (Math.abs(x - riverX(z)) < 1.0 && islandE(x, z) < 1.0) return { kind: "river", y: high ? HIGH_WATER_Y : WATER_Y };
  if (groundHeight(x, z) < WATER_Y - 0.15 && islandE(x, z) > 0.99) return { kind: "sea", y: WATER_Y };
  return null;
}

const PALETTE: Record<Season, { low: string; high: string; cliff: string; path: string }> = {
  spring: { low: "#9fd872", high: "#8fcc66", cliff: "#a98462", path: "#c9a978" },
  summer: { low: "#80c95a", high: "#72bb50", cliff: "#a07a56", path: "#c4a273" },
  autumn: { low: "#b2c866", high: "#a3bd5c", cliff: "#a98462", path: "#c9a978" },
  winter: { low: "#e8eef4", high: "#dfe7ef", cliff: "#b9a792", path: "#d8d2c6" },
};

/** 낮은 폴리곤 느낌의 지형 메시 (정점 색) */
export function buildGround(season: Season, material: THREE.Material) {
  const SIZE = 104;
  const SEG = 230;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const pal = PALETTE[season];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const t = tierT(x, z);
    const base = LOW + t * (TIER - LOW);
    const dr = Math.abs(x - riverX(z));
    const dp = Math.hypot(x - POND.x, z - POND.z);
    const e = islandE(x, z);
    const ramp = Math.abs(x - RAMP.x) < RAMP.halfWidth + 0.2;
    if (h < -0.3) c.set(dr < 1.15 || dp < POND.r ? "#5b9aa6" : "#4f8fa0");
    else if ((dr < 1.5 || dp < POND.r + 0.45) && h < base - 0.05) c.set("#e6d2a2");
    else if (e > 0.93 && h < base + 0.01 && t < 0.5) c.set(season === "winter" ? "#efe9dc" : "#e8d6a6");
    else if (t > 0.06 && t < 0.94) c.set(ramp ? pal.path : pal.cliff);
    else c.set(t >= 0.94 ? pal.high : pal.low);
    // 같은 색이 반복되지 않도록 아주 약간 흔든다 (결정적)
    const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    c.offsetHSL(0, 0, ((n - Math.floor(n)) - 0.5) * 0.035);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** 위 단을 흐르는 강물 (강을 따라 휘는 띠) + 폭포 위치 */
export function buildUpperRiver(material: THREE.Material) {
  const pts: number[] = [];
  const idx: number[] = [];
  let end = -9;
  // 절벽과 강이 만나는 z를 찾는다
  for (let z = -6; z > -14; z -= 0.02) {
    if (cliffZ(riverX(z)) - z > 0.1) {
      end = z;
      break;
    }
  }
  // 북쪽 섬 끝에서 시작한다 (그 너머는 바다)
  let start = end;
  while (start > -40 && islandE(riverX(start - 0.1), start - 0.1) < 0.97) start -= 0.1;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const z = start + ((end - start) * i) / steps;
    const x = riverX(z);
    pts.push(x - 1.25, HIGH_WATER_Y, z, x + 1.25, HIGH_WATER_Y, z);
    if (i < steps) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { mesh: new THREE.Mesh(geo, material), fallZ: end, fallX: riverX(end), sourceZ: start };
}
