import * as THREE from "three";

/** 방문자의 실제 시각에 따라 하늘·빛·안개를 바꾼다 */

type Key = {
  h: number;
  top: string;
  bottom: string;
  fog: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunI: number;
  /** 0 = 낮, 1 = 밤 (별·창문 불빛·반딧불) */
  night: number;
};

const NIGHT: Omit<Key, "h"> = {
  top: "#0b0a24", bottom: "#2a2352", fog: "#2a2352",
  hemiSky: "#5a64b0", hemiGround: "#1b2433", hemi: 0.75,
  sun: "#a9b8ff", sunI: 0.7, night: 1,
};
const DAWN: Omit<Key, "h"> = {
  top: "#6b74c9", bottom: "#f6b8a0", fog: "#f0bba8",
  hemiSky: "#ffd9cf", hemiGround: "#5d7a58", hemi: 0.95,
  sun: "#ffc49a", sunI: 1.6, night: 0.25,
};
const DAY: Omit<Key, "h"> = {
  top: "#6fb0ec", bottom: "#d6ecff", fog: "#cfe6f7",
  hemiSky: "#eaf3ff", hemiGround: "#6b8f5a", hemi: 1.15,
  sun: "#fff2dc", sunI: 2.4, night: 0,
};
const DUSK: Omit<Key, "h"> = {
  top: "#6f5aa8", bottom: "#f6c58f", fog: "#eaa58f",
  hemiSky: "#ffe1d0", hemiGround: "#6b8f5a", hemi: 1.05,
  sun: "#ffc08a", sunI: 2.1, night: 0.1,
};

const KEYS: Key[] = [
  { h: 0, ...NIGHT }, { h: 4.8, ...NIGHT }, { h: 6.3, ...DAWN }, { h: 8.5, ...DAY },
  { h: 16, ...DAY }, { h: 17.8, ...DUSK }, { h: 19.4, ...NIGHT }, { h: 24, ...NIGHT },
];

export type SkyState = {
  top: THREE.Color; bottom: THREE.Color; fog: THREE.Color;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemi: number;
  sun: THREE.Color; sunI: number; night: number;
  sunDir: THREE.Vector3;
};

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const mix = (a: string, b: string, t: number) => tmpA.set(a).lerp(tmpB.set(b), t).clone();

export function skyAt(date: Date): SkyState {
  const h = date.getHours() + date.getMinutes() / 60;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((h - a.h) / (b.h - a.h || 1), 0, 1);
  // 해는 동(-x)에서 떠서 서(+x)로 진다. 밤에는 달빛 방향으로 고정
  const sunAngle = THREE.MathUtils.clamp((h - 6) / 13, 0, 1) * Math.PI;
  const day = new THREE.Vector3(-Math.cos(sunAngle) * 10, 3 + Math.sin(sunAngle) * 9, 5);
  const moon = new THREE.Vector3(-6, 10, 6);
  const night = a.night + (b.night - a.night) * t;
  return {
    top: mix(a.top, b.top, t),
    bottom: mix(a.bottom, b.bottom, t),
    fog: mix(a.fog, b.fog, t),
    hemiSky: mix(a.hemiSky, b.hemiSky, t),
    hemiGround: mix(a.hemiGround, b.hemiGround, t),
    hemi: a.hemi + (b.hemi - a.hemi) * t,
    sun: mix(a.sun, b.sun, t),
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    night,
    sunDir: day.lerp(moon, THREE.MathUtils.smoothstep(night, 0.3, 0.9)),
  };
}

export function skyTexture(top: THREE.Color, bottom: THREE.Color, prev?: THREE.CanvasTexture) {
  const canvas = (prev?.image as HTMLCanvasElement | undefined) ?? document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${top.getHexString()}`);
  grad.addColorStop(0.62, `#${bottom.getHexString()}`);
  grad.addColorStop(1, `#${bottom.getHexString()}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  if (prev) {
    prev.needsUpdate = true;
    return prev;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
