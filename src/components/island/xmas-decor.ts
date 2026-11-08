import * as THREE from "three";

type Mat = (color: string) => THREE.Material;

/**
 * 눈사람 — 크리스마스 시즌에 마을과 꽃밭 마을에 세운다. 발밑에 눈 쌓인 자리, 눈덩이 셋, 숯 눈·단추,
 * 당근 코, 빨간 목도리, 검은 모자, 나뭇가지 팔. 밑면이 원점이고 앞(+z)을 본다. 키 약 1.1m
 */
export function buildSnowman(mat: Mat) {
  const g = new THREE.Group();
  const snow = mat("#f6f8fb");
  const coal = mat("#2a2a30");
  const ball = (r: number, y: number) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), snow);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18), snow);
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = 0.02;
  patch.receiveShadow = true;
  g.add(patch, ball(0.3, 0.27), ball(0.22, 0.66), ball(0.16, 0.97));
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), coal);
    eye.position.set(s * 0.055, 1.01, 0.14);
    g.add(eye);
  }
  for (const y of [0.58, 0.68, 0.78]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), coal);
    b.position.set(0, y, 0.215 - Math.abs(y - 0.66) * 0.35);
    g.add(b);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.15, 6), mat("#f08a2c"));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.96, 0.22);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 14), mat("#d33a35"));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.83;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.03), mat("#d33a35"));
  tail.position.set(0.1, 0.72, 0.13);
  tail.rotation.z = 0.25;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 14), coal);
  brim.position.y = 1.1;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.17, 14), coal);
  top.position.y = 1.19;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.113, 0.113, 0.035, 14), mat("#d33a35"));
  band.position.y = 1.13;
  g.add(nose, scarf, tail, brim, top, band);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.42, 5), mat("#6b4a32"));
    arm.position.set(s * 0.33, 0.78, 0);
    arm.rotation.z = s * -1.0;
    g.add(arm);
  }
  return g;
}
