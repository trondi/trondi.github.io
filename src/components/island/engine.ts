import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { Season } from "@/lib/season";

import { SPECIES_BY_ID, type Species, rollCatch, shadowScale } from "./fish";
import { type FishAssets, buildFishFromAsset, buildFishModel } from "./fish-model";
import { NavGrid, type Point } from "./pathfind";
import {
  HAIR_COLORS, PANTS_COLORS, SHIRT_COLORS,
  type Hat, type IslandSave, type ItemType, type Look, flowerStage, today,
} from "./save";
import { skyAt, skyTexture } from "./sky";
import {
  BRIDGES, DOCK, HIGH_WATER_Y, LOW, POND, RAMP, TIER, WATER_Y, type WaterKind,
  buildGround, buildUpperRiver, cliffZ, groundHeight, islandE, riverX, terrainWalkable, tierT, walkHeight, waterAt,
} from "./terrain";

/* ───────────────────────────── 타입 ───────────────────────────── */

export type InteractEvent =
  | { kind: "npc" }
  | { kind: "mail" }
  | { kind: "board" }
  | { kind: "house" }
  | { kind: "flower"; stage: number }
  | { kind: "tree"; dropped: ItemType[] };

export type CatchEvent = {
  species: Species;
  size: number;
  isNew: boolean;
  isRecord: boolean;
};

export type FishingPhase = "idle" | "wait" | "bite";
export type Mode = "walk" | "plant" | "fish";

export type IslandCallbacks = {
  onProgress: (ratio: number) => void;
  onInteract: (e: InteractEvent) => void;
  onToast: (text: string) => void;
  onSave: (save: IslandSave) => void;
  onModeChange: (mode: Mode) => void;
  onFishing: (phase: FishingPhase) => void;
  onCatch: (e: CatchEvent) => void;
};

export type IslandOptions = {
  season: Season;
  save: IslandSave;
  latestMail: string | null;
  reducedMotion: boolean;
};

export type IslandHandle = {
  setSeason: (s: Season) => void;
  /** 모습 바꾸기 — persist=false면 미리보기만 */
  setLook: (look: Look, persist?: boolean) => void;
  setCloseUp: (on: boolean) => void;
  startPlanting: () => void;
  setRod: (on: boolean) => void;
  cancelMode: () => void;
  endDialog: () => void;
  markMailRead: () => void;
  releaseFish: (id: string) => void;
  dispose: () => void;
};

/* ───────────────────────────── 배치 ───────────────────────────── */

type TreeKind = "common" | "pine" | "birch";
const FRUIT_TREES: [string, number, number, "apple" | "orange"][] = [
  ["apple-1", 1.8, -1.4, "apple"], ["apple-2", -7.8, -1.6, "apple"], ["orange-2", -2.8, 5.6, "orange"],
  // 강 건너 과수원
  ["apple-3", 10.2, -4.6, "apple"], ["apple-4", 13.2, -2.6, "apple"], ["orange-1", 10.6, 0.2, "orange"],
  ["orange-3", 13.6, 1.8, "orange"], ["apple-5", 11.6, 4.4, "apple"],
];
const HOUSE = { x: -4.4, z: -3.7, rot: Math.PI / 2 + 0.15, scale: 2.2 };
const MAILBOX = { x: -1.8, z: -1.5 };
const BOARD = { x: 0.7, z: -3.7 };
const WELL = { x: -7.4, z: 2.9 };
const NPC_HOME = { x: -1.6, z: 1.4, r: 2.6 };
const SPAWN = { x: 0.6, z: 3.2 };
const BENCH = { x: POND.x + 3.6, z: POND.z + 1.4 };
const LAMPS: Point[] = [
  { x: -0.6, z: 0.2 }, { x: 2.0, z: 1.7 }, { x: 8.4, z: 1.6 }, { x: -1.6, z: -7.2 },
  { x: DOCK.x + 1.4, z: 12.6 }, { x: POND.x + 2.4, z: POND.z - 2.6 }, { x: 8.6, z: 10.0 },
];
/** 나무를 심지 않는 빈터 */
const CLEARINGS: { x: number; z: number; r: number }[] = [
  { x: -2, z: 0, r: 6.8 }, { x: SPAWN.x, z: SPAWN.z, r: 2.5 }, { x: DOCK.x, z: 13, r: 2.6 },
  { x: RAMP.x, z: cliffZ(RAMP.x) - 2.6, r: 2.2 }, { x: RAMP.x, z: cliffZ(RAMP.x) + 2.6, r: 2.2 },
  { x: BENCH.x, z: BENCH.z, r: 1.8 }, { x: 12, z: 0, r: 4.6 },
  ...BRIDGES.flatMap((b) => [
    { x: riverX(b.z) - 2.6, z: b.z, r: 1.6 },
    { x: riverX(b.z) + 2.6, z: b.z, r: 1.6 },
  ]),
];
const SKINS = ["#f6d7bd", "#e2b08b", "#a8714a"];
const PETALS = [0xf2a7c3, 0xffffff, 0xf5d26b, 0xd66fa0];

const MODELS = [
  "Casual2_Female", "Casual2_Male", "ShibaInu", "House", "Well", "Fence",
  "CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_Autumn_1", "CommonTree_Autumn_2", "CommonTree_Autumn_3",
  "CommonTree_Snow_1", "CommonTree_Snow_2", "CommonTree_Snow_3", "PineTree_1", "PineTree_2", "PineTree_Autumn_1",
  "PineTree_Autumn_2", "PineTree_Snow_1", "PineTree_Snow_2", "BirchTree_1", "BirchTree_Autumn_1", "BirchTree_Snow_1",
  "Apple_4", "Apple_Harvested", "Apple_Crop", "Orange_4", "Orange_Harvested", "Orange_Crop",
  "Flower_1", "Flower_2", "Flower_3", "Flower_4", "Flowers", "Bush_1", "Bush_Snow_1", "BushBerries_1",
  "Rock_1", "Rock_2", "Rock_Moss_1", "Rock_Moss_2", "Rock_Snow_1", "Rock_Snow_2", "Grass", "Grass_Short",
  "Lilypad", "TreeStump_Moss", "WoodLog_Moss", "Mushroom_1", "Fish1", "Fish2", "Fish3", "Shark",
] as const;
type ModelName = (typeof MODELS)[number];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function treeModel(kind: TreeKind, variant: number, season: Season): ModelName {
  const v = kind === "common" ? variant : Math.min(variant, kind === "pine" ? 2 : 1);
  const s = season === "autumn" ? "_Autumn" : season === "winter" ? "_Snow" : "";
  if (kind === "common") return `CommonTree${s}_${v}` as ModelName;
  if (kind === "pine") return `PineTree${s}_${v}` as ModelName;
  return `BirchTree${s}_1` as ModelName;
}

/** 지형 기준으로 나무 자리 정하기 — 결정적이라 나무 id가 매번 같다 */
type TreeSpot = { id: string; x: number; z: number; kind: TreeKind; variant: number; scale: number };
const TREE_SPOTS: TreeSpot[] = (() => {
  const R = rng(20261030);
  const spots: TreeSpot[] = [];
  const reserved = FRUIT_TREES.map(([, x, z]) => ({ x, z }));
  const ok = (x: number, z: number) =>
    terrainWalkable(x, z) &&
    islandE(x, z) < 0.9 &&
    Math.abs(x - riverX(z)) > 2.2 &&
    Math.hypot(x - POND.x, z - POND.z) > POND.r + 1.6 &&
    Math.abs(cliffZ(x) - z) > 1.2 &&
    !CLEARINGS.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) &&
    !reserved.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < 2.6 * 2.6) &&
    !spots.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < 2.5 * 2.5);
  for (let i = 0; i < 4000 && spots.length < 84; i++) {
    const x = (R() - 0.5) * 46;
    const z = (R() - 0.5) * 38 - 1.5;
    if (!ok(x, z)) continue;
    const high = tierT(x, z) > 0.5;
    const r = R();
    const kind: TreeKind = high ? (r < 0.55 ? "pine" : r < 0.8 ? "birch" : "common") : r < 0.55 ? "common" : r < 0.8 ? "pine" : "birch";
    spots.push({ id: `tree-${spots.length}`, x, z, kind, variant: 1 + Math.floor(R() * 3), scale: 0.85 + R() * 0.25 });
  }
  return spots;
})();

/* ───────────────────────────── 엔진 ───────────────────────────── */

