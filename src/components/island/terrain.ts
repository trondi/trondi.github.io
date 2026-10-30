import * as THREE from "three";

import type { Season } from "@/lib/season";

/** 섬 지형 — 아래 단(산책 구역) + 뒤쪽 위 단 + 강 + 바다. 단위는 월드 좌표(m) */

export const LOW = 0.15;
export const TIER = 1.15;
export const WATER_Y = -0.12;

/** 강 중심선 (z에 따른 x) */
export const riverX = (z: number) => 3.6 + 1.6 * Math.sin(z * 0.22 + 0.6);
/** 위 단 절벽 경계 (x에 따른 z) — 이보다 작으면 위 단 */
export const cliffZ = (x: number) => -7.5 + Math.sin(x * 0.35) * 1.1 + Math.sin(x * 0.9) * 0.3;

/** 다리 — 강을 가로지르는 유일한 통로 */
export const BRIDGE = { z: 1.2, halfWidth: 0.5, halfLength: 1.75 };

const smooth = THREE.MathUtils.smoothstep;

/** 아래 단 섬 외곽 (타원). 1보다 크면 바다 쪽 */
export function islandE(x: number, z: number) {
  return Math.hypot(x / 13.5, (z - 1.5) / 9.5);
}

/** 0 = 아래 단, 1 = 위 단 */
function tierT(x: number, z: number) {
  return smooth(cliffZ(x) - z, -0.15, 0.35);
}

export function groundHeight(x: number, z: number) {
  const t = tierT(x, z);
  let h = LOW + t * (TIER - LOW);
  const shore = smooth(islandE(x, z), 1.0, 1.16) * (1 - t);
  h = THREE.MathUtils.lerp(h, -0.75, shore);
  const dr = Math.abs(x - riverX(z));
  if (dr < 1.05) h -= 0.5;
  else if (dr < 1.45) h -= 0.5 * (1 - (dr - 1.05) / 0.4);
  return h;
}

export function onBridge(x: number, z: number) {
  return Math.abs(z - BRIDGE.z) < BRIDGE.halfWidth && Math.abs(x - riverX(BRIDGE.z)) < BRIDGE.halfLength;
}

/** 지형만 고려한 걷기 가능 여부 (나무·집 같은 장애물은 따로) */
export function terrainWalkable(x: number, z: number) {
  if (islandE(x, z) > 0.96) return false;
  if (z < cliffZ(x) + 0.45) return false;
  if (Math.abs(x - riverX(z)) < 1.3 && !onBridge(x, z)) return false;
  return true;
}

/** 걸어 다닐 때 발 높이 — 다리 위에서는 다리 상판 높이 */
export function walkHeight(x: number, z: number) {
  if (onBridge(x, z)) {
    const u = (x - riverX(BRIDGE.z) + BRIDGE.halfLength) / (BRIDGE.halfLength * 2);
    return 0.17 + Math.sin(THREE.MathUtils.clamp(u, 0, 1) * Math.PI) * 0.18;
  }
  return groundHeight(x, z);
}

const PALETTE: Record<Season, { low: string; high: string; cliff: string }> = {
  spring: { low: "#9fd872", high: "#8fcc66", cliff: "#a98462" },
  summer: { low: "#80c95a", high: "#72bb50", cliff: "#a07a56" },
  autumn: { low: "#b2c866", high: "#a3bd5c", cliff: "#a98462" },
  winter: { low: "#e8eef4", high: "#dfe7ef", cliff: "#b9a792" },
};

/** 낮은 폴리곤 느낌의 지형 메시 (정점 색) */
export function buildGround(season: Season, material: THREE.Material) {
  const SIZE = 64;
  const SEG = 150;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const pal = PALETTE[season];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - 2;
    const h = groundHeight(x, z);
    pos.setY(i, h);
    pos.setZ(i, z);
    const t = tierT(x, z);
    const dr = Math.abs(x - riverX(z));
    const e = islandE(x, z);
    if (h < -0.3) c.set(dr < 1.1 ? "#5b9aa6" : "#4f8fa0");
    else if (dr < 1.45 && h < LOW - 0.05 + t * (TIER - LOW)) c.set("#e6d2a2");
    else if (e > 0.985 && t < 0.5) c.set(season === "winter" ? "#efe9dc" : "#e8d6a6");
    else if (t > 0.08 && t < 0.92) c.set(pal.cliff);
    else c.set(t >= 0.92 ? pal.high : pal.low);
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

/** 위 단을 흐르는 강물 (강을 따라 휘는 띠) */
export function buildUpperRiver(material: THREE.Material) {
  const pts: number[] = [];
  const idx: number[] = [];
  const end = cliffZ(riverX(-7)) - 0.05;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const z = -40 + ((end + 40) * i) / steps;
    const x = riverX(z);
    pts.push(x - 1.2, TIER - 0.3, z, x + 1.2, TIER - 0.3, z);
    if (i < steps) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { mesh: new THREE.Mesh(geo, material), fallZ: end, fallX: riverX(end) };
}
