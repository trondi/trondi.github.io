import * as THREE from "three";

import type { Species } from "./fish";

/** 코드로 만든 낮은 폴리곤 물고기 — 머리 위로 들어 올릴 때 쓴다 (길이 약 1) */
export function buildFishModel(s: Species, material: (color: string) => THREE.Material) {
  const g = new THREE.Group();
  const body = material(s.color);
  const belly = material(s.belly);
  const eyeW = material("#ffffff");
  const eyeB = material("#1f1a1a");
  if (s.shape === "can") {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10), body);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.3, 10), belly);
    g.add(can, label);
    g.rotation.z = 0.4;
    return g;
  }
  if (s.shape === "boot") {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.32), body);
    leg.position.y = 0.15;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.34), belly);
    foot.position.set(0.12, -0.2, 0);
    g.add(leg, foot);
    return g;
  }
  if (s.shape === "squid") {
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 8), body);
    mantle.position.y = 0.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), belly);
    head.position.y = -0.15;
    g.add(mantle, head);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.015, 0.4, 4), body);
      leg.position.set(Math.cos(a) * 0.1, -0.45, Math.sin(a) * 0.1);
      g.add(leg);
    }
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeB);
      eye.position.set(sx * 0.15, -0.12, 0.1);
      g.add(eye);
    }
    return g;
  }
  const dims = {
    slim: [0.5, 0.16, 0.13],
    round: [0.4, 0.28, 0.16],
    long: [0.62, 0.17, 0.15],
    flat: [0.42, 0.08, 0.3],
  }[s.shape];
  const bodyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), body);
  bodyMesh.scale.set(dims[0], dims[1], dims[2]);
  const bellyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), belly);
  bellyMesh.scale.set(dims[0] * 0.85, dims[1] * 0.6, dims[2] * 0.9);
  bellyMesh.position.y = -dims[1] * 0.35;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(dims[1] * 0.9, 0.28, 4), body);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -dims[0] - 0.08;
  tail.scale.z = 0.35;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 3), body);
  fin.position.set(-0.05, dims[1] * 0.95, 0);
  fin.scale.z = 0.3;
  g.add(bodyMesh, bellyMesh, tail, fin);
  for (const sz of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeW);
    eye.position.set(dims[0] * 0.62, dims[1] * 0.25, sz * dims[2] * 0.75);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeB);
    pupil.position.set(dims[0] * 0.66, dims[1] * 0.25, sz * dims[2] * 0.95);
    g.add(eye, pupil);
  }
  if (s.id === "mackerel") {
    for (let k = 0; k < 4; k++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, dims[2] * 2.05), material("#1f3a52"));
      stripe.position.set(-0.25 + k * 0.14, dims[1] * 0.45, 0);
      g.add(stripe);
    }
  }
  if (s.id === "koi") {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), material("#ffffff"));
    spot.scale.set(1.4, 0.6, 1.35);
    spot.position.set(0.05, dims[1] * 0.55, 0);
    g.add(spot);
  }
  return g;
}

/** Quaternius 물고기 모델을 종류에 맞게 고르고 색을 입힌다 — 없는 모양은 null (코드 모델 사용) */
export type FishAssets = Record<"Fish1" | "Fish2" | "Fish3" | "Shark", THREE.Object3D>;

export function buildFishFromAsset(
  s: Species,
  assets: FishAssets,
  recolor: (o: THREE.Object3D, from: string, color: string) => void,
) {
  if (s.shape === "squid" || s.shape === "can" || s.shape === "boot") return null;
  const pick: keyof FishAssets =
    s.id === "tuna" ? "Shark" : s.id === "koi" || s.id === "seabream" ? "Fish3" : s.shape === "round" ? "Fish2" : "Fish1";
  const model = assets[pick].clone(true);
  const fin = new THREE.Color(s.color).multiplyScalar(0.75).getStyle();
  for (const name of ["Top", "Body"]) recolor(model, name, s.color);
  for (const name of ["Bottom", "Front", "Stripes"]) recolor(model, name, s.belly);
  recolor(model, "Fins", fin);

  // 가장 긴 축을 x로 눕히고 길이 1로 맞춘다 (코드 모델과 같은 기준)
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const wrap = new THREE.Group();
  wrap.add(model);
  if (size.z > size.x) wrap.rotation.y = Math.PI / 2;
  const len = Math.max(size.x, size.z) || 1;
  const outer = new THREE.Group();
  outer.add(wrap);
  outer.scale.setScalar(1.1 / len);
  if (s.shape === "long") outer.scale.x *= 1.25;
  if (s.shape === "flat") {
    outer.scale.y *= 0.45;
    outer.scale.z *= 1.6;
  }
  return outer;
}