export async function createIsland(
  host: HTMLElement,
  opts: IslandOptions,
  cb: IslandCallbacks,
): Promise<IslandHandle> {
  const save = opts.save;
  let season = opts.season;
  const W = () => host.clientWidth;
  const H = () => host.clientHeight;
  const mobile = W() < 768;

  /* 렌더러 */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.setSize(W(), H());
  Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe6f7, 26, 52);
  const camera = new THREE.PerspectiveCamera(mobile ? 42 : 34, W() / H(), 0.1, 160);
  const farOffset = mobile ? new THREE.Vector3(0, 11.5, 12.5) : new THREE.Vector3(0, 10.4, 13.6);
  const nearOffset = mobile ? new THREE.Vector3(0, 3.4, 4.6) : new THREE.Vector3(0, 2.4, 4.6);
  const camOffset = farOffset.clone();
  let closeUp = false;
  const camTarget = new THREE.Vector3(SPAWN.x, 0, SPAWN.z - 1.5);
  const FOCUS = farOffset.length() + 1.5;

  /* 멀어질수록 땅이 둥글게 넘어가는 효과 — 모든 재질의 정점 셰이더에 덧붙인다 */
  const curve = (m: THREE.Material) => {
    if (m.userData.curved) return m;
    m.userData.curved = true;
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        float dzc = -mvPosition.z - ${FOCUS.toFixed(2)};
        if (dzc > 0.0) { mvPosition.y -= 0.02 * dzc * dzc; gl_Position = projectionMatrix * mvPosition; }`,
      );
    };
    m.customProgramCacheKey = () => "island-curve";
    return m;
  };
  const curveAll = (o: THREE.Object3D) => {
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(curve);
    });
    return o;
  };
  const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
    curve(new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra })) as THREE.MeshStandardMaterial;
  const matCache = new Map<string, THREE.Material>();
  const cachedStd = (color: string) => {
    if (!matCache.has(color)) matCache.set(color, std(color));
    return matCache.get(color)!;
  };

  /* 조명 */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6b8f5a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 0.5, far: 50 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  /* 모델 불러오기 */
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => cb.onProgress(loaded / total);
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltfs = new Map<ModelName, { scene: THREE.Group; animations: THREE.AnimationClip[] }>();
  await Promise.all(
    MODELS.map(async (name) => {
      const g = await loader.loadAsync(`/island/models/${name}.glb`);
      curveAll(g.scene);
      // 작은 장식은 그림자를 드리우지 않는다 (그림자 계산 절약)
      if (/^(Grass|Flowers|Lilypad|Mushroom|Flower_)/.test(name)) g.scene.traverse((c) => (c.castShadow = false));
      gltfs.set(name, { scene: g.scene, animations: g.animations });
    }),
  );
  // 집은 32×32 색상표 텍스처 — 번지지 않게 가장 가까운 픽셀로
  gltfs.get("House")!.scene.traverse((c) => {
    const map = ((c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined)?.map;
    if (map) {
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      map.generateMipmaps = false;
    }
  });

  const place = (name: ModelName, x: number, z: number, scale = 1, rot = 0, y?: number) => {
    const o = gltfs.get(name)!.scene.clone(true);
    o.position.set(x, y ?? groundHeight(x, z), z);
    o.scale.setScalar(scale);
    o.rotation.y = rot;
    return o;
  };

  /* 같은 모델을 다른 색으로 — 재질 이름으로 바꾼다 */
  const tinted = new Map<string, THREE.Material>();
  const recolor = (o: THREE.Object3D, from: string, color: THREE.ColorRepresentation) => {
    const hex = new THREE.Color(color).getHexString();
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => {
        const baseName = (m.userData.baseName as string | undefined) ?? m.name;
        if (baseName !== from) return m;
        const key = `${baseName}#${hex}`;
        if (!tinted.has(key)) {
          const nm = (m as THREE.MeshStandardMaterial).clone();
          nm.color.set(`#${hex}`);
          nm.userData = { baseName };
          tinted.set(key, curve(nm));
        }
        return tinted.get(key)!;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  };

  /* ── 충돌·길찾기 ── */
  type Collider = { x: number; z: number; r: number };
  const colliders: Collider[] = [];
  const blocked = (x: number, z: number) => colliders.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);
  const walkable = (x: number, z: number) => terrainWalkable(x, z) && !blocked(x, z);

  /* ── 상호작용 대상 ── */
  type Target = { obj: THREE.Object3D; pos: Point; reach: number; act: () => void };
  const targets: Target[] = [];
  const hitProxies: THREE.Mesh[] = [];
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const addTarget = (t: Target, radius: number, height: number) => {
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), proxyMat);
    proxy.position.set(t.pos.x, groundHeight(t.pos.x, t.pos.z) + height / 2, t.pos.z);
    proxy.userData.target = t;
    scene.add(proxy);
    hitProxies.push(proxy);
    targets.push(t);
    return proxy;
  };
  const removeTarget = (obj: THREE.Object3D) => {
    const i = targets.findIndex((t) => t.obj === obj);
    if (i < 0) return;
    targets.splice(i, 1);
    scene.remove(hitProxies.splice(i, 1)[0]);
  };

  /* ───────────── 고정 지형 ───────────── */
  const groundMat = std(0xffffff, { vertexColors: true });
  let ground = buildGround(season, groundMat);
  scene.add(ground);

  const waterMat = curve(new THREE.MeshStandardMaterial({ color: 0x6fd0de, transparent: true, opacity: 0.82, roughness: 0.2, metalness: 0.05 })) as THREE.MeshStandardMaterial;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 60, 60), waterMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, WATER_Y, 0);
  sea.receiveShadow = true;
  scene.add(sea);
  const upper = buildUpperRiver(waterMat);
  scene.add(upper.mesh);
  const pondWater = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 0.3, 28), waterMat);
  pondWater.rotation.x = -Math.PI / 2;
  pondWater.position.set(POND.x, HIGH_WATER_Y, POND.z);
  scene.add(pondWater);

  // 폭포 — 줄무늬 텍스처를 아래로 흘린다
  const fallCanvas = document.createElement("canvas");
  fallCanvas.width = 32;
  fallCanvas.height = 64;
  const fg = fallCanvas.getContext("2d")!;
  fg.fillStyle = "#d9f6ff";
  fg.fillRect(0, 0, 32, 64);
  fg.fillStyle = "#ffffff";
  for (let i = 0; i < 9; i++) fg.fillRect((i * 7) % 32, (i * 13) % 64, 2, 18);
  const fallTex = new THREE.CanvasTexture(fallCanvas);
  fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping;
  fallTex.repeat.set(2, 1);
  const fallMat = curve(new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.92 }));
  const addFall = (x: number, z: number, faceSouth: boolean, bottom: number) => {
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.4, HIGH_WATER_Y - bottom + 0.05, 1, 4), fallMat);
    fall.position.set(x, (HIGH_WATER_Y + bottom) / 2, z);
    if (!faceSouth) fall.rotation.y = Math.PI;
    scene.add(fall);
  };
  addFall(upper.fallX, upper.fallZ + 0.25, true, WATER_Y);
  addFall(riverX(upper.sourceZ), upper.sourceZ - 0.2, false, WATER_Y);
  const foam = new THREE.Mesh(new THREE.CircleGeometry(1.2, 14), curve(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(riverX(upper.fallZ + 0.9), WATER_Y + 0.02, upper.fallZ + 0.9);
  scene.add(foam);

  // 다리
  for (const b of BRIDGES) {
    const base = b.tier ? TIER : LOW;
    const bridge = new THREE.Group();
    for (let k = 0; k < 10; k++) {
      const u = k / 9;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, b.halfWidth * 2 + 0.3), cachedStd(k % 2 ? "#9b6b45" : "#a87650"));
      p.position.set(-b.halfLength + u * b.halfLength * 2, base - 0.03 + Math.sin(u * Math.PI) * 0.18, 0);
      bridge.add(p);
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k <= 4; k++) {
        const u = k / 4;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), cachedStd("#7a5236"));
        post.position.set(-b.halfLength + u * b.halfLength * 2, base + 0.25 + Math.sin(u * Math.PI) * 0.18, side * (b.halfWidth + 0.12));
        bridge.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(b.halfLength * 2, 0.07, 0.07), cachedStd("#7a5236"));
      rail.position.set(0, base + 0.57, side * (b.halfWidth + 0.12));
      bridge.add(rail);
    }
    bridge.position.set(riverX(b.z), 0, b.z);
    scene.add(curveAll(bridge));
  }

  // 선착장
  const dock = new THREE.Group();
  for (let z = DOCK.z0; z < DOCK.z1; z += 0.42) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(DOCK.halfWidth * 2, 0.08, 0.36), cachedStd(Math.round(z * 10) % 2 ? "#9b6b45" : "#a87650"));
    p.position.set(DOCK.x, DOCK.y, z + 0.18);
    dock.add(p);
  }
  for (let z = DOCK.z0 + 1; z <= DOCK.z1; z += 1.9) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 6), cachedStd("#6b4a32"));
      post.position.set(DOCK.x + side * (DOCK.halfWidth + 0.02), DOCK.y - 0.4, z);
      dock.add(post);
    }
  }
  scene.add(curveAll(dock));

  // 집
  const house = place("House", HOUSE.x, HOUSE.z, HOUSE.scale, HOUSE.rot);
  scene.add(house);
  colliders.push({ x: HOUSE.x, z: HOUSE.z, r: 1.9 }, { x: HOUSE.x - 0.4, z: HOUSE.z + 1.2, r: 1.2 });
  const houseGlow = glowSprite(0xffc56b, 3.2);
  houseGlow.position.set(HOUSE.x + 0.4, 1.3, HOUSE.z + 2.1);
  scene.add(houseGlow);
  addTarget({ obj: house, pos: { x: HOUSE.x, z: HOUSE.z }, reach: 2.6, act: () => cb.onInteract({ kind: "house" }) }, 2.0, 3.4);

  // 우편함 (직접 만든 모델)
  const mailbox = new THREE.Group();
  const mpost = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.7, 0.09), std("#7a5236"));
  mpost.position.y = 0.35;
  const mbox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.52), std("#d9534f"));
  mbox.position.y = 0.82;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.13), std("#f5d26b"));
  flag.position.set(0.22, 1.0, 0.1);
  mailbox.add(mpost, mbox, flag);
  mailbox.position.set(MAILBOX.x, groundHeight(MAILBOX.x, MAILBOX.z), MAILBOX.z);
  mailbox.rotation.y = 0.3;
  scene.add(curveAll(mailbox));
  colliders.push({ x: MAILBOX.x, z: MAILBOX.z, r: 0.35 });
  const mailBadge = document.createElement("div");
  mailBadge.textContent = "!";
  Object.assign(mailBadge.style, {
    width: "26px", height: "26px", borderRadius: "999px", background: "#d9534f", color: "#fff",
    font: "900 15px/26px system-ui, sans-serif", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,.25)",
  });
  const mailLabel = new CSS2DObject(mailBadge);
  mailLabel.position.set(MAILBOX.x, 1.55, MAILBOX.z);
  mailLabel.center.set(0.5, 1);
  scene.add(mailLabel);
  addTarget({ obj: mailbox, pos: MAILBOX, reach: 0.95, act: () => cb.onInteract({ kind: "mail" }) }, 0.5, 1.3);
  let latestMail = opts.latestMail;
  const syncMail = () => {
    const hasNew = !!latestMail && save.mailRead !== latestMail;
    mailLabel.visible = hasNew;
    flag.rotation.z = hasNew ? 0 : Math.PI / 2;
  };
  syncMail();

  // 게시판
  const board = new THREE.Group();
  for (const dx of [-0.55, 0.55]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), std("#7a5236"));
    leg.position.set(dx, 0.6, 0);
    board.add(leg);
  }
  const plank = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.75, 0.08), std("#b98b5e"));
  plank.position.y = 0.95;
  board.add(plank);
  for (const [px, py, col] of [[-0.3, 1.02, "#fff7e0"], [0.25, 0.9, "#f2c9d8"], [0.35, 1.13, "#d8ecff"]] as const) {
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.02), std(col));
    paper.position.set(px, py, 0.05);
    board.add(paper);
  }
  board.position.set(BOARD.x, groundHeight(BOARD.x, BOARD.z), BOARD.z);
  board.rotation.y = -0.15;
  scene.add(curveAll(board));
  colliders.push({ x: BOARD.x - 0.4, z: BOARD.z, r: 0.35 }, { x: BOARD.x + 0.4, z: BOARD.z, r: 0.35 });
  addTarget({ obj: board, pos: BOARD, reach: 1.1, act: () => cb.onInteract({ kind: "board" }) }, 0.8, 1.6);

  // 우물
  scene.add(place("Well", WELL.x, WELL.z, 0.75, 0.4));
  colliders.push({ x: WELL.x, z: WELL.z, r: 0.75 });

  // 연못가 벤치
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.42), cachedStd("#a87650"));
  seat.position.y = 0.42;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 0.06), cachedStd("#9b6b45"));
  back.position.set(0, 0.7, -0.2);
  bench.add(seat, back);
  for (const dx of [-0.55, 0.55]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.4), cachedStd("#5a3f2c"));
    leg.position.set(dx, 0.21, 0);
    bench.add(leg);
  }
  bench.position.set(BENCH.x, groundHeight(BENCH.x, BENCH.z), BENCH.z);
  bench.rotation.y = -Math.PI / 2 - 0.4;
  scene.add(curveAll(bench));
  colliders.push({ x: BENCH.x, z: BENCH.z, r: 0.6 });

  // 가로등 — 밤에 켜진다
  const lampMat = std("#fff1b8", { emissive: 0xffc56b, emissiveIntensity: 0 });
  const lampGlows: THREE.Sprite[] = [];
  for (const l of LAMPS) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), cachedStd("#4a3a46"));
    pole.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), lampMat);
    head.position.y = 1.6;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 4), cachedStd("#4a3a46"));
    cap.position.y = 1.83;
    cap.rotation.y = Math.PI / 4;
    g.add(pole, head, cap);
    g.position.set(l.x, groundHeight(l.x, l.z), l.z);
    scene.add(curveAll(g));
    const glow = glowSprite(0xffc56b, 2.6);
    glow.position.set(l.x, groundHeight(l.x, l.z) + 1.6, l.z);
    scene.add(glow);
    lampGlows.push(glow);
    colliders.push({ x: l.x, z: l.z, r: 0.18 });
  }

  const nav = new NavGrid(walkable);

  /* ───────────── 계절에 따라 바뀌는 것 ───────────── */
  type TreeState = { id: string; obj: THREE.Object3D; shake: number; fruit?: "apple" | "orange" };
  const trees: TreeState[] = [];
  const seasonal = new THREE.Group();
  scene.add(seasonal);
  const seasonColliders: Collider[] = [];

  const buildSeason = () => {
    for (const t of trees) removeTarget(t.obj);
    seasonal.clear();
    trees.length = 0;
    for (const c of seasonColliders) colliders.splice(colliders.indexOf(c), 1);
    seasonColliders.length = 0;
    const addCollider = (c: Collider) => {
      colliders.push(c);
      seasonColliders.push(c);
    };

    scene.remove(ground);
    ground.geometry.dispose();
    ground = buildGround(season, groundMat);
    scene.add(ground);

    const R = rng(7);
    const cherry = season === "spring";
    TREE_SPOTS.forEach(({ id, x, z, kind, variant, scale }, i) => {
      const obj = place(treeModel(kind, variant, season), x, z, scale, R() * Math.PI * 2);
      if (cherry && kind === "common" && i % 2 === 0) recolor(obj, "Green", 0xf4b8cc);
      seasonal.add(obj);
      addCollider({ x, z, r: 0.5 * scale });
      const t: TreeState = { id, obj, shake: 0 };
      trees.push(t);
      addTarget({ obj, pos: { x, z }, reach: 0.95, act: () => shakeTree(t) }, 0.9, 3);
    });
    FRUIT_TREES.forEach(([id, x, z, fruit]) => {
      const picked = save.harvested[id] === today();
      const name = (fruit === "apple" ? (picked ? "Apple_Harvested" : "Apple_4") : picked ? "Orange_Harvested" : "Orange_4") as ModelName;
      const obj = place(name, x, z, 1, (x * 7) % 6);
      seasonal.add(obj);
      addCollider({ x, z, r: 0.45 });
      const t: TreeState = { id, obj, shake: 0, fruit };
      trees.push(t);
      addTarget({ obj, pos: { x, z }, reach: 0.95, act: () => shakeTree(t) }, 0.9, 2.8);
    });

    // 섬 둘레 숲 — 장식 (걸어갈 수 없는 바깥쪽 가장자리)
    const D = rng(21);
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const rr = 0.965 + D() * 0.03;
      const tx = Math.cos(a) * 24 * rr;
      const tz = -1.5 + Math.sin(a) * 18.5 * rr;
      if (tz > 6 || Math.abs(tx - riverX(tz)) < 2 || Math.abs(cliffZ(tx) - tz) < 1.2) continue;
      if (islandE(tx, tz) > 0.985) continue;
      const kind: TreeKind = D() < 0.6 ? "pine" : "common";
      seasonal.add(place(treeModel(kind, 1 + Math.floor(D() * 2), season), tx, tz, 0.95 + D() * 0.2, D() * 6));
    }

    // 덤불·바위·풀·꽃
    const snow = season === "winter";
    const bush = snow ? "Bush_Snow_1" : season === "summer" ? "BushBerries_1" : "Bush_1";
    const B = rng(33);
    const freeSpot = (minTree: number, extra?: (x: number, z: number) => boolean) => {
      for (let k = 0; k < 60; k++) {
        const x = (B() - 0.5) * 46;
        const z = (B() - 0.5) * 38 - 1.5;
        if (!terrainWalkable(x, z) || islandE(x, z) > 0.92) continue;
        if (Math.abs(x - riverX(z)) < 1.8 || Math.abs(cliffZ(x) - z) < 0.9) continue;
        if (CLEARINGS.slice(0, 2).some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * 0.7) ** 2)) continue;
        if (colliders.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + minTree) ** 2)) continue;
        if (extra && !extra(x, z)) continue;
        return { x, z };
      }
      return null;
    };
    for (let i = 0; i < 16; i++) {
      const p = freeSpot(0.8);
      if (!p) continue;
      seasonal.add(place(bush, p.x, p.z, 0.62, p.x));
      addCollider({ x: p.x, z: p.z, r: 0.5 });
    }
    const rockNames: ModelName[] = snow ? ["Rock_Snow_1", "Rock_Snow_2"] : ["Rock_1", "Rock_2", "Rock_Moss_1", "Rock_Moss_2"];
    for (let i = 0; i < 14; i++) {
      // 절반은 바닷가에
      const p = freeSpot(0.6, i % 2 ? undefined : (x, z) => islandE(x, z) > 0.8 && z > 4);
      if (!p) continue;
      const s = 0.55 + B() * 0.4;
      seasonal.add(place(rockNames[i % rockNames.length], p.x, p.z, s, p.x * 2));
      addCollider({ x: p.x, z: p.z, r: 0.35 * s + 0.1 });
    }
    for (let i = 0; i < 4; i++) {
      const p = freeSpot(0.6);
      if (!p) continue;
      seasonal.add(place("TreeStump_Moss", p.x, p.z, 0.55, p.x));
      addCollider({ x: p.x, z: p.z, r: 0.38 });
    }
    for (let i = 0; i < 3; i++) {
      const p = freeSpot(0.8, i === 0 ? (x, z) => islandE(x, z) > 0.82 && z > 6 : undefined);
      if (!p) continue;
      seasonal.add(place("WoodLog_Moss", p.x, p.z, 0.65, p.x));
      addCollider({ x: p.x, z: p.z, r: 0.6 });
    }
    if (!snow) {
      const G = rng(5);
      for (let i = 0; i < 170; i++) {
        const x = (G() - 0.5) * 46;
        const z = (G() - 0.5) * 38 - 1.5;
        if (!terrainWalkable(x, z) || islandE(x, z) > 0.9 || Math.abs(cliffZ(x) - z) < 0.8) continue;
        seasonal.add(place(G() < 0.6 ? "Grass_Short" : "Grass", x, z, 0.5 + G() * 0.3, G() * 6));
      }
      for (const t of TREE_SPOTS.filter((_, i) => i % 7 === 0)) {
        seasonal.add(place("Mushroom_1", t.x + 0.6, t.z + 0.4, 1.6, t.x));
      }
      for (let i = 0; i < 26; i++) {
        // 남서쪽 꽃밭에 몰아서
        const p = i < 12 ? freeSpot(0.3, (x, z) => x < -6 && z > 3 && islandE(x, z) < 0.85) : freeSpot(0.3);
        if (!p) continue;
        const f = place("Flowers", p.x, p.z, 0.75, p.x);
        recolor(f, "Cyan", PETALS[i % PETALS.length]);
        seasonal.add(f);
      }
      for (const z of [-3.4, 4.6, 7.4, 13.2]) seasonal.add(place("Lilypad", riverX(z) + (z % 2 ? 0.45 : -0.45), z, 0.45, z, WATER_Y + 0.01));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        seasonal.add(place("Lilypad", POND.x + Math.cos(a) * 1.5, POND.z + Math.sin(a) * 1.4, 0.4, a, HIGH_WATER_Y + 0.01));
      }
    }
    // 바닷가 조개껍데기
    const SH = rng(77);
    for (let i = 0; i < 18; i++) {
      for (let k = 0; k < 30; k++) {
        const x = (SH() - 0.5) * 40;
        const z = 4 + SH() * 14;
        const e = islandE(x, z);
        if (e < 0.9 || e > 0.95 || !terrainWalkable(x, z)) continue;
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), cachedStd(SH() < 0.5 ? "#f6d0d4" : "#fff4e0"));
        shell.position.set(x, groundHeight(x, z), z);
        shell.scale.set(1, 0.5, 1.2);
        seasonal.add(shell);
        break;
      }
    }
    // 울타리
    for (const [x, z, r] of [[-7.3, -5.4, 0.2], [-1.6, -5.6, -0.1]] as const) {
      seasonal.add(place("Fence", x, z, 0.42, r));
    }

    nav.rebuild();
    rebuildParticles();
  };

  /* ───────────── 캐릭터 ───────────── */
  type Actor = {
    root: THREE.Object3D;
    mixer: THREE.AnimationMixer;
    actions: Map<string, THREE.AnimationAction>;
    current: string;
    path: Point[];
    speed: number;
    onArrive: (() => void) | null;
  };
  const makeActor = (name: ModelName, scale: number): Actor => {
    const src = gltfs.get(name)!;
    const root = cloneSkinned(src.scene);
    root.scale.setScalar(scale);
    curveAll(root);
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map(src.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    actions.get("Idle")?.play();
    scene.add(root);
    return { root, mixer, actions, current: "Idle", path: [], speed: 0, onArrive: null };
  };
  const play = (a: Actor, name: string, once = false) => {
    if (a.current === name && !once) return;
    const next = a.actions.get(name);
    if (!next) return;
    const prev = a.actions.get(a.current);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (prev && prev !== next) next.crossFadeFrom(prev, 0.2, false);
    a.current = name;
  };

  let player: Actor | null = null;
  let playerHead: THREE.Object3D | null = null;
  let playerHand: THREE.Object3D | null = null;
  let hat: THREE.Object3D | null = null;
  let currentBody: Look["body"] | null = null;

  const buildHat = (kind: Hat): THREE.Object3D | null => {
    if (kind === "none") return null;
    const g = new THREE.Group();
    if (kind === "straw") {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 18), cachedStd("#e8c77a"));
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.17, 14), cachedStd("#e8c77a"));
      crown.position.y = 0.09;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.212, 0.212, 0.04, 14), cachedStd("#d9534f"));
      band.position.y = 0.03;
      g.add(brim, crown, band);
    } else if (kind === "beanie") {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cachedStd("#d9534f"));
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 14), cachedStd("#f2f2f2"));
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), cachedStd("#f2f2f2"));
      pom.position.y = 0.26;
      g.add(dome, rim, pom);
    } else if (kind === "cap") {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cachedStd("#4f9fd0"));
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.22), cachedStd("#3a7fb0"));
      visor.position.set(0, 0.01, 0.26);
      g.add(dome, visor);
    } else {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), cachedStd("#f28bb3"));
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 4), cachedStd("#f28bb3"));
        wing.rotation.z = s * Math.PI / 2;
        wing.position.x = s * 0.12;
        g.add(wing);
      }
      g.add(knot);
      g.position.x = 0.12;
    }
    return curveAll(g);
  };

  const applyLook = (look: Look) => {
    if (!player || currentBody !== look.body) {
      const pos = player ? player.root.position.clone() : new THREE.Vector3(SPAWN.x, walkHeight(SPAWN.x, SPAWN.z), SPAWN.z);
      const rot = player?.root.rotation.y ?? 0;
      if (player) scene.remove(player.root);
      player = makeActor(look.body === "a" ? "Casual2_Female" : "Casual2_Male", 0.43);
      player.root.position.copy(pos);
      player.root.rotation.y = rot;
      playerHead = player.root.getObjectByName("Head") ?? null;
      playerHand = player.root.getObjectByName("Fist.R") ?? null;
      currentBody = look.body;
    }
    recolor(player.root, "Skin", SKINS[look.skin] ?? SKINS[0]);
    if (look.shirt !== undefined) recolor(player.root, "Shirt", SHIRT_COLORS[look.shirt]);
    if (look.pants !== undefined) recolor(player.root, "Pants", PANTS_COLORS[look.pants]);
    if (look.hair !== undefined) recolor(player.root, "Hair", HAIR_COLORS[look.hair]);
    if (hat) scene.remove(hat);
    hat = buildHat(look.hat ?? "none");
    if (hat) scene.add(hat);
  };
  if (save.look) applyLook(save.look);

  const npc = makeActor("ShibaInu", 0.24);
  npc.root.position.set(NPC_HOME.x, groundHeight(NPC_HOME.x, NPC_HOME.z), NPC_HOME.z);
  let npcTalking = false;
  let npcWait = 2;
  const npcProxy = addTarget({ obj: npc.root, pos: NPC_HOME, reach: 1.15, act: () => talkToNpc() }, 0.55, 1.0);

  /* ───────────── 땅에 떨어진 물건·심은 꽃 ───────────── */
  const itemObjs = new Map<string, THREE.Object3D>();
  const itemModel = (type: ItemType) => {
    if (type === "seed") {
      const g = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), std("#c99a5b"));
      bag.scale.y = 1.15;
      const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.07, 6), std("#7d5bb0"));
      tie.position.y = 0.15;
      g.add(bag, tie);
      return curveAll(g);
    }
    const o = gltfs.get(type === "apple" ? "Apple_Crop" : "Orange_Crop")!.scene.clone(true);
    o.scale.setScalar(1.5);
    return o;
  };
  const spawnItem = (id: string, type: ItemType, x: number, z: number) => {
    const o = itemModel(type);
    o.position.set(x, groundHeight(x, z) + 0.12, z);
    o.userData.item = { id, type };
    scene.add(o);
    itemObjs.set(id, o);
  };
  save.ground.forEach((g) => spawnItem(g.id, g.type, g.x, g.z));

  const flowerObjs = new Map<string, { obj: THREE.Object3D; stage: number }>();
  const flowerModelFor = (stage: number, color: number) => {
    const name = (["Flower_1", "Flower_2", "Flower_3", "Flower_4"] as const)[stage];
    const o = gltfs.get(name)!.scene.clone(true);
    o.scale.setScalar(0.65);
    if (stage >= 2) recolor(o, "Cyan", PETALS[color % PETALS.length]);
    return o;
  };
  const syncFlowers = () => {
    for (const f of save.flowers) {
      const stage = flowerStage(f.at);
      const cur = flowerObjs.get(f.id);
      if (cur && cur.stage === stage) continue;
      if (cur) {
        scene.remove(cur.obj);
        removeTarget(cur.obj);
      }
      const obj = flowerModelFor(stage, f.color);
      obj.position.set(f.x, groundHeight(f.x, f.z), f.z);
      obj.rotation.y = f.x * 3;
      scene.add(obj);
      flowerObjs.set(f.id, { obj, stage });
      addTarget({ obj, pos: { x: f.x, z: f.z }, reach: 0.7, act: () => cb.onInteract({ kind: "flower", stage: flowerStage(f.at) }) }, 0.3, 0.8);
    }
  };
  syncFlowers();

  const persist = () => cb.onSave(structuredClone(save));

  /* ───────────── 행동 ───────────── */
  const facePoint = (a: Actor, p: Point) => {
    a.root.rotation.y = Math.atan2(p.x - a.root.position.x, p.z - a.root.position.z);
  };

  /** 목표 근처까지 걸어간 뒤 실행 */
  const walkTo = (p: Point, onArrive: (() => void) | null = null) => {
    if (!player) return;
    const from = { x: player.root.position.x, z: player.root.position.z };
    const path = nav.find(from, p);
    if (!path) {
      cb.onToast("거기는 갈 수 없어요");
      return;
    }
    player.path = path;
    player.onArrive = onArrive;
    showMarker(path[path.length - 1]);
  };

  const approach = (t: Target) => {
    if (!player) return;
    const pp = player.root.position;
    const d = Math.hypot(pp.x - t.pos.x, pp.z - t.pos.z);
    const run = () => {
      if (!player) return;
      facePoint(player, t.pos);
      t.act();
    };
    if (d <= t.reach + 0.15) {
      player.path = [];
      run();
      return;
    }
    const dir = { x: (pp.x - t.pos.x) / d, z: (pp.z - t.pos.z) / d };
    let goal: Point = { x: t.pos.x + dir.x * t.reach, z: t.pos.z + dir.z * t.reach };
    if (!walkable(goal.x, goal.z)) goal = nav.nearestOpen(goal, 8) ?? goal;
    walkTo(goal, run);
  };

  const drop = (type: ItemType, x: number, z: number) => {
    const ang = Math.random() * Math.PI * 2;
    let px = x + Math.cos(ang) * 0.9;
    let pz = z + Math.sin(ang) * 0.9;
    if (!walkable(px, pz)) {
      const near = nav.nearestOpen({ x: px, z: pz }, 6);
      if (near) ({ x: px, z: pz } = near);
    }
    const id = `${type}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    save.ground.push({ id, type, x: px, z: pz });
    spawnItem(id, type, px, pz);
    const o = itemObjs.get(id)!;
    o.userData.fall = { t: 0, from: o.position.y + 1.6, to: o.position.y };
    o.position.y += 1.6;
  };

  const shakeTree = (t: TreeState) => {
    t.shake = 0.8;
    burstLeaves(t.obj.position);
    if (player) play(player, "PickUp", true);
    const day = today();
    const dropped: ItemType[] = [];
    if (t.fruit) {
      if (save.harvested[t.id] !== day) {
        save.harvested[t.id] = day;
        for (let k = 0; k < 3; k++) {
          drop(t.fruit, t.obj.position.x, t.obj.position.z);
          dropped.push(t.fruit);
        }
        const pos = t.obj.position.clone();
        const rot = t.obj.rotation.y;
        seasonal.remove(t.obj);
        const bare = place(t.fruit === "apple" ? "Apple_Harvested" : "Orange_Harvested", pos.x, pos.z, 1, rot);
        seasonal.add(bare);
        const target = targets.find((x) => x.obj === t.obj);
        if (target) target.obj = bare;
        t.obj = bare;
      }
    } else if (save.shaken[t.id] !== day) {
      save.shaken[t.id] = day;
      // 나무마다 하루 한 번, 절반 확률로 꽃씨가 떨어진다
      if (Math.random() < 0.5) {
        drop("seed", t.obj.position.x, t.obj.position.z);
        dropped.push("seed");
      }
    }
    cb.onInteract({ kind: "tree", dropped });
    persist();
  };

  const pickUp = (id: string) => {
    const g = save.ground.find((x) => x.id === id);
    const o = itemObjs.get(id);
    if (!g || !o) return;
    save.ground = save.ground.filter((x) => x.id !== id);
    save.bag[g.type] += 1;
    scene.remove(o);
    itemObjs.delete(id);
    if (player && mode !== "fish") play(player, "PickUp", true);
    cb.onToast(g.type === "apple" ? "🍎 사과를 주웠어요" : g.type === "orange" ? "🍊 오렌지를 주웠어요" : "🌱 꽃씨를 주웠어요");
    persist();
  };

  let mode: Mode = "walk";
  const setMode = (m: Mode) => {
    if (mode === "fish" && m !== "fish") reelIn();
    mode = m;
    rod.visible = m === "fish";
    cb.onModeChange(m);
  };

  const plantAt = (p: Point) => {
    if (save.bag.seed <= 0) {
      setMode("walk");
      return;
    }
    if (!walkable(p.x, p.z) || save.flowers.some((f) => (f.x - p.x) ** 2 + (f.z - p.z) ** 2 < 0.36)) {
      cb.onToast("여기에는 심을 수 없어요");
      return;
    }
    walkTo({ x: p.x + 0.45, z: p.z + 0.35 }, () => {
      if (!player) return;
      facePoint(player, p);
      play(player, "PickUp", true);
      save.bag.seed -= 1;
      save.flowers.push({ id: `f-${Date.now().toString(36)}`, x: p.x, z: p.z, color: Math.floor(Math.random() * PETALS.length), at: Date.now() });
      syncFlowers();
      cb.onToast("🌱 꽃씨를 심었어요 · 시간이 지나면 자라요");
      persist();
      setMode("walk");
    });
  };

  const talkToNpc = () => {
    if (!player) return;
    npcTalking = true;
    npc.path = [];
    facePoint(npc, { x: player.root.position.x, z: player.root.position.z });
    play(npc, "Idle");
    cb.onInteract({ kind: "npc" });
  };

  /* ───────────── 낚시 ───────────── */
  const rod = new THREE.Group();
  {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.24, 6), cachedStd("#3a2b2b"));
    handle.position.y = 0.12;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 1.25, 6), cachedStd("#c9a25a"));
    shaft.position.y = 0.24 + 0.625;
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), cachedStd("#7a8796"));
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0.04, 0.2, 0);
    rod.add(handle, shaft, reel);
    curveAll(rod);
  }
  rod.visible = false;
  scene.add(rod);
  const rodTip = new THREE.Object3D();
  rodTip.position.y = 1.49;
  rod.add(rodTip);

  const bobber = new THREE.Group();
  {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std("#d9534f", { flatShading: false }));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std("#ffffff", { flatShading: false }));
    bobber.add(top, bottom);
  }
  bobber.visible = false;
  scene.add(bobber);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, curve(new THREE.LineBasicMaterial({ color: 0xf5f5f5, transparent: true, opacity: 0.8 })));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  const ripples: { mesh: THREE.Mesh; t: number }[] = [];
  const ripple = (p: THREE.Vector3, size = 1) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 20), curve(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(p).setY(p.y + 0.01);
    m.userData.size = size;
    scene.add(m);
    ripples.push({ mesh: m, t: 0 });
  };
  const shadowMat = curve(new THREE.MeshBasicMaterial({ color: 0x10202a, transparent: true, opacity: 0, depthWrite: false }));
  const fishShadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), shadowMat);
  fishShadow.rotation.x = -Math.PI / 2;
  fishShadow.visible = false;
  scene.add(fishShadow);

  type FishState = {
    phase: "idle" | "cast" | "wait" | "approach" | "nibble" | "bite" | "catch" | "flee";
    t: number;
    water: { kind: WaterKind; y: number } | null;
    target: THREE.Vector3;
    from: THREE.Vector3;
    nibbles: number;
    next: number;
    roll: ReturnType<typeof rollCatch> | null;
    held: THREE.Object3D | null;
  };
  const fishing: FishState = {
    phase: "idle", t: 0, water: null, target: new THREE.Vector3(), from: new THREE.Vector3(), nibbles: 0, next: 0, roll: null, held: null,
  };
  let reportedPhase: FishingPhase = "idle";
  const report = (p: FishingPhase) => {
    if (p === reportedPhase) return;
    reportedPhase = p;
    cb.onFishing(p);
  };

  const reelIn = () => {
    fishing.phase = "idle";
    bobber.visible = false;
    line.visible = false;
    fishShadow.visible = false;
    if (fishing.held) {
      scene.remove(fishing.held);
      fishing.held = null;
    }
    report("idle");
  };

  const castTo = (b: THREE.Vector3, water: { kind: WaterKind; y: number }) => {
    if (!player) return;
    facePoint(player, { x: b.x, z: b.z });
    fishing.phase = "cast";
    fishing.t = 0;
    fishing.water = water;
    fishing.target.set(b.x, water.y, b.z);
    rodTip.getWorldPosition(fishing.from);
    fishing.roll = rollCatch(water.kind, season, new Date().getHours());
    bobber.visible = true;
    line.visible = true;
    report("wait");
  };

  /** 물을 탭하면 물가까지 걸어가서 찌를 던진다 */
  const fishAt = (p: Point) => {
    if (!player) return;
    const w = waterAt(p.x, p.z);
    if (!w) return false;
    // 탭한 물에서 캐릭터 쪽으로 걸어 나오며 처음 만나는 땅 = 설 자리
    const pp = player.root.position;
    const d = Math.hypot(pp.x - p.x, pp.z - p.z) || 1;
    const dir = { x: (pp.x - p.x) / d, z: (pp.z - p.z) / d };
    let stand: Point | null = null;
    for (let s = 0.3; s < 6; s += 0.2) {
      const q = { x: p.x + dir.x * s, z: p.z + dir.z * s };
      if (walkable(q.x, q.z)) {
        stand = q;
        break;
      }
    }
    stand ??= nav.nearestOpen(p, 12);
    if (!stand) return false;
    // 찌는 설 자리에서 1.4~3m 앞 물 위로
    const sd = Math.hypot(p.x - stand.x, p.z - stand.z) || 1;
    const reach = THREE.MathUtils.clamp(sd, 1.4, 3);
    let bx = stand.x + ((p.x - stand.x) / sd) * reach;
    let bz = stand.z + ((p.z - stand.z) / sd) * reach;
    let bw = waterAt(bx, bz);
    if (!bw) {
      bx = p.x;
      bz = p.z;
      bw = w;
    }
    const target = new THREE.Vector3(bx, bw.y, bz);
    const water = bw;
    const near = Math.hypot(pp.x - stand.x, pp.z - stand.z) < 0.35;
    if (near) castTo(target, water);
    else walkTo(stand, () => castTo(target, water));
    return true;
  };

  const catchFish = () => {
    if (!player || !fishing.roll) return;
    const { species, size } = fishing.roll;
    fishing.phase = "catch";
    fishing.t = 0;
    bobber.visible = false;
    line.visible = false;
    fishShadow.visible = false;
    player.root.rotation.y = 0;
    play(player, "Victory", true);
    const fishAssets: FishAssets = {
      Fish1: gltfs.get("Fish1")!.scene,
      Fish2: gltfs.get("Fish2")!.scene,
      Fish3: gltfs.get("Fish3")!.scene,
      Shark: gltfs.get("Shark")!.scene,
    };
    const model = buildFishFromAsset(species, fishAssets, recolor) ?? buildFishModel(species, cachedStd);
    const s = species.junk ? 0.7 : THREE.MathUtils.clamp(size / 40, 0.6, 2.4) * 0.85;
    model.scale.multiplyScalar(s);
    curveAll(model);
    scene.add(model);
    fishing.held = model;
    const prev = save.dex[species.id];
    const isNew = !prev;
    const isRecord = !!prev && !species.junk && size > prev.best;
    save.dex[species.id] = { count: (prev?.count ?? 0) + 1, best: Math.max(prev?.best ?? 0, size), first: prev?.first ?? Date.now() };
    save.fish[species.id] = (save.fish[species.id] ?? 0) + 1;
    persist();
    cb.onCatch({ species, size, isNew, isRecord });
    report("idle");
    navigator.vibrate?.(40);
  };

  const fishTap = () => {
    switch (fishing.phase) {
      case "bite":
        catchFish();
        return;
      case "nibble":
        cb.onToast("앗, 너무 빨랐어요… 물고기가 도망갔어요");
        fishing.phase = "flee";
        fishing.t = 0;
        return;
      case "cast":
      case "wait":
      case "approach":
        reelIn();
        return;
      default:
    }
  };

  const updateFishing = (dt: number, time: number) => {
    if (!player) return;
    // 낚싯대는 오른손에, 몸이 바라보는 방향으로 기울여 든다
    if (rod.visible && playerHand) {
      playerHand.getWorldPosition(rod.position);
      const yaw = player.root.rotation.y;
      let pitch = 0.55;
      if (fishing.phase === "cast") pitch = fishing.t < 0.25 ? -0.6 + fishing.t * 2 : 1.1;
      else if (fishing.phase !== "idle" && fishing.phase !== "catch") pitch = 1.05;
      if (fishing.phase === "bite") pitch = 1.25 + Math.sin(time * 40) * 0.05;
      rod.rotation.set(pitch, yaw, 0, "YXZ");
    }
    const tip = new THREE.Vector3();
    rodTip.getWorldPosition(tip);
    fishing.t += dt;
    const f = fishing;
    const surface = f.target.y;
    switch (f.phase) {
      case "cast": {
        const k = Math.min(1, Math.max(0, (f.t - 0.25) / 0.45));
        bobber.position.lerpVectors(f.from, f.target, k);
        bobber.position.y += Math.sin(k * Math.PI) * 1.2;
        if (f.t < 0.25) bobber.position.copy(tip);
        if (k >= 1) {
          ripple(f.target);
          f.phase = "wait";
          f.t = 0;
          f.next = 0.8 + Math.random() * 1.6;
        }
        break;
      }
      case "wait": {
        bobber.position.set(f.target.x, surface + Math.sin(time * 2) * 0.015, f.target.z);
        if (f.t > f.next && f.roll) {
          // 그림자를 찌 둘레 물 위에 띄운다
          let placed = false;
          for (let k = 0; k < 12 && !placed; k++) {
            const a = Math.random() * Math.PI * 2;
            const r = 1.6 + Math.random() * 1.2;
            const x = f.target.x + Math.cos(a) * r;
            const z = f.target.z + Math.sin(a) * r;
            const w = waterAt(x, z);
            if (w && w.kind === f.water?.kind) {
              fishShadow.position.set(x, surface + 0.005, z);
              placed = true;
            }
          }
          if (!placed) fishShadow.position.set(f.target.x + 0.6, surface + 0.005, f.target.z + 0.6);
          fishShadow.scale.set(shadowScale(f.roll.species) * 1.5, shadowScale(f.roll.species), 1);
          fishShadow.visible = true;
          shadowMat.opacity = 0;
          f.phase = "approach";
          f.t = 0;
          f.next = 1.8 + Math.random() * 2;
        }
        break;
      }
      case "approach": {
        bobber.position.set(f.target.x, surface + Math.sin(time * 2) * 0.015, f.target.z);
        shadowMat.opacity = Math.min(0.38, f.t * 0.4);
        const to = new THREE.Vector3(f.target.x, surface + 0.005, f.target.z);
        const d = fishShadow.position.distanceTo(to);
        const step = Math.max(0, (d - 0.35) * Math.min(1, dt * 1.2));
        fishShadow.position.lerp(to, d > 0.36 ? step / d : 0);
        fishShadow.rotation.z = Math.atan2(to.x - fishShadow.position.x, to.z - fishShadow.position.z) - Math.PI / 2;
        if (f.t > f.next) {
          f.phase = "nibble";
          f.t = 0;
          f.nibbles = 1 + Math.floor(Math.random() * 3);
          f.next = 0.7 + Math.random() * 0.7;
        }
        break;
      }
      case "nibble": {
        const dip = f.t < 0.15 ? -0.05 : 0;
        bobber.position.set(f.target.x, surface + dip, f.target.z);
        if (f.t < 0.02) ripple(f.target, 0.6);
        if (f.t > f.next) {
          f.nibbles -= 1;
          f.t = 0;
          f.next = 0.7 + Math.random() * 0.9;
          if (f.nibbles <= 0) {
            f.phase = "bite";
            ripple(f.target, 1.4);
            report("bite");
            navigator.vibrate?.([30, 30, 30]);
          }
        }
        break;
      }
      case "bite": {
        bobber.position.set(f.target.x, surface - 0.22, f.target.z);
        const windowS = f.roll?.species.id === "tuna" ? 0.7 : 0.95;
        if (f.t > windowS) {
          cb.onToast("놓쳤어요… 다음엔 더 빨리!");
          f.phase = "flee";
          f.t = 0;
          report("wait");
        }
        break;
      }
      case "flee": {
        shadowMat.opacity = Math.max(0, 0.38 - f.t * 0.8);
        const away = fishShadow.position.clone().sub(f.target).setY(0).normalize().multiplyScalar(dt * 3);
        fishShadow.position.add(away);
        bobber.position.set(f.target.x, surface, f.target.z);
        if (f.t > 0.6) reelIn();
        break;
      }
      case "catch": {
        if (fishing.held && playerHead) {
          playerHead.getWorldPosition(fishing.held.position);
          fishing.held.position.y += 0.75 + Math.min(f.t, 0.3);
          fishing.held.rotation.set(0, time * 1.5, Math.sin(time * 6) * 0.15);
        }
        if (f.t > 2.4) {
          if (fishing.held) scene.remove(fishing.held);
          fishing.held = null;
          f.phase = "idle";
        }
        break;
      }
      default:
    }
    if (line.visible) {
      const pts = lineGeo.attributes.position as THREE.BufferAttribute;
      pts.setXYZ(0, tip.x, tip.y, tip.z);
      pts.setXYZ(1, bobber.position.x, bobber.position.y + 0.06, bobber.position.z);
      pts.needsUpdate = true;
    }
  };

  /* ───────────── 입력 ───────────── */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number; t: number; id: number } | null = null;
  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved < 12 && quick) tap(e.clientX, e.clientY);
  };
  const tap = (cx: number, cy: number) => {
    if (!player || closeUp) return;
    // 찌를 던진 뒤에는 어디를 탭해도 낚싯대를 챈다
    if (mode === "fish" && fishing.phase !== "idle" && fishing.phase !== "catch") {
      fishTap();
      return;
    }
    if (fishing.phase === "catch") return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    if (mode !== "plant") {
      const items = [...itemObjs.values()];
      const hitItem = raycaster.intersectObjects(items, true)[0];
      if (hitItem) {
        let o: THREE.Object3D | null = hitItem.object;
        while (o && !o.userData.item) o = o.parent;
        if (o) {
          const { id } = o.userData.item as { id: string };
          walkTo({ x: o.position.x, z: o.position.z }, () => pickUp(id));
          return;
        }
      }
      npcProxy.position.set(npc.root.position.x, npc.root.position.y + 0.5, npc.root.position.z);
      const hit = raycaster.intersectObjects(hitProxies, false)[0];
      if (hit) {
        const t = hit.object.userData.target as Target;
        if (t.obj === npc.root) t.pos = { x: npc.root.position.x, z: npc.root.position.z };
        approach(t);
        return;
      }
    }
    // 물(수면)을 먼저, 그다음 땅
    const waters = [sea, upper.mesh, pondWater];
    const wHit = raycaster.intersectObjects(waters, false)[0];
    const g = raycaster.intersectObject(ground, false)[0];
    const point = wHit && (!g || wHit.distance <= g.distance + 0.05) ? wHit.point : g?.point;
    if (!point) return;
    if (mode === "plant") plantAt({ x: point.x, z: point.z });
    else if (mode === "fish" && waterAt(point.x, point.z)) fishAt({ x: point.x, z: point.z });
    else walkTo({ x: point.x, z: point.z });
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
    if (k === " " && mode === "fish") {
      e.preventDefault();
      fishTap();
      return;
    }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      keys.add(k);
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  /* ───────────── 이동 마커 ───────────── */
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 24), curve(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false })));
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  let markerT = 0;
  const showMarker = (p: Point) => {
    marker.position.set(p.x, walkHeight(p.x, p.z) + 0.03, p.z);
    marker.visible = true;
    markerT = 0;
  };

  /* ───────────── 하늘·빛 ───────────── */
  let skyTex: THREE.CanvasTexture | undefined;
  let night = 0;
  const stars = (() => {
    const S = rng(9);
    const pts: number[] = [];
    for (let i = 0; i < 700; i++) pts.push((S() - 0.5) * 200, 10 + S() * 50, -60 - S() * 30);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.3, map: dotTexture(), transparent: true, depthWrite: false, color: 0xf3eeff, opacity: 0 }));
    scene.add(p);
    return p;
  })();
  const applySky = () => {
    const s = skyAt(new Date());
    skyTex = skyTexture(s.top, s.bottom, skyTex);
    scene.background = skyTex;
    (scene.fog as THREE.Fog).color.copy(s.fog);
    hemi.color.copy(s.hemiSky);
    hemi.groundColor.copy(s.hemiGround);
    hemi.intensity = s.hemi;
    sun.color.copy(s.sun);
    sun.intensity = s.sunI;
    sun.userData.dir = s.sunDir;
    night = s.night;
    (stars.material as THREE.PointsMaterial).opacity = night;
    lampMat.emissiveIntensity = night * 1.6;
    for (const g of lampGlows) (g.material as THREE.SpriteMaterial).opacity = night * 0.55;
    (houseGlow.material as THREE.SpriteMaterial).opacity = night * 0.6;
    waterMat.color.set(night > 0.5 ? 0x3d6f9e : 0x6fd0de);
  };
  applySky();
  const skyTimer = window.setInterval(() => {
    applySky();
    syncFlowers();
  }, 30_000);

  /* ───────────── 계절 입자 (꽃잎·낙엽·눈·반딧불) ───────────── */
  let particles: THREE.Points | null = null;
  let velocity: Float32Array | null = null;
  let fireflies: THREE.Points | null = null;
  function rebuildParticles() {
    if (particles) scene.remove(particles);
    if (fireflies) scene.remove(fireflies);
    particles = null;
    fireflies = null;
    if (opts.reducedMotion) return;
    const conf = {
      spring: { n: 90, color: 0xf6b9cc, size: 0.14 },
      summer: { n: 0, color: 0xffffff, size: 0.1 },
      autumn: { n: 80, color: 0xe8964a, size: 0.16 },
      winter: { n: 180, color: 0xffffff, size: 0.12 },
    }[season];
    if (conf.n) {
      const pos = new Float32Array(conf.n * 3);
      velocity = new Float32Array(conf.n * 3);
      for (let i = 0; i < conf.n; i++) {
        pos.set([(Math.random() - 0.5) * 22, Math.random() * 9, (Math.random() - 0.5) * 18], i * 3);
        velocity.set([(Math.random() - 0.3) * 0.5, -(0.35 + Math.random() * 0.5), (Math.random() - 0.5) * 0.3], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      particles = new THREE.Points(geo, new THREE.PointsMaterial({ size: conf.size, color: conf.color, map: dotTexture(), transparent: true, depthWrite: false }));
      scene.add(particles);
    }
    if (season === "summer" || season === "autumn") {
      const n = season === "summer" ? 60 : 24;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const nearPond = i % 3 === 0;
        const z = nearPond ? POND.z + (Math.random() - 0.5) * 6 : -6 + Math.random() * 20;
        const x = nearPond ? POND.x + (Math.random() - 0.5) * 7 : riverX(z) + (Math.random() - 0.5) * 5;
        pos.set([x, groundHeight(x, z) + 0.5 + Math.random() * 1.4, z], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      fireflies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, color: 0xd8ff8a, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      scene.add(fireflies);
    }
  }

  const bursts: { pts: THREE.Points; vel: Float32Array; t: number }[] = [];
  const burstLeaves = (at: THREE.Vector3) => {
    const n = 18;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([at.x + (Math.random() - 0.5) * 1.2, at.y + 1.6 + Math.random() * 1.2, at.z + (Math.random() - 0.5) * 1.2], i * 3);
      vel.set([(Math.random() - 0.5) * 1.5, Math.random() * 0.8, (Math.random() - 0.5) * 1.5], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const color = { spring: 0xf6b9cc, summer: 0x6faa4f, autumn: 0xe8964a, winter: 0xffffff }[season];
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, color, map: dotTexture(), transparent: true, depthWrite: false }));
    scene.add(pts);
    bursts.push({ pts, vel, t: 0 });
  };

  buildSeason();

  /* ───────────── 루프 ───────────── */
  const timer = new THREE.Timer();
  let raf = 0;
  let running = true;
  const tmp = new THREE.Vector3();
  const moveActor = (a: Actor, dt: number, speed: number) => {
    if (!a.path.length) return false;
    const p = a.root.position;
    const next = a.path[0];
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step) {
      p.x = next.x;
      p.z = next.z;
      a.path.shift();
    } else {
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
    }
    const targetRot = Math.atan2(dx, dz);
    let diff = targetRot - a.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.root.rotation.y += diff * Math.min(1, dt * 12);
    p.y = walkHeight(p.x, p.z);
    return true;
  };

  const tick = () => {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const time = timer.getElapsed();

    if (player) {
      // 키보드 이동
      let kx = 0;
      let kz = 0;
      if (!closeUp && fishing.phase !== "catch") {
        if (keys.has("w") || keys.has("arrowup")) kz -= 1;
        if (keys.has("s") || keys.has("arrowdown")) kz += 1;
        if (keys.has("a") || keys.has("arrowleft")) kx -= 1;
        if (keys.has("d") || keys.has("arrowright")) kx += 1;
      }
      let moving = false;
      if (kx || kz) {
        if (fishing.phase !== "idle") reelIn();
        player.path = [];
        player.onArrive = null;
        const len = Math.hypot(kx, kz);
        const step = 3.2 * dt;
        const p = player.root.position;
        const nx = p.x + (kx / len) * step;
        const nz = p.z + (kz / len) * step;
        if (walkable(nx, nz)) {
          p.x = nx;
          p.z = nz;
        } else if (walkable(nx, p.z)) p.x = nx;
        else if (walkable(p.x, nz)) p.z = nz;
        p.y = walkHeight(p.x, p.z);
        player.root.rotation.y = Math.atan2(kx, kz);
        moving = true;
      } else if (player.path.length) {
        const pr = player.root.position;
        const remain = player.path.reduce(
          (acc, q, i, arr) => acc + Math.hypot(q.x - (i ? arr[i - 1].x : pr.x), q.z - (i ? arr[i - 1].z : pr.z)),
          0,
        );
        player.speed = remain > 5 ? 4.0 : 2.5;
        moving = moveActor(player, dt, player.speed);
        if (!player.path.length) {
          marker.visible = false;
          const cbArrive = player.onArrive;
          player.onArrive = null;
          cbArrive?.();
        }
      }
      const oneShot = (player.current === "PickUp" || player.current === "Victory") && (player.actions.get(player.current)?.isRunning() ?? false);
      if (moving) play(player, !(kx || kz) && player.speed > 3 ? "Run" : "Walk");
      if (!moving && !oneShot && player.current !== "Idle") play(player, "Idle");

      // 지나가며 줍기
      for (const [id, o] of itemObjs) {
        if (o.userData.fall) continue;
        if ((o.position.x - player.root.position.x) ** 2 + (o.position.z - player.root.position.z) ** 2 < 0.2) pickUp(id);
      }
      player.mixer.update(dt);

      // 모자는 머리 뼈를 따라간다
      if (hat && playerHead) {
        playerHead.getWorldPosition(hat.position);
        hat.position.y += 0.3;
        hat.rotation.y = player.root.rotation.y;
      }
      updateFishing(dt, time);

      // 카메라
      const pr = player.root.position;
      const tx = closeUp ? pr.x : THREE.MathUtils.clamp(pr.x, -17, 17);
      const tz = closeUp ? pr.z : THREE.MathUtils.clamp(pr.z - 1.5, -17, 15);
      // 옷장에서는 아래쪽 패널에 가리지 않게 캐릭터를 화면 위쪽에 둔다
      // (데스크톱은 오른쪽 패널을 피해 캐릭터를 왼쪽에)
      tmp.set(closeUp && !mobile ? tx + 1.0 : tx, closeUp ? pr.y - (mobile ? 0.7 : 0.1) : 0, closeUp ? tz + (mobile ? 0.9 : 0.2) : tz);
      if (opts.reducedMotion) camTarget.copy(tmp);
      else camTarget.lerp(tmp, Math.min(1, dt * 3));
      const goalOffset = closeUp ? nearOffset : farOffset;
      if (opts.reducedMotion) camOffset.copy(goalOffset);
      else camOffset.lerp(goalOffset, Math.min(1, dt * 4));
    }
    camera.position.copy(camTarget).add(camOffset);
    camera.lookAt(camTarget);
    // 가까이 볼 때 카메라와 캐릭터 사이 나무는 잠시 숨긴다
    if (player) {
      const px = player.root.position.x;
      const pz = player.root.position.z;
      for (const t of trees) {
        let hide = false;
        if (closeUp) {
          const ox = t.obj.position.x - px;
          const oz = t.obj.position.z - pz;
          const cx = camera.position.x - px;
          const cz = camera.position.z - pz;
          const len = Math.hypot(cx, cz) || 1;
          const along = (ox * cx + oz * cz) / len;
          const side = Math.abs(ox * cz - oz * cx) / len;
          hide = along > -0.3 && along < len + 1 && side < 1.6;
        }
        t.obj.visible = !hide;
      }
    }
    const dir = (sun.userData.dir as THREE.Vector3) ?? new THREE.Vector3(-6, 10, 5);
    sun.position.copy(camTarget).setY(0).add(dir);
    sun.target.position.copy(camTarget).setY(0);

    // 주민
    if (!npcTalking) {
      if (npc.path.length) {
        moveActor(npc, dt, 0.9);
        play(npc, "Walk");
      } else {
        npcWait -= dt;
        if (npcWait <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * NPC_HOME.r;
          const goal = { x: NPC_HOME.x + Math.cos(a) * r, z: NPC_HOME.z + Math.sin(a) * r };
          npc.path = nav.find({ x: npc.root.position.x, z: npc.root.position.z }, goal) ?? [];
          npcWait = 3 + Math.random() * 5;
          if (!npc.path.length) play(npc, Math.random() < 0.4 ? "Eating" : "Idle_2");
        } else if (npc.current === "Walk") {
          play(npc, Math.random() < 0.3 ? "Eating" : "Idle");
        }
      }
    }
    npc.mixer.update(dt);

    // 나무 흔들림
    for (const t of trees) {
      if (t.shake <= 0) continue;
      t.shake = Math.max(0, t.shake - dt);
      t.obj.rotation.z = Math.sin(t.shake * 40) * 0.05 * (t.shake / 0.8);
    }
    // 떨어지는 물건
    for (const o of itemObjs.values()) {
      const f = o.userData.fall as { t: number; from: number; to: number } | undefined;
      if (f) {
        f.t += dt * 2.2;
        const k = Math.min(1, f.t);
        o.position.y = f.from + (f.to - f.from) * (k * k);
        if (k >= 1) delete o.userData.fall;
      } else {
        o.rotation.y += dt * 0.8;
      }
    }
    // 물결
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.t += dt;
      const s = (1 + r.t * 5) * (r.mesh.userData.size as number);
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - r.t * 1.2);
      if (r.t > 0.7) {
        scene.remove(r.mesh);
        ripples.splice(i, 1);
      }
    }
    // 입자
    if (particles && velocity) {
      const pos = particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i) + velocity[i * 3] * dt + Math.sin(time + i) * 0.003;
        let y = pos.getY(i) + velocity[i * 3 + 1] * dt;
        let z = pos.getZ(i) + velocity[i * 3 + 2] * dt;
        if (y < 0) {
          y = 8 + Math.random() * 2;
          x = camTarget.x + (Math.random() - 0.5) * 22;
          z = camTarget.z + (Math.random() - 0.5) * 18;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }
    if (fireflies) {
      const m = fireflies.material as THREE.PointsMaterial;
      m.opacity = night * (0.6 + Math.sin(time * 3) * 0.3);
      fireflies.position.y = Math.sin(time * 0.7) * 0.15;
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      const pos = b.pts.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        b.vel[k * 3 + 1] -= dt * 1.2;
        pos.setXYZ(k, pos.getX(k) + b.vel[k * 3] * dt, Math.max(0.15, pos.getY(k) + b.vel[k * 3 + 1] * dt), pos.getZ(k) + b.vel[k * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.t / 2.2);
      if (b.t > 2.2) {
        scene.remove(b.pts);
        bursts.splice(i, 1);
      }
    }
    fallTex.offset.y -= dt * 1.4;
    if (marker.visible) {
      markerT += dt;
      marker.scale.setScalar(1 + Math.sin(markerT * 6) * 0.08);
    }

    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  tick();

  const onResize = () => {
    renderer.setSize(W(), H());
    labels.setSize(W(), H());
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(host);
  const onVisibility = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      timer.reset();
      tick();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  // 개발 모드 전용 — 브라우저 자동 테스트에서 월드 좌표를 화면 좌표로 바꿔 탭하기 위해
  if (process.env.NODE_ENV === "development") {
    (window as unknown as { __island?: unknown }).__island = {
      player: () => player && { x: player.root.position.x, z: player.root.position.z, anim: player.current },
      npc: () => ({ x: npc.root.position.x, z: npc.root.position.z }),
      fishing: () => fishing.phase,
      showCatch: (id: string, size: number) => {
        const species = SPECIES_BY_ID.get(id);
        if (!species) return;
        fishing.roll = { species, size };
        catchFish();
      },
      teleport: (x: number, z: number) => {
        if (!player) return;
        player.path = [];
        player.root.position.set(x, walkHeight(x, z), z);
        camTarget.set(x, 0, z - 1.5);
      },
      screenOf: (x: number, z: number, y = 0.5) => {
        const v = new THREE.Vector3(x, groundHeight(x, z) + y, z).project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      },
      screenOfAbs: (x: number, y: number, z: number) => {
        const v = new THREE.Vector3(x, y, z).project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      },
      season: (s: Season) => {
        season = s;
        buildSeason();
      },
    };
  }

  return {
    setSeason: (s) => {
      if (s === season) return;
      season = s;
      buildSeason();
    },
    setLook: (look, persistIt = true) => {
      applyLook(look);
      if (persistIt) {
        save.look = look;
        persist();
      }
    },
    setCloseUp: (on) => {
      closeUp = on;
      if (on && player) {
        player.path = [];
        player.root.rotation.y = 0;
        reelIn();
      }
    },
    startPlanting: () => setMode("plant"),
    setRod: (on) => setMode(on ? "fish" : "walk"),
    cancelMode: () => setMode("walk"),
    endDialog: () => {
      npcTalking = false;
      npcWait = 1.5;
    },
    markMailRead: () => {
      save.mailRead = latestMail;
      syncMail();
      persist();
    },
    releaseFish: (id) => {
      if (!save.fish[id]) return;
      save.fish[id] -= 1;
      if (save.fish[id] <= 0) delete save.fish[id];
      persist();
      cb.onToast(`${SPECIES_BY_ID.get(id)?.emoji ?? "🐟"} 물로 돌려보냈어요`);
    },
    dispose: () => {
      running = false;
      cancelAnimationFrame(raf);
      window.clearInterval(skyTimer);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
      });
      renderer.dispose();
      latestMail = null;
      // 같은 host에 새 인스턴스가 붙어 있을 수 있으니 자기 요소만 뗀다
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}

/* ───────────────────────────── 보조 ───────────────────────────── */

let dot: THREE.Texture | null = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dot = new THREE.CanvasTexture(c);
  return dot;
}

function glowSprite(color: number, scale: number) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(scale);
  return sp;
}
