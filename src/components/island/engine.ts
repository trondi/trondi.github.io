import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { Season } from "@/lib/season";

import { CHATTER as CHATTER_LIST, type Chatter, pickChatter } from "./chatter";
import { FISH_MODELS, SPECIES_BY_ID, type Species, rollCatch, shadowScale } from "./fish";
import { type Chibi, type ChibiAnim, buildChibi } from "./chibi";
import { buildFishFromAsset, buildFishModel } from "./fish-model";
import { buildHouseXmas } from "./house-xmas";
import { NavGrid, type Point } from "./pathfind";
import { type TreeKind, type TreeOpts, buildTree } from "./tree-model";
import type { WeatherKind } from "./weather";
import {
  HAIR_COLORS, PANTS_COLORS, SHIRT_COLORS,
  type Glasses, type Hat, type IslandSave, type ItemType, type Look, flowerStage, today,
} from "./save";
import { skyAt, skyTexture } from "./sky";
import {
  BRIDGES, DOCK, HIGH_WATER_Y, ISLAND, LOW, POND, RAMP, TIER, WATER_Y, type WaterKind,
  buildGround, buildUpperRiver, cliffZ, firstIslandE, groundHeight, islandE, riverX, terrainWalkable, tierT, walkHeight, waterAt,
} from "./terrain";

/* ───────────────────────────── 타입 ───────────────────────────── */

export type InteractEvent =
  | { kind: "npc"; id: string }
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
  /** 실제 날씨 (null이면 계절 효과만) */
  setWeather: (kind: WeatherKind | null) => void;
  /** 대화창 같은 창이 열려 있는 동안 캐릭터를 움직이지 못하게 */
  setInputLocked: (on: boolean) => void;
  startPlanting: () => void;
  setRod: (on: boolean) => void;
  cancelMode: () => void;
  endDialog: () => void;
  markMailRead: () => void;
  releaseFish: (id: string) => void;
  /** 화면 쪽에서 저장 데이터를 고칠 때 (모카와의 대화·선물) */
  mutateSave: (fn: (save: IslandSave) => void) => void;
  dispose: () => void;
};

/* ───────────────────────────── 배치 ───────────────────────────── */

const FRUIT_TREES: [string, number, number, "apple" | "orange"][] = [
  ["apple-1", 1.8, -1.4, "apple"], ["apple-2", -7.8, -1.6, "apple"], ["orange-2", -2.8, 5.6, "orange"],
  // 강 건너 과수원
  ["apple-3", 10.2, -4.6, "apple"], ["apple-4", 13.2, -2.6, "apple"], ["orange-1", 10.6, 0.2, "orange"],
  ["orange-3", 13.6, 1.8, "orange"], ["apple-5", 11.6, 4.4, "apple"],
];
/** 크리스마스 시즌 — 11월부터 1월 6일까지 (트리와 집 장식이 함께 따른다) */
const isHolidaySeason = (d = new Date()) => d.getMonth() >= 10 || (d.getMonth() === 0 && d.getDate() <= 6);
/** 집 — 포치 달린 2층 집 (가로로 1.3배 넓힘, 폭 약 3.3 × 깊이 3.9 × 높이 3.2, 바닥 중심이 원점). 현관 포치는 +z 쪽.
 *  카메라가 남쪽(+z)에서 비추므로 rot≈0이면 문이 정면을 본다 (광장 쪽으로 살짝 틀어 둠) */
const HOUSE = { x: -4.4, z: -3.7, rot: 0.12, scale: 0.95 };
const MAILBOX = { x: -1.8, z: -1.5 };
const BOARD = { x: 0.7, z: -3.7 };
const WELL = { x: -7.4, z: 2.9 };
const NPC_HOME = { x: -1.6, z: 1.4, r: 2.6 };
const SPAWN = { x: 0.6, z: 3.2 };
const BENCH = { x: POND.x + 3.6, z: POND.z + 1.4 };
/** 주민들 — 모카는 집 앞, 단풍이는 강 건너 과수원, 설기는 남쪽 바닷가, 둥이는 남쪽 다리 옆 강가, 토리는 남서쪽 꽃밭, 몽실이는 위쪽 연못가 벤치 옆 */
const VILLAGERS = [
  { id: "mocha", model: "ShibaInu", scale: 0.24, speed: 0.9, home: NPC_HOME, hit: [0.55, 1.0], talkY: 1.0 },
  { id: "danpung", model: "Fox", scale: 0.22, speed: 1.0, home: { x: 11.9, z: -1.2, r: 1.4 }, hit: [0.55, 1.0], talkY: 0.9 },
  { id: "seolgi", model: "Husky", scale: 0.24, speed: 1.15, home: { x: DOCK.x + 2.6, z: DOCK.z0 + 1.2, r: 1.3 }, hit: [0.55, 1.0], talkY: 1.0 },
  // 둥이 — Quaternius 고양이에 실제 둥이 무늬를 칠하고 통통하게 다듬은 모델
  { id: "dungi", model: "Cat", scale: 0.00125, speed: 0.85, home: { x: 3.4, z: 9.0, r: 1.2 }, hit: [0.5, 0.8], talkY: 0.75 },
  { id: "tori", model: "Deer", scale: 0.2, speed: 0.75, home: { x: -9.4, z: 6.4, r: 1.4 }, hit: [0.6, 1.2], talkY: 1.2 },
  { id: "mongsil", model: "Alpaca", scale: 0.19, speed: 0.55, talkY: 1.35, home: { x: BENCH.x + 0.8, z: BENCH.z + 1.0, r: 1.2 }, hit: [0.6, 1.4] },
] as const;
const LAMPS: Point[] = [
  { x: -0.6, z: 0.2 }, { x: 2.0, z: 1.7 }, { x: 8.4, z: 1.6 }, { x: -1.6, z: -7.2 },
  { x: DOCK.x + 1.4, z: DOCK.z0 - 1 }, { x: POND.x + 2.4, z: POND.z - 2.6 }, { x: 8.6, z: 10.0 },
];
/** 나무를 심지 않는 빈터 */
const CLEARINGS: { x: number; z: number; r: number }[] = [
  { x: -2, z: 0, r: 6.8 }, { x: SPAWN.x, z: SPAWN.z, r: 2.5 }, { x: DOCK.x, z: DOCK.z0 - 0.4, r: 2.6 },
  { x: RAMP.x, z: cliffZ(RAMP.x) - 2.6, r: 2.2 }, { x: RAMP.x, z: cliffZ(RAMP.x) + 2.6, r: 2.2 },
  { x: BENCH.x, z: BENCH.z, r: 1.8 }, { x: 12, z: 0, r: 4.6 },
  // 주민들이 지내는 곳은 나무에 가리지 않게 비워 둔다
  // (카메라가 남쪽에서 비추므로 집 앞쪽(남쪽)도 함께)
  ...VILLAGERS.flatMap((v) => [
    { x: v.home.x, z: v.home.z, r: v.home.r + 1.4 },
    { x: v.home.x, z: v.home.z + 2.6, r: 2.2 },
  ]),
  ...BRIDGES.flatMap((b) => [
    { x: riverX(b.z) - 2.6, z: b.z, r: 1.6 },
    { x: riverX(b.z) + 2.6, z: b.z, r: 1.6 },
  ]),
];
const SKINS = ["#f6d7bd", "#e2b08b", "#a8714a"];
/** 심은 꽃의 꽃송이 — 저장된 색 번호 순서 (0 분홍, 1 연살구, 2 노랑, 3 보라, 4 빨강) */
const PETAL_HEADS = ["Petal_5", "Petal_2", "Petal_4", "Petal_1", "Petal_3"] as const;

/** Quaternius Stylized Nature MegaKit의 풀·꽃·버섯 — 텍스처를 함께 쓰도록 한 파일(MegaKit_Plants.glb)에 묶었다 */
const PLANTS = [
  "Grass_Common_Short", "Grass_Common_Tall", "Grass_Wispy_Short", "Grass_Wispy_Tall",
  "Clover_1", "Clover_2", "Fern_1", "Plant_1", "Plant_1_Big", "Plant_7", "Plant_7_Big",
  "Flower_3_Single", "Flower_3_Group", "Flower_4_Single", "Flower_4_Group", "Bush_Common_Flowers",
  ...PETAL_HEADS, "Mushroom_Common",
] as const;
type PlantName = (typeof PLANTS)[number];

const MODELS = [
  "ShibaInu", "House", "Well", "Fence",
  "Apple_Crop", "Orange_Crop",
  "Bush_1", "Bush_Snow_1", "BushBerries_1",
  "Rock_1", "Rock_2", "Rock_Moss_1", "Rock_Moss_2", "Rock_Snow_1", "Rock_Snow_2",
  "Lilypad", "TreeStump_Moss", "WoodLog_Moss", "FishingRod_Lvl1", "Dock_Long", "Boat", "Fox", "Alpaca", "Husky", "Deer", "Cat",
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


/** 지형 기준으로 나무 자리 정하기 — 결정적이라 나무 id가 매번 같다 */
type TreeSpot = { id: string; x: number; z: number; kind: TreeKind; variant: number; scale: number };
const TREE_SPOTS: TreeSpot[] = (() => {
  const R = rng(20261030);
  const spots: TreeSpot[] = [];
  const reserved = FRUIT_TREES.map(([, x, z]) => ({ x, z }));
  const ok = (x: number, z: number, spacing = 2.5) =>
    terrainWalkable(x, z) &&
    islandE(x, z) < 0.9 &&
    // 선착장 위·옆은 비워 둔다
    !(Math.abs(x - DOCK.x) < DOCK.halfWidth + 1.6 && z > DOCK.z0 - 2) &&
    Math.abs(x - riverX(z)) > 2.2 &&
    Math.hypot(x - POND.x, z - POND.z) > POND.r + 1.6 &&
    Math.abs(cliffZ(x) - z) > 1.2 &&
    !CLEARINGS.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) &&
    !reserved.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < 2.6 * 2.6) &&
    !spots.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < spacing * spacing);
  const add = (x: number, z: number, R: () => number) => {
    const high = tierT(x, z) > 0.5;
    const r = R();
    const kind: TreeKind = high ? (r < 0.55 ? "pine" : r < 0.8 ? "birch" : "common") : r < 0.55 ? "common" : r < 0.8 ? "pine" : "birch";
    spots.push({ id: `tree-${spots.length}`, x, z, kind, variant: 1 + Math.floor(R() * 3), scale: 0.85 + R() * 0.25 });
  };
  // 처음 섬에 있던 나무 — 자리가 그대로 남도록 처음과 같은 방식으로 뽑는다
  for (let i = 0; i < 4000 && spots.length < 84; i++) {
    const x = (R() - 0.5) * 46;
    const z = (R() - 0.5) * 38 - 1.5;
    if (firstIslandE(x, z) >= 0.9 || !ok(x, z)) continue;
    add(x, z, R);
  }
  // 넓힌 땅의 나무 — 조금 더 성기게 심어 풀밭을 남긴다
  const N = rng(20261102);
  const firstCount = spots.length;
  for (let i = 0; i < 6000 && spots.length < firstCount + 30; i++) {
    const x = (N() - 0.5) * ISLAND.rx * 2;
    const z = (N() - 0.5) * ISLAND.rz * 2 + ISLAND.cz;
    if (firstIslandE(x, z) < 0.9 || !ok(x, z, 3.6)) continue;
    add(x, z, N);
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
  /** 실제 날씨 — 화면 쪽에서 받아 와 setWeather로 알려 준다 */
  let weather: WeatherKind | null = null;
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
  // 밤에 캐릭터가 어둠에 묻히지 않도록 — 캐릭터 앞쪽 위에서 따라다니는 따뜻한 빛
  const glow = new THREE.PointLight(0xffe0b0, 0, 6, 1.6);
  scene.add(glow);
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
  const plants = new Map<PlantName, THREE.Group>();
  await Promise.all([
    ...MODELS.map(async (name) => {
      const g = await loader.loadAsync(`/island/models/${name}.glb`);
      curveAll(g.scene);
      // 작은 장식은 그림자를 드리우지 않는다 (그림자 계산 절약)
      if (name === "Lilypad") g.scene.traverse((c) => (c.castShadow = false));
      gltfs.set(name, { scene: g.scene, animations: g.animations });
    }),
    // 풀·꽃은 한 파일에 모델별 노드로 들어 있다 — 노드를 하나씩 떼어 쓴다
    loader.loadAsync("/island/models/MegaKit_Plants.glb").then((g) => {
      curveAll(g.scene);
      for (const node of [...g.scene.children]) {
        node.traverse((c) => (c.castShadow = false));
        node.position.set(0, 0, 0);
        const holder = new THREE.Group();
        holder.add(node);
        plants.set(node.name as PlantName, holder);
      }
    }),
  ]);
  // 나중에 필요할 때 불러오는 모델 (낚시 물고기, 모자·안경) — 처음 로딩 진행률과는 따로
  const lazyLoader = new GLTFLoader();
  lazyLoader.setMeshoptDecoder(MeshoptDecoder);

  const place = (name: ModelName, x: number, z: number, scale = 1, rot = 0, y?: number) => {
    const o = gltfs.get(name)!.scene.clone(true);
    o.position.set(x, y ?? groundHeight(x, z), z);
    o.scale.setScalar(scale);
    o.rotation.y = rot;
    return o;
  };
  /** 풀·꽃 놓기 — 크기는 모델 원래 크기 기준 (풀 한 포기 원본은 키가 1.3m쯤) */
  const plantModel = (name: PlantName, scale: number) => {
    const o = plants.get(name)!.clone(true);
    o.scale.setScalar(scale);
    return o;
  };
  const placePlant = (name: PlantName, x: number, z: number, scale: number, rot = 0) => {
    const o = plantModel(name, scale);
    o.position.set(x, groundHeight(x, z), z);
    o.rotation.y = rot;
    return o;
  };

  /** 코드로 만든 나무 (tree-model.ts) */
  const makeTree = (o: TreeOpts, x: number, z: number, scale = 1, rot = 0) => {
    const t = curveAll(buildTree(o, (c) => cachedStd(c)));
    t.position.set(x, groundHeight(x, z), z);
    t.scale.multiplyScalar(scale);
    t.rotation.y = rot;
    return t;
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
  /** 벤치 자리 — at: 앉았을 때 발 원점, front: 앉기 전 서는 곳, rot: 앉아서 바라보는 방향 */
  type Seat = { at: THREE.Vector3; front: Point; rot: number };
  /** direct — 다가가는 길은 act가 직접 정한다 (벤치처럼 정해진 자리로 가야 할 때) */
  type Target = { obj: THREE.Object3D; pos: Point; reach: number; act: () => void; direct?: boolean };
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

  // 선착장 — Cute Fish 팩 나무 선착장 (원본 기준 갑판 윗면 높이 3.82)
  {
    const len = DOCK.z1 - DOCK.z0;
    const dock = gltfs.get("Dock_Long")!.scene.clone(true);
    const raw = new THREE.Box3().setFromObject(dock);
    const k = len / (raw.max.z - raw.min.z);
    dock.scale.setScalar(k);
    dock.position.set(
      DOCK.x - ((raw.min.x + raw.max.x) / 2) * k,
      DOCK.y - 3.82 * k,
      (DOCK.z0 + DOCK.z1) / 2 - ((raw.min.z + raw.max.z) / 2) * k,
    );
    scene.add(dock);
  }
  // 선착장 옆에 매어 둔 작은 배 — 물결 따라 살짝 흔들린다
  const boat = gltfs.get("Boat")!.scene.clone(true);
  {
    const raw = new THREE.Box3().setFromObject(boat);
    const k = 2.3 / (raw.max.z - raw.min.z);
    boat.scale.setScalar(k);
    boat.userData.baseY = WATER_Y - 0.1 - raw.min.y * k;
    boat.position.set(DOCK.x + DOCK.halfWidth + 0.9, boat.userData.baseY, DOCK.z1 - 0.9);
    boat.rotation.y = 0.12;
    scene.add(boat);
  }

  // 집
  const house = place("House", HOUSE.x, HOUSE.z, HOUSE.scale, HOUSE.rot);
  scene.add(house);
  // 집 앞쪽(현관 방향)으로 d, 옆(현관을 바라볼 때 오른쪽)으로 side만큼 떨어진 점
  const houseFront = (d: number, side = 0) => {
    const s = Math.sin(HOUSE.rot), c = Math.cos(HOUSE.rot);
    return { x: HOUSE.x + s * d + c * side, z: HOUSE.z + c * d - s * side };
  };
  // 본채(뒤쪽)와 넓은 현관 포치(앞쪽 좌우)
  colliders.push(
    { ...houseFront(-0.6), r: 1.6 },
    { ...houseFront(1.2, -0.6), r: 0.85 },
    { ...houseFront(1.2, 0.6), r: 0.85 },
  );
  // 밤에 현관 포치 아래 켜지는 불빛
  const houseGlow = glowSprite(0xffc56b, 3.2);
  const glowAt = houseFront(1.1);
  houseGlow.position.set(glowAt.x, 1.0, glowAt.z);
  scene.add(houseGlow);
  addTarget({ obj: house, pos: { x: HOUSE.x, z: HOUSE.z }, reach: 2.6, act: () => cb.onInteract({ kind: "house" }) }, 2.0, 3.4);
  // 크리스마스 시즌에는 집도 장식 — 지붕·벽·창문·포치 전구, 지붕 위 산타 양말, 포치 갈란드, 현관 리스
  const houseXmas = isHolidaySeason() ? buildHouseXmas(cachedStd) : null;
  if (houseXmas) {
    house.add(curveAll(houseXmas.group));
    // 작은 장식이라 그림자는 드리우지 않는다
    houseXmas.group.traverse((c) => (c.castShadow = false));
  }

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
  // 앉는 자리 두 곳 — 엉덩이 자리(at)와 그 앞에 서는 자리(front), 연못을 바라본다
  bench.updateMatrixWorld(true);
  const benchSeats: Seat[] = [-0.3, 0.3].map((x) => {
    const at = bench.localToWorld(new THREE.Vector3(x, 0, 0.1));
    const f = bench.localToWorld(new THREE.Vector3(x, 0, 0.8));
    return { at, front: { x: f.x, z: f.z }, rot: bench.rotation.y };
  });
  addTarget({ obj: bench, pos: BENCH, reach: 0.9, direct: true, act: () => sitOnBench(benchSeats) }, 0.75, 1.0);

  // 가로등 — 밤에 켜진다
  const lampMat = std("#fff1b8", { emissive: 0xffc56b, emissiveIntensity: 0 });
  const lampGlows: THREE.Sprite[] = [];
  /** 옷장 클로즈업 때 카메라를 가리면 숨길 소품 (나무는 따로) */
  const props: THREE.Object3D[] = [mailbox, board, bench];
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
    props.push(g);
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
    // 11월부터 1월 6일까지 마을 가까운 전나무 세 그루가 크리스마스 트리가 된다
    const holiday = isHolidaySeason();
    const xmas = new Set(
      holiday
        ? TREE_SPOTS.filter((t) => t.kind === "pine")
            .map((t) => ({ id: t.id, d: Math.hypot(t.x - NPC_HOME.x, t.z - NPC_HOME.z) }))
            .filter((t) => t.d < 16)
            .sort((a, b) => a.d - b.d)
            .slice(0, 3)
            .map((t) => t.id)
        : [],
    );
    TREE_SPOTS.forEach(({ id, x, z, kind, variant, scale }, i) => {
      const obj = makeTree({ kind, variant, season, cherry: cherry && kind === "common" && i % 2 === 0, xmas: xmas.has(id) }, x, z, scale, R() * Math.PI * 2);
      seasonal.add(obj);
      addCollider({ x, z, r: 0.5 * scale });
      const t: TreeState = { id, obj, shake: 0 };
      trees.push(t);
      addTarget({ obj, pos: { x, z }, reach: 0.95, act: () => shakeTree(t) }, 0.9, 3);
    });
    // 크리스마스 시즌에는 집 오른쪽(현관 앞 마당)에 잘 보이는 큰 트리를 하나 더 세운다
    if (holiday) {
      const at = houseFront(0.1, 3.3);
      const obj = makeTree({ kind: "pine", variant: 1, season, xmas: true }, at.x, at.z, 1.15, 0.4);
      seasonal.add(obj);
      addCollider({ x: at.x, z: at.z, r: 0.75 });
      const t: TreeState = { id: "xmas-house", obj, shake: 0 };
      trees.push(t);
      addTarget({ obj, pos: { x: at.x, z: at.z }, reach: 1.2, act: () => shakeTree(t) }, 1.0, 3.2);
    }
    FRUIT_TREES.forEach(([id, x, z, fruit]) => {
      const picked = save.harvested[id] === today();
      const obj = makeTree({ kind: fruit, variant: 1, season, picked }, x, z, 1, (x * 7) % 6);
      seasonal.add(obj);
      addCollider({ x, z, r: 0.45 });
      const t: TreeState = { id, obj, shake: 0, fruit };
      trees.push(t);
      addTarget({ obj, pos: { x, z }, reach: 0.95, act: () => shakeTree(t) }, 0.9, 2.8);
    });

    // 섬 둘레 숲 — 장식 (걸어갈 수 없는 바깥쪽 가장자리)
    const D = rng(21);
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
      const rr = 0.965 + D() * 0.03;
      const tx = Math.cos(a) * ISLAND.rx * rr;
      const tz = ISLAND.cz + Math.sin(a) * ISLAND.rz * rr;
      if (tz > 6 || Math.abs(tx - riverX(tz)) < 2 || Math.abs(cliffZ(tx) - tz) < 1.2) continue;
      if (islandE(tx, tz) > 0.985) continue;
      const kind: TreeKind = D() < 0.6 ? "pine" : "common";
      seasonal.add(makeTree({ kind, variant: 1 + Math.floor(D() * 2), season }, tx, tz, 0.95 + D() * 0.2, D() * 6));
    }

    // 덤불·바위·풀·꽃
    const snow = season === "winter";
    const bush = snow ? "Bush_Snow_1" : season === "summer" ? "BushBerries_1" : "Bush_1";
    const B = rng(33);
    const freeSpot = (minTree: number, extra?: (x: number, z: number) => boolean) => {
      for (let k = 0; k < 80; k++) {
        const x = (B() - 0.5) * ISLAND.rx * 1.9;
        const z = (B() - 0.5) * ISLAND.rz * 1.9 + ISLAND.cz;
        if (!terrainWalkable(x, z) || islandE(x, z) > 0.92) continue;
        if (Math.abs(x - riverX(z)) < 1.8 || Math.abs(cliffZ(x) - z) < 0.9) continue;
        // 선착장 위·바로 옆은 비워 둔다
        if (Math.abs(x - DOCK.x) < DOCK.halfWidth + 1.2 && z > DOCK.z0 - 1.5) continue;
        if (CLEARINGS.slice(0, 2).some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * 0.7) ** 2)) continue;
        if (colliders.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + minTree) ** 2)) continue;
        if (extra && !extra(x, z)) continue;
        return { x, z };
      }
      return null;
    };
    for (let i = 0; i < 26; i++) {
      const p = freeSpot(0.8);
      if (!p) continue;
      seasonal.add(place(bush, p.x, p.z, 0.62, p.x));
      addCollider({ x: p.x, z: p.z, r: 0.5 });
    }
    const rockNames: ModelName[] = snow ? ["Rock_Snow_1", "Rock_Snow_2"] : ["Rock_1", "Rock_2", "Rock_Moss_1", "Rock_Moss_2"];
    for (let i = 0; i < 22; i++) {
      // 절반은 바닷가에
      const p = freeSpot(0.6, i % 2 ? undefined : (x, z) => islandE(x, z) > 0.8 && z > 4);
      if (!p) continue;
      const s = 0.55 + B() * 0.4;
      seasonal.add(place(rockNames[i % rockNames.length], p.x, p.z, s, p.x * 2));
      addCollider({ x: p.x, z: p.z, r: 0.35 * s + 0.1 });
    }
    for (let i = 0; i < 6; i++) {
      const p = freeSpot(0.6);
      if (!p) continue;
      seasonal.add(place("TreeStump_Moss", p.x, p.z, 0.55, p.x));
      addCollider({ x: p.x, z: p.z, r: 0.38 });
    }
    for (let i = 0; i < 5; i++) {
      const p = freeSpot(0.8, i === 0 ? (x, z) => islandE(x, z) > 0.82 && z > 6 : undefined);
      if (!p) continue;
      seasonal.add(place("WoodLog_Moss", p.x, p.z, 0.65, p.x));
      addCollider({ x: p.x, z: p.z, r: 0.6 });
    }
    if (!snow) {
      const G = rng(5);
      for (let i = 0; i < 360; i++) {
        const x = (G() - 0.5) * ISLAND.rx * 1.9;
        const z = (G() - 0.5) * ISLAND.rz * 1.9 + ISLAND.cz;
        // 집·바위 등 막힌 자리에는 풀을 두지 않는다 (포치 바닥을 뚫고 나오지 않게)
        if (!terrainWalkable(x, z) || blocked(x, z) || islandE(x, z) > 0.9 || Math.abs(cliffZ(x) - z) < 0.8) continue;
        // 짧은 풀이 대부분, 사이사이 키 큰 풀·하늘하늘한 풀·클로버·보라 잎
        const r = G();
        const [name, size]: [PlantName, number] =
          r < 0.34 ? ["Grass_Common_Short", 0.4]
          : r < 0.54 ? ["Grass_Wispy_Short", 0.42]
          : r < 0.66 ? ["Grass_Common_Tall", 0.3]
          : r < 0.74 ? ["Grass_Wispy_Tall", 0.3]
          : r < 0.92 ? [G() < 0.5 ? "Clover_1" : "Clover_2", 0.4]
          : ["Plant_7", 0.6];
        seasonal.add(placePlant(name, x, z, size * (0.85 + G() * 0.35), G() * 6));
      }
      // 숲 바닥 — 나무 밑동 옆에 버섯·고사리·잎 식물
      TREE_SPOTS.forEach((t, i) => {
        if (i % 7 === 0) seasonal.add(placePlant("Mushroom_Common", t.x + 0.6, t.z + 0.4, 0.7, t.x));
        else if (i % 4 === 1) seasonal.add(placePlant("Fern_1", t.x - 0.6, t.z + 0.55, 0.42, t.z));
        else if (i % 6 === 2) seasonal.add(placePlant("Plant_1", t.x + 0.55, t.z - 0.5, 0.4, t.x));
      });
      const WILD: [PlantName, number][] = [
        ["Flower_3_Group", 0.32], ["Flower_4_Group", 0.28], ["Flower_3_Single", 0.32], ["Flower_4_Single", 0.28], ["Plant_7_Big", 0.55],
      ];
      for (let i = 0; i < 44; i++) {
        // 남서쪽 꽃밭에 몰아서
        const p = i < 14 ? freeSpot(0.3, (x, z) => x < -6 && z > 3 && islandE(x, z) < 0.85) : freeSpot(0.3);
        if (!p) continue;
        const [name, size] = WILD[i % WILD.length];
        seasonal.add(placePlant(name, p.x, p.z, size * (0.9 + B() * 0.3), p.x));
      }
      // 꽃 핀 덤불 — 지나갈 수 없다
      for (let i = 0; i < 8; i++) {
        const p = freeSpot(0.7);
        if (!p) continue;
        seasonal.add(placePlant("Bush_Common_Flowers", p.x, p.z, 0.4, p.x));
        addCollider({ x: p.x, z: p.z, r: 0.4 });
      }
      for (const z of [-3.4, 4.6, 7.4, 13.2]) seasonal.add(place("Lilypad", riverX(z) + (z % 2 ? 0.45 : -0.45), z, 0.45, z, WATER_Y + 0.01));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        seasonal.add(place("Lilypad", POND.x + Math.cos(a) * 1.5, POND.z + Math.sin(a) * 1.4, 0.4, a, HIGH_WATER_Y + 0.01));
      }
    }
    // 바닷가 조개껍데기
    const SH = rng(77);
    for (let i = 0; i < 28; i++) {
      for (let k = 0; k < 40; k++) {
        const x = (SH() - 0.5) * ISLAND.rx * 1.7;
        const z = 4 + SH() * (ISLAND.cz + ISLAND.rz - 4);
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
  /** 애니메이션 재생기 — 모델 애니메이션(주민)과 코드 동작(플레이어)을 같은 방식으로 다룬다 */
  type Animator = {
    play: (name: string, once?: boolean) => void;
    current: () => string;
    busy: () => boolean;
    update: (dt: number) => void;
  };
  type Actor = { root: THREE.Object3D; anim: Animator; path: Point[]; speed: number; onArrive: (() => void) | null };

  const makeActor = (name: ModelName, scale: number): Actor => {
    const src = gltfs.get(name)!;
    const root = cloneSkinned(src.scene);
    root.scale.setScalar(scale);
    curveAll(root);
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map(src.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    actions.get("Idle")?.play();
    scene.add(root);
    let current = "Idle";
    const anim: Animator = {
      play: (next, once = false) => {
        if (current === next && !once) return;
        const action = actions.get(next);
        if (!action) return;
        const prev = actions.get(current);
        action.reset();
        action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = once;
        action.play();
        if (prev && prev !== action) action.crossFadeFrom(prev, 0.2, false);
        current = next;
      },
      current: () => current,
      busy: () => false,
      update: (dt) => mixer.update(dt),
    };
    return { root, anim, path: [], speed: 0, onArrive: null };
  };
  const play = (a: Actor, name: string, once = false) => a.anim.play(name, once);

  /* 플레이어 — 둥근 캐릭터(chibi.ts). 옷 색·머리 모양·모자는 옷장 설정을 따른다 */
  let player: Actor | null = null;
  let chibi: Chibi | null = null;
  let playerHead: THREE.Object3D | null = null;
  let playerHand: THREE.Object3D | null = null;
  let hat: THREE.Object3D | null = null;
  let glasses: THREE.Object3D | null = null;
  let wearToken = 0;
  let holdingRod = false;

  /*
   * 모델로 된 모자·안경 (OpenGameArt CC0) — 고를 때 불러온다.
   * w: 머리에 얹었을 때 가로 폭, y: 모자 밑면(안경은 가운데) 높이, 머리 중심 기준.
   */
  type WearFit = { file: string; w: number; y: number; z?: number; sy?: number; rx?: number; ry?: number; rz?: number; anchor?: "bottom" | "center"; colors: Record<string, string> };
  const WEAR: Partial<Record<Hat | Glasses, WearFit>> & Record<string, WearFit | undefined> = {
    straw: { file: "Wear_Straw", w: 1.0, y: 0.15, rx: -0.15, colors: { straw: "#e8c77a", cloth: "#d9534f" } },
    cloche: { file: "Wear_Cloche", w: 0.86, y: 0.1, rx: -0.22, colors: { cloth: "#e88fa8", ribbon: "#8a3f5f", flower: "#ffffff" } },
    beret: { file: "Wear_Beret", w: 0.82, y: 0.08, z: -0.05, sy: 0.75, rx: -0.25, rz: -0.22, colors: { __DEFAULT: "#d9534f" } },
    hardhat: { file: "Wear_HardHat", w: 0.9, y: 0.14, colors: { "Material.004": "#f5c542" } },
    crown: { file: "Wear_Crown", w: 0.42, y: 0.3, colors: { __DEFAULT: "#f2c94c" } },
    elf: { file: "Wear_Elf", w: 0.97, y: 0.1, rx: -0.1, colors: { "hat felt": "#4f9f5a" } },
    grad: { file: "Wear_Grad", w: 0.8, y: 0.16, colors: { "Material.001": "#2a2a35" } },
    tophat: { file: "Wear_TopHat", w: 0.72, y: 0.27, colors: { __DEFAULT: "#2f2f35" } },
    antler: { file: "Wear_Antler", w: 0.95, y: 0.1, colors: { Material: "#8a5a3a" } },
    headphones: { file: "Wear_Headphones", w: 0.8, y: -0.2, sy: 0.85, ry: Math.PI / 2, colors: { __DEFAULT: "#4f9fd0" } },
    round: { file: "Wear_GlassesRound", w: 0.6, y: 0.0, z: 0.31, anchor: "center", colors: { __DEFAULT: "#2a2a30" } },
    visor: { file: "Wear_GlassesVisor", w: 0.62, y: 0.0, z: 0.31, anchor: "center", colors: { __DEFAULT: "#2a2a30" } },
    pixel: { file: "Wear_GlassesPixel", w: 0.62, y: 0.0, z: 0.31, anchor: "center", colors: { __DEFAULT: "#1a1a1a" } },
  };
  /** 모자 앞쪽 테두리 높이 — 앞머리를 이 아래로 눌러 모자를 뚫지 않게 한다 (왕관·사슴뿔·헤드폰·리본은 그대로) */
  const HAT_LINE: Partial<Record<Hat, number>> = {
    beanie: 0.18, cap: 0.18, straw: 0.17, cloche: 0.19, beret: 0.15, hardhat: 0.15, elf: 0.14, grad: 0.17, tophat: 0.27,
  };
  const wearCache = new Map<string, Promise<THREE.Object3D | null>>();
  const loadWear = (fit: WearFit) => {
    let p = wearCache.get(fit.file);
    if (!p) {
      p = lazyLoader
        .loadAsync(`/island/models/${fit.file}.glb`)
        .then((g) => curveAll(g.scene))
        .catch(() => null);
      wearCache.set(fit.file, p);
    }
    return p.then((src) => {
      if (!src) return null;
      const model = src.clone(true);
      for (const [name, color] of Object.entries(fit.colors)) recolor(model, name, color);
      // 방향을 먼저 돌린 뒤 크기를 재서, 가운데 맞추고 밑면(또는 가운데)을 원점에 둔다
      const turn = new THREE.Group();
      turn.rotation.set(fit.rx ?? 0, fit.ry ?? 0, 0);
      turn.add(model);
      const box = new THREE.Box3().setFromObject(turn);
      const size = box.getSize(new THREE.Vector3());
      const k = fit.w / (size.x || 1);
      const c = box.getCenter(new THREE.Vector3());
      turn.position.set(-c.x, fit.anchor === "center" ? -c.y : -box.min.y, fit.anchor === "center" ? -box.max.z : -c.z);
      const g = new THREE.Group();
      g.add(turn);
      g.scale.set(k, k * (fit.sy ?? 1), k);
      g.position.set(0, fit.y, fit.z ?? 0);
      g.rotation.z = fit.rz ?? 0;
      g.traverse((o) => (o.castShadow = false));
      return g;
    });
  };

  const buildHat = (kind: Hat): THREE.Object3D | null => {
    if (kind === "none" || WEAR[kind]) return null;
    const g = new THREE.Group();
    // 머리카락 덩어리(반지름 0.33, 중심 y 0.06)를 살짝 덮는 크기 — 테두리는 눈썹 위에 온다
    const R = 0.345;
    const OPEN = Math.PI * 0.42;
    const rimY = 0.1 + R * 0.95 * Math.cos(OPEN);
    const rimR = R * Math.sin(OPEN);
    const dome = (color: string) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, OPEN), cachedStd(color));
      m.scale.set(1.1, 0.95, 1.06);
      m.position.set(0, 0.1, -0.03);
      return m;
    };
    if (kind === "beanie") {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.036, 10, 28), cachedStd("#f2f2f2"));
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1.06, 1.02, 1);
      rim.position.set(0, rimY, -0.03);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), cachedStd("#f2f2f2"));
      pom.position.y = 0.1 + R * 0.95 + 0.04;
      g.add(dome("#d9534f"), rim, pom);
    } else if (kind === "cap") {
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 18, 1, false, -Math.PI / 2, Math.PI), cachedStd("#3a7fb0"));
      visor.scale.set(1.15, 1, 1);
      visor.position.set(0, rimY + 0.01, -0.03 + rimR * 1.06 - 0.02);
      visor.rotation.x = 0.12;
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), cachedStd("#3a7fb0"));
      button.position.y = 0.1 + R * 0.95;
      g.add(dome("#4f9fd0"), visor, button);
    } else {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), cachedStd("#f28bb3"));
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), cachedStd("#f28bb3"));
        wing.scale.set(1.2, 0.8, 0.5);
        wing.position.x = s * 0.12;
        g.add(wing);
      }
      g.add(knot);
      // 옆머리에 꽂은 머리핀처럼 — 정수리 옆면에 살짝 묻히게
      g.position.set(0.25, 0.26, 0.08);
      g.rotation.set(0, 0.35, -0.6);
    }
    return curveAll(g);
  };

  const applyLook = (look: Look) => {
    if (!chibi) {
      const c = buildChibi(curve);
      c.root.position.set(SPAWN.x, walkHeight(SPAWN.x, SPAWN.z), SPAWN.z);
      scene.add(c.root);
      chibi = c;
      playerHead = c.head;
      playerHand = c.hand;
      player = {
        root: c.root,
        path: [],
        speed: 0,
        onArrive: null,
        anim: {
          play: (name) => c.play(name as ChibiAnim),
          current: () => c.current(),
          busy: () => c.busy(),
          update: (dt) => c.update(dt, holdingRod),
        },
      };
    }
    chibi.setColors({
      skin: SKINS[look.skin] ?? SKINS[0],
      shirt: SHIRT_COLORS[look.shirt ?? 0],
      pants: PANTS_COLORS[look.pants ?? 0],
      hair: HAIR_COLORS[look.hair ?? 0],
    });
    chibi.setHair(look.body);
    chibi.setHatLine(HAT_LINE[look.hat ?? "none"] ?? null);
    hat?.removeFromParent();
    glasses?.removeFromParent();
    hat = buildHat(look.hat ?? "none");
    glasses = null;
    if (hat) chibi.head.add(hat);
    // 모델 모자·안경은 불러온 뒤에 씌운다 (그 사이 다른 걸 고르면 버린다)
    const token = ++wearToken;
    const hatFit = WEAR[look.hat ?? "none"];
    const glassesFit = WEAR[look.glasses ?? "none"];
    if (hatFit)
      loadWear(hatFit).then((o) => {
        if (o && token === wearToken && chibi) {
          hat = o;
          chibi.head.add(o);
        }
      });
    if (glassesFit)
      loadWear(glassesFit).then((o) => {
        if (o && token === wearToken && chibi) {
          glasses = o;
          chibi.head.add(o);
        }
      });
  };
  if (save.look) applyLook(save.look);

  /** 둥이 고양이 모델에는 눈이 없어서, 머리 뼈대에 초록 눈을 붙인다 (모델 좌표 기준 위치) */
  const addDungiEyes = (actor: Actor) => {
    const head = actor.root.getObjectByName("Bone003");
    if (!head) return;
    actor.root.updateMatrixWorld(true);
    const iris = cachedStd("#c3d26e");
    const pupil = cachedStd("#1c1c1c");
    const shine = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const headQ = head.getWorldQuaternion(new THREE.Quaternion()).invert();
    const rootQ = actor.root.getWorldQuaternion(new THREE.Quaternion());
    const k = actor.root.scale.x / head.getWorldScale(new THREE.Vector3()).x;
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(13, 14, 10), iris);
      ball.scale.set(1, 1.05, 0.55);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(5.4, 10, 8), pupil);
      dot.scale.set(0.6, 1.5, 0.5);
      dot.position.z = 5.8;
      const glint = new THREE.Mesh(new THREE.SphereGeometry(2.8, 8, 6), shine);
      glint.position.set(side * 3.2, 4.5, 7.2);
      eye.add(ball, dot, glint);
      const world = actor.root.localToWorld(new THREE.Vector3(side * 25, 262, 271));
      eye.position.copy(head.worldToLocal(world));
      eye.quaternion.copy(headQ).multiply(rootQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, side * 0.4, 0)));
      eye.scale.setScalar(k);
      head.add(curveAll(eye));
    }
  };
  type Villager = {
    id: string; actor: Actor; home: { x: number; z: number; r: number }; speed: number; talking: boolean; wait: number; proxy: THREE.Mesh;
    /** 머리 위 말풍선 (주민끼리 대화할 때) */
    bubble: CSS2DObject; bubbleText: HTMLDivElement; talkY: number;
  };
  const makeBubble = () => {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "relative", maxWidth: "190px", padding: "7px 11px", borderRadius: "14px", background: "#fffdf6",
      color: "#4a3b2a", font: "600 12.5px/1.45 system-ui, sans-serif", boxShadow: "0 3px 10px rgba(0,0,0,.18)",
      wordBreak: "keep-all", textAlign: "center", transition: "opacity .25s", opacity: "0", marginBottom: "8px",
    });
    const text = document.createElement("div");
    const tail = document.createElement("div");
    Object.assign(tail.style, {
      position: "absolute", left: "50%", bottom: "-5px", width: "10px", height: "10px", background: "#fffdf6",
      transform: "translateX(-50%) rotate(45deg)",
    });
    el.append(text, tail);
    const obj = new CSS2DObject(el);
    obj.center.set(0.5, 1);
    obj.visible = false;
    scene.add(obj);
    return { obj, text };
  };
  const villagers: Villager[] = VILLAGERS.map((d, i) => {
    const actor = makeActor(d.model, d.scale);
    if (d.id === "dungi") addDungiEyes(actor);
    actor.root.position.set(d.home.x, groundHeight(d.home.x, d.home.z), d.home.z);
    const b = makeBubble();
    const v: Villager = {
      id: d.id, actor, home: d.home, speed: d.speed, talking: false, wait: 2 + i, proxy: null as unknown as THREE.Mesh,
      bubble: b.obj, bubbleText: b.text, talkY: d.talkY,
    };
    v.proxy = addTarget({ obj: actor.root, pos: { x: d.home.x, z: d.home.z }, reach: 1.15, act: () => talkTo(v) }, d.hit[0], d.hit[1]);
    return v;
  });

  /* 주민끼리 찾아가서 수다 떨기 — 찾아가기(go) → 말풍선 주고받기(talk) → 집으로(back) */
  type Visit = { chat: Chatter; visitor: Villager; host: Villager; stage: "go" | "talk" | "back"; line: number; t: number };
  let visit: Visit | null = null;
  /** 개발용 — 테스트에서 시간을 빨리 돌릴 때 */
  let timeScale = 1;
  let nextVisit = 20 + Math.random() * 15;
  const villagerById = (id: string) => villagers.find((v) => v.id === id);
  const say = (v: Villager | null, text = "") => {
    for (const x of villagers) {
      const on = x === v;
      x.bubble.visible = on;
      (x.bubble.element as HTMLDivElement).style.opacity = on ? "1" : "0";
      if (on) x.bubbleText.textContent = text;
    }
  };
  const startVisit = (chat?: Chatter) => {
    const c = chat ?? pickChatter(new Date().getHours(), season);
    const visitor = villagerById(c.a);
    const host = villagerById(c.b);
    if (!visitor || !host || visitor.talking || host.talking) return false;
    const hp = host.actor.root.position;
    const vp = visitor.actor.root.position;
    const d = Math.hypot(vp.x - hp.x, vp.z - hp.z) || 1;
    // 몸이 길쭉한 동물들이라 서로 겹치지 않게 조금 떨어져 선다
    let goal: Point = { x: hp.x + ((vp.x - hp.x) / d) * 1.5, z: hp.z + ((vp.z - hp.z) / d) * 1.5 };
    if (!walkable(goal.x, goal.z)) goal = nav.nearestOpen(goal, 8) ?? goal;
    const path = nav.find({ x: vp.x, z: vp.z }, goal);
    if (!path) return false;
    visitor.actor.path = path;
    host.actor.path = [];
    play(host.actor, "Idle");
    visit = { chat: c, visitor, host, stage: "go", line: 0, t: 0 };
    return true;
  };
  /** 수다를 끝내고 손님은 집으로 */
  const endVisitTalk = () => {
    if (!visit) return;
    say(null);
    visit.stage = "back";
    visit.visitor.actor.path = [];
  };
  const lineTime = (text: string) => 2.2 + text.length * 0.07;
  const updateVisit = (dt: number) => {
    if (!visit) {
      nextVisit -= dt;
      if (nextVisit <= 0) nextVisit = startVisit() ? 0 : 15;
      return;
    }
    const { visitor, host } = visit;
    if (visitor.talking || host.talking) return;
    const va = visitor.actor;
    if (visit.stage === "go") {
      if (va.path.length) {
        moveActor(va, dt, visitor.speed * 1.15);
        play(va, "Walk");
      } else {
        // 도착 — 서로 마주 보고 이야기 시작
        const hp = host.actor.root.position;
        const vp = va.root.position;
        facePoint(va, { x: hp.x, z: hp.z });
        facePoint(host.actor, { x: vp.x, z: vp.z });
        play(va, "Idle");
        play(host.actor, "Idle");
        visit.stage = "talk";
        visit.line = 0;
        visit.t = 0;
        const [who, text] = visit.chat.lines[0];
        say(who ? host : visitor, text);
      }
    } else if (visit.stage === "talk") {
      visit.t += dt;
      const [, text] = visit.chat.lines[visit.line];
      if (visit.t >= lineTime(text)) {
        visit.line += 1;
        visit.t = 0;
        if (visit.line >= visit.chat.lines.length) endVisitTalk();
        else {
          const [who, next] = visit.chat.lines[visit.line];
          say(who ? host : visitor, next);
        }
      }
    } else {
      const p = va.root.position;
      if (va.path.length) {
        moveActor(va, dt, visitor.speed);
        play(va, "Walk");
      } else if (Math.hypot(p.x - visitor.home.x, p.z - visitor.home.z) > visitor.home.r + 0.3) {
        va.path = nav.find({ x: p.x, z: p.z }, { x: visitor.home.x, z: visitor.home.z }) ?? [];
        if (!va.path.length) visit = null;
      } else {
        play(va, "Idle");
        visitor.wait = 2;
        host.wait = 1;
        visit = null;
        nextVisit = 35 + Math.random() * 45;
      }
    }
  };

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
  /**
   * 심은 꽃 — 새싹(작은 클로버) → 줄기(잎 식물) → 꽃봉오리 → 활짝 핀 꽃.
   * 꽃봉오리·꽃은 초록 줄기 끝에 심을 때 정한 색의 꽃송이를 얹는다 (봉오리는 오므린 모양)
   */
  const stemMat = cachedStd("#5f9a3e");
  const flowerModelFor = (stage: number, color: number) => {
    const g = new THREE.Group();
    if (stage === 0) {
      g.add(plantModel("Clover_2", 0.13));
      return g;
    }
    if (stage === 1) {
      g.add(plantModel("Plant_1", 0.2));
      return g;
    }
    const h = stage === 2 ? 0.34 : 0.42;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, h, 5), stemMat);
    stem.position.y = h / 2;
    const leaves = plantModel("Plant_1", 0.13);
    const head = plantModel(PETAL_HEADS[color % PETAL_HEADS.length], 1);
    const holder = new THREE.Group();
    holder.add(head);
    holder.position.y = h - 0.02;
    if (stage === 2) holder.scale.set(0.16, 0.42, 0.16);
    else {
      holder.scale.setScalar(0.42);
      // 위에서 비추는 카메라 쪽으로 살짝 고개를 든다
      holder.rotation.x = 0.35;
    }
    g.add(curveAll(stem), leaves, holder);
    return g;
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
    // 앉아 있으면 먼저 일어선 뒤 걷는다
    if (sit) {
      // 못 가는 곳(연못 등)을 누르면 그대로 앉아 있는다
      if (!nav.find(sit.seat.front, p)) {
        cb.onToast("거기는 갈 수 없어요");
        return;
      }
      standUp(() => walkTo(p, onArrive));
      return;
    }
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
    if (t.direct) {
      t.act();
      return;
    }
    if (sit) {
      standUp(() => approach(t));
      return;
    }
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

  /* ───────────── 벤치에 앉기 ───────────── */
  /** in: 앉는 중, on: 앉아 있음, out: 일어서는 중 — then은 다 일어선 뒤 할 일 */
  let sit: { seat: Seat; phase: "in" | "on" | "out"; t: number; turn: number; then: (() => void) | null } | null = null;
  const SIT_TIME = 0.4;
  /** 앉아서 둘러보는 시야 — 캐릭터를 중심으로 도는 카메라 (yaw: 방위각, pitch: 올려다보는 각도) */
  const look = { yaw: 0, pitch: 0.4, dist: mobile ? 6.2 : 5.6 };
  const LOOK_PITCH = [0.1, 1.05] as const;

  /** 내 쪽에 가까운 빈자리로 걸어가 앉는다 */
  function sitOnBench(seats: Seat[]) {
    if (!player) return;
    if (sit) {
      // 일어서던 중에 다시 누르면 다 일어선 뒤 다시 앉는다
      if (sit.phase === "out") sit.then = () => sitOnBench(seats);
      return;
    }
    const pp = player.root.position;
    const seat = seats.reduce((a, b) => (Math.hypot(a.front.x - pp.x, a.front.z - pp.z) <= Math.hypot(b.front.x - pp.x, b.front.z - pp.z) ? a : b));
    let goal = seat.front;
    if (!walkable(goal.x, goal.z)) goal = nav.nearestOpen(goal, 8) ?? goal;
    const begin = () => {
      if (!player) return;
      player.path = [];
      // 앞자리에 딱 서서 몸을 돌려 앉는다
      player.root.position.set(seat.front.x, walkHeight(seat.front.x, seat.front.z), seat.front.z);
      sit = { seat, phase: "in", t: 0, turn: player.root.rotation.y, then: null };
      // 처음엔 어깨 너머로 연못을 바라본다
      look.yaw = seat.rot + Math.PI;
      look.pitch = 0.4;
      play(player, "Idle");
      cb.onToast(mobile ? "🪑 벤치에 앉았어요 · 화면을 끌어 둘러보고, 다른 곳을 탭하면 일어나요" : "🪑 벤치에 앉았어요 · 끌어서 둘러보고, 움직이면 일어나요");
    };
    if (Math.hypot(pp.x - goal.x, pp.z - goal.z) < 0.2) begin();
    else walkTo(goal, begin);
  }

  /** 일어선다 — 다 일어서면 then을 이어서 한다 */
  function standUp(then: (() => void) | null = null) {
    if (!sit) {
      then?.();
      return;
    }
    if (sit.phase !== "out") {
      // 앉던 중이면 앉은 만큼만 되돌린다
      sit.t = sit.phase === "in" ? Math.max(0, SIT_TIME - sit.t) : 0;
      sit.phase = "out";
    }
    sit.then = then;
  }

  const updateSit = (dt: number) => {
    if (!sit || !player || !chibi) return;
    sit.t += dt;
    const done = sit.t >= SIT_TIME;
    const k = Math.min(1, sit.t / SIT_TIME);
    const raw = sit.phase === "in" ? k : sit.phase === "on" ? 1 : 1 - k;
    const e = raw * raw * (3 - 2 * raw);
    const { at, front, rot } = sit.seat;
    const p = player.root.position;
    const fy = walkHeight(front.x, front.z);
    p.x = front.x + (at.x - front.x) * e;
    p.z = front.z + (at.z - front.z) * e;
    // 뒤로 콩 하고 뛰어 앉는다
    p.y = fy + (at.y - fy) * e + Math.sin(e * Math.PI) * 0.12;
    // 앉으면서 벤치 앞쪽(연못)을 보도록 돌아선다
    let diff = rot - sit.turn;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const turnK = sit.phase === "in" ? Math.min(1, k * 1.6) : 1;
    player.root.rotation.y = sit.turn + diff * turnK;
    chibi.setSit(e);
    if (!done) return;
    if (sit.phase === "in") {
      sit.phase = "on";
      sit.t = 0;
    } else if (sit.phase === "out") {
      const then = sit.then;
      sit = null;
      chibi.setSit(0);
      p.y = fy;
      then?.();
    }
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
        const bare = makeTree({ kind: t.fruit, variant: 1, season, picked: true }, pos.x, pos.z, 1, rot);
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
    holdingRod = m === "fish";
    if (m === "fish") loadFishAssets();
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
      save.flowers.push({ id: `f-${Date.now().toString(36)}`, x: p.x, z: p.z, color: Math.floor(Math.random() * PETAL_HEADS.length), at: Date.now() });
      syncFlowers();
      cb.onToast("🌱 꽃씨를 심었어요 · 시간이 지나면 자라요");
      persist();
      setMode("walk");
    });
  };

  const talkTo = (v: Villager) => {
    if (!player) return;
    // 다른 주민과 수다 중이었다면 그만두고 손님을 맞는다
    if (visit && (visit.visitor === v || visit.host === v)) endVisitTalk();
    v.talking = true;
    v.actor.path = [];
    facePoint(v.actor, { x: player.root.position.x, z: player.root.position.z });
    play(v.actor, "Idle");
    cb.onInteract({ kind: "npc", id: v.id });
  };

  /* ───────────── 낚시 ───────────── */
  const rod = new THREE.Group();
  // Cute Fish 팩 낚싯대 — 원본은 y축으로 서 있고 원점(손잡이)에서 끝까지 4.91
  const ROD_SCALE = 0.27;
  {
    const m = gltfs.get("FishingRod_Lvl1")!.scene.clone(true);
    m.scale.setScalar(ROD_SCALE);
    rod.add(m);
  }
  rod.visible = false;
  scene.add(rod);
  const rodTip = new THREE.Object3D();
  rodTip.position.y = 4.91 * ROD_SCALE;
  rod.add(rodTip);

  // 물고기 모델은 처음 낚싯대를 들 때 불러온다
  const fishAssets = new Map<string, THREE.Object3D>();
  let fishLoading = false;
  let disposed = false;
  const loadFishAssets = () => {
    if (fishLoading) return;
    fishLoading = true;
    for (const name of FISH_MODELS) {
      lazyLoader
        .loadAsync(`/island/models/${name}.glb`)
        .then((g) => {
          if (disposed) return;
          fishAssets.set(name, curveAll(g.scene));
        })
        .catch(() => {
          // 못 불러오면 코드로 만든 물고기로 대신한다
        });
    }
  };

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
    const model = buildFishFromAsset(species, fishAssets, recolor) ?? buildFishModel(species, cachedStd);
    const s = species.junk ? 0.7 : THREE.MathUtils.clamp(size / 40, 0.6, 2.4) * 0.85;
    model.scale.multiplyScalar(s);
    curveAll(model);
    if (fishing.held) scene.remove(fishing.held);
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
    if (rod.visible) {
      // 손 뼈를 못 찾으면 몸 앞 오른쪽 허리 높이에라도 든다
      if (playerHand) playerHand.getWorldPosition(rod.position);
      else rod.position.copy(player.root.position).add(new THREE.Vector3(Math.cos(player.root.rotation.y) * 0.25, 0.55, -Math.sin(player.root.rotation.y) * 0.25));
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
          fishing.held.position.y += 0.6 + Math.min(f.t, 0.3);
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
  let down: { x: number; y: number; t: number; id: number; lx: number; ly: number; drag: boolean } | null = null;
  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, lx: e.clientX, ly: e.clientY, drag: false };
  };
  /** 벤치에 앉아 있을 때 끌면 시야를 돌린다 (좌우: 둘러보기, 위아래: 내려다보기·올려다보기) */
  const onPointerMove = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id || !sit || sit.phase === "out" || closeUp || inputLocked) return;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
    down.drag = true;
    const k = (Math.PI * 1.4) / renderer.domElement.clientHeight;
    look.yaw -= (e.clientX - down.lx) * k;
    look.pitch = THREE.MathUtils.clamp(look.pitch + (e.clientY - down.ly) * k, LOOK_PITCH[0], LOOK_PITCH[1]);
    down.lx = e.clientX;
    down.ly = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    const dragged = down.drag;
    down = null;
    if (moved < 12 && quick && !dragged) tap(e.clientX, e.clientY);
  };
  const tap = (cx: number, cy: number) => {
    if (!player || closeUp || inputLocked) return;
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
      for (const v of villagers) {
        const p = v.actor.root.position;
        v.proxy.position.set(p.x, p.y + (v.proxy.geometry as THREE.CylinderGeometry).parameters.height / 2, p.z);
      }
      // 주민이 나무 밑에 있어도 주민을 먼저 고른다
      const hits = raycaster.intersectObjects(hitProxies, false);
      const hit = hits.find((h) => villagers.some((v) => v.proxy === h.object)) ?? hits[0];
      if (hit) {
        const t = hit.object.userData.target as Target;
        const v = villagers.find((x) => x.actor.root === t.obj);
        if (v) t.pos = { x: v.actor.root.position.x, z: v.actor.root.position.z };
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
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  const keys = new Set<string>();
  let inputLocked = false;
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
  let baseHemi = 1;
  const GLOW_I = 7;
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
    // 날씨 — 흐리거나 비·눈이 오면 하늘이 잿빛이 되고 햇빛이 약해진다
    const cloud = weather === "storm" ? 0.85 : weather === "rain" ? 0.7 : weather === "snow" ? 0.55 : weather === "fog" ? 0.6 : weather === "cloudy" ? 0.45 : 0;
    if (cloud) {
      const grey = new THREE.Color(night > 0.5 ? "#2a2d36" : "#9aa3ad");
      s.top.lerp(grey, cloud * 0.75);
      s.bottom.lerp(grey, cloud * 0.6);
      s.fog.lerp(grey, cloud * 0.6);
    }
    skyTex = skyTexture(s.top, s.bottom, skyTex);
    scene.background = skyTex;
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(s.fog);
    fog.near = weather === "fog" ? 8 : weather === "rain" || weather === "storm" || weather === "snow" ? 18 : 26;
    fog.far = weather === "fog" ? 30 : weather === "rain" || weather === "storm" || weather === "snow" ? 42 : 52;
    hemi.color.copy(s.hemiSky);
    hemi.groundColor.copy(s.hemiGround);
    hemi.intensity = s.hemi * (1 - cloud * 0.38);
    sun.color.copy(s.sun);
    sun.intensity = s.sunI * (1 - cloud * 0.72);
    baseHemi = hemi.intensity;
    sun.userData.dir = s.sunDir;
    night = s.night;
    (stars.material as THREE.PointsMaterial).opacity = night;
    lampMat.emissiveIntensity = night * 1.6;
    glow.intensity = night * GLOW_I;
    for (const g of lampGlows) (g.material as THREE.SpriteMaterial).opacity = night * 0.55;
    (houseGlow.material as THREE.SpriteMaterial).opacity = night * 0.6;
    waterMat.color.set(night > 0.5 ? 0x3d6f9e : 0x6fd0de);
  };
  applySky();
  const skyTimer = window.setInterval(() => {
    applySky();
    syncFlowers();
  }, 30_000);

  /* ───────────── 계절 입자 (꽃잎·낙엽·눈·반딧불) + 날씨 (비·눈) ───────────── */
  let rain: THREE.LineSegments | null = null;
  let lightning = 0;
  let nextBolt = 6;
  let particles: THREE.Points | null = null;
  let velocity: Float32Array | null = null;
  let fireflies: THREE.Points | null = null;
  function rebuildParticles() {
    if (particles) scene.remove(particles);
    if (fireflies) scene.remove(fireflies);
    if (rain) scene.remove(rain);
    particles = null;
    fireflies = null;
    rain = null;
    if (opts.reducedMotion) return;
    const wet = weather === "rain" || weather === "storm";
    if (wet) {
      // 빗줄기 — 짧은 선분을 카메라 주변에 뿌리고 매 프레임 떨어뜨린다
      const n = weather === "storm" ? 1100 : 800;
      const pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = camTarget.x + (Math.random() - 0.5) * 24;
        const y = Math.random() * 10;
        const z = camTarget.z + (Math.random() - 0.5) * 20;
        pos.set([x, y, z, x + 0.06, y + 0.6, z + 0.03], i * 6);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xeef4fb, transparent: true, opacity: 0.85, depthWrite: false }));
      rain.frustumCulled = false;
      scene.add(rain);
    }
    // 날씨를 알면 겨울이라도 눈은 실제로 눈이 올 때만 내린다
    const seasonal = {
      spring: { n: 90, color: 0xf6b9cc, size: 0.14 },
      summer: { n: 0, color: 0xffffff, size: 0.1 },
      autumn: { n: 80, color: 0xe8964a, size: 0.16 },
      winter: { n: weather && weather !== "snow" ? 0 : 180, color: 0xffffff, size: 0.12 },
    }[season];
    const conf = weather === "snow" ? { n: 340, color: 0xffffff, size: 0.14 } : wet ? { n: 0, color: 0xffffff, size: 0.1 } : seasonal;
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
    if ((season === "summer" || season === "autumn") && !wet) {
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
  const lookOffset = new THREE.Vector3();
  const seatedView = () => !!sit && sit.phase !== "out" && !closeUp;
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
    const dt = Math.min(timer.getDelta(), 0.05) * timeScale;
    const time = timer.getElapsed();
    houseXmas?.update(time, night);

    if (player) {
      // 키보드 이동
      let kx = 0;
      let kz = 0;
      if (!closeUp && !inputLocked && fishing.phase !== "catch") {
        if (keys.has("w") || keys.has("arrowup")) kz -= 1;
        if (keys.has("s") || keys.has("arrowdown")) kz += 1;
        if (keys.has("a") || keys.has("arrowleft")) kx -= 1;
        if (keys.has("d") || keys.has("arrowright")) kx += 1;
      }
      let moving = false;
      if (sit) {
        // 앉아 있을 때 방향키를 누르면 일어선다 (일어서는 동안은 제자리)
        if (kx || kz) standUp();
        updateSit(dt);
      } else if (kx || kz) {
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
      const oneShot = player.anim.busy();
      if (moving) play(player, !(kx || kz) && player.speed > 3 ? "Run" : "Walk");
      if (!moving && !oneShot && player.anim.current() !== "Idle") play(player, "Idle");

      // 지나가며 줍기
      for (const [id, o] of itemObjs) {
        if (o.userData.fall) continue;
        if ((o.position.x - player.root.position.x) ** 2 + (o.position.z - player.root.position.z) ** 2 < 0.2) pickUp(id);
      }
      player.anim.update(dt);

      updateFishing(dt, time);
      glow.position.set(player.root.position.x, player.root.position.y + 2.1, player.root.position.z + 1.3);

      // 카메라
      const pr = player.root.position;
      // 섬 가장자리에서는 바다만 보이지 않게 카메라를 조금 안쪽에 묶어 둔다
      const tx = closeUp ? pr.x : THREE.MathUtils.clamp(pr.x, -(ISLAND.rx - 7), ISLAND.rx - 7);
      const tz = closeUp ? pr.z : THREE.MathUtils.clamp(pr.z - 1.5, ISLAND.cz - ISLAND.rz + 3, ISLAND.cz + ISLAND.rz + 0.5);
      // 옷장에서는 아래쪽 패널에 가리지 않게 캐릭터를 화면 위쪽에 둔다
      // (데스크톱은 오른쪽 패널을 피해 캐릭터를 왼쪽에)
      tmp.set(closeUp && !mobile ? tx + 1.0 : tx, closeUp ? pr.y - (mobile ? 0.5 : 0.0) : 0, closeUp ? tz + (mobile ? 0.8 : 0.2) : tz);
      // 벤치에 앉아 있으면 캐릭터 머리 높이를 중심으로 가까이서 둘러본다
      // (바라보는 쪽으로 조금 앞을 중심으로 삼아 캐릭터가 경치를 가리지 않게 한다)
      if (seatedView()) tmp.set(pr.x - Math.sin(look.yaw) * 1.3, pr.y + 0.8, pr.z - Math.cos(look.yaw) * 1.3);
      if (opts.reducedMotion) camTarget.copy(tmp);
      else camTarget.lerp(tmp, Math.min(1, dt * 3));
      let goalOffset = closeUp ? nearOffset : farOffset;
      if (seatedView()) {
        const h = Math.cos(look.pitch) * look.dist;
        lookOffset.set(Math.sin(look.yaw) * h, Math.sin(look.pitch) * look.dist, Math.cos(look.yaw) * h);
        // 땅 속으로 파고들지 않게
        const gx = tmp.x + lookOffset.x;
        const gz = tmp.z + lookOffset.z;
        lookOffset.y = Math.max(lookOffset.y, Math.max(groundHeight(gx, gz), waterAt(gx, gz)?.y ?? WATER_Y) + 0.45 - tmp.y);
        goalOffset = lookOffset;
      }
      if (opts.reducedMotion) camOffset.copy(goalOffset);
      else camOffset.lerp(goalOffset, Math.min(1, dt * 4));
    }
    camera.position.copy(camTarget).add(camOffset);
    camera.lookAt(camTarget);
    // 가까이 볼 때 카메라와 캐릭터 사이 나무는 잠시 숨긴다
    if (player) {
      const px = player.root.position.x;
      const pz = player.root.position.z;
      for (const obj of [...trees.map((t) => t.obj), ...props]) {
        let hide = false;
        // 앉아서 둘러볼 때도 시야를 가리는 나무는 숨긴다 (앉아 있는 벤치는 빼고)
        if (closeUp || (seatedView() && obj !== bench)) {
          const ox = obj.position.x - px;
          const oz = obj.position.z - pz;
          const cx = camera.position.x - px;
          const cz = camera.position.z - pz;
          const len = Math.hypot(cx, cz) || 1;
          const along = (ox * cx + oz * cz) / len;
          const side = Math.abs(ox * cz - oz * cx) / len;
          hide = along > -0.3 && along < len + 1 && side < 1.6;
        }
        obj.visible = !hide;
      }
      // 앉아서 둘러볼 때 카메라 바로 앞을 가리는 주민도 잠시 숨긴다
      for (const v of villagers) {
        let hide = false;
        if (seatedView()) {
          const ox = v.actor.root.position.x - px;
          const oz = v.actor.root.position.z - pz;
          const cx = camera.position.x - px;
          const cz = camera.position.z - pz;
          const len = Math.hypot(cx, cz) || 1;
          const along = (ox * cx + oz * cz) / len;
          const side = Math.abs(ox * cz - oz * cx) / len;
          hide = along > 0.4 && along < len + 0.5 && side < 1.0;
        }
        v.actor.root.visible = !hide;
      }
    }
    const dir = (sun.userData.dir as THREE.Vector3) ?? new THREE.Vector3(-6, 10, 5);
    sun.position.copy(camTarget).setY(0).add(dir);
    sun.target.position.copy(camTarget).setY(0);

    // 주민끼리 수다
    updateVisit(dt);
    // 주민
    for (const v of villagers) {
      const a = v.actor;
      if (visit && (visit.visitor === v || visit.host === v)) {
        a.anim.update(dt);
        continue;
      }
      if (!v.talking) {
        if (a.path.length) {
          moveActor(a, dt, v.speed);
          play(a, "Walk");
        } else {
          v.wait -= dt;
          if (v.wait <= 0) {
            const ang = Math.random() * Math.PI * 2;
            const r = Math.random() * v.home.r;
            const goal = { x: v.home.x + Math.cos(ang) * r, z: v.home.z + Math.sin(ang) * r };
            a.path = nav.find({ x: a.root.position.x, z: a.root.position.z }, goal) ?? [];
            v.wait = 3 + Math.random() * 5;
            if (!a.path.length) play(a, Math.random() < 0.4 ? "Eating" : "Idle_2");
          } else if (a.anim.current() === "Walk") {
            play(a, Math.random() < 0.3 ? "Eating" : "Idle");
          }
        }
      }
      a.anim.update(dt);
    }
    for (const v of villagers) {
      if (!v.bubble.visible) continue;
      const p = v.actor.root.position;
      v.bubble.position.set(p.x, p.y + v.talkY, p.z);
    }

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
    // 비
    if (rain) {
      const pos = rain.geometry.attributes.position as THREE.BufferAttribute;
      const fall = (weather === "storm" ? 16 : 12) * dt;
      for (let i = 0; i < pos.count; i += 2) {
        let y = pos.getY(i) - fall;
        let x = pos.getX(i) - fall * 0.08;
        let z = pos.getZ(i);
        if (y < 0) {
          y = 9 + Math.random() * 2;
          x = camTarget.x + (Math.random() - 0.5) * 24;
          z = camTarget.z + (Math.random() - 0.5) * 20;
        }
        pos.setXYZ(i, x, y, z);
        pos.setXYZ(i + 1, x + 0.06, y + 0.6, z + 0.03);
      }
      pos.needsUpdate = true;
    }
    // 번개 — 뇌우일 때 가끔 하늘이 번쩍인다
    if (weather === "storm" && !opts.reducedMotion) {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        lightning = 0.35;
        nextBolt = 7 + Math.random() * 12;
      }
    }
    if (lightning > 0) {
      lightning = Math.max(0, lightning - dt);
      hemi.intensity = baseHemi + (lightning > 0.25 || (lightning > 0.08 && lightning < 0.14) ? 2.2 : 0);
    } else if (hemi.intensity !== baseHemi) hemi.intensity = baseHemi;
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
    boat.position.y = boat.userData.baseY + Math.sin(time * 1.3) * 0.03;
    boat.rotation.z = Math.sin(time * 1.1) * 0.035;
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
      player: () => player && { x: player.root.position.x, z: player.root.position.z, anim: player.anim.current() },
      startVisit: (i: number) => {
        const c = CHATTER_LIST[i];
        nextVisit = 999;
        return startVisit(c);
      },
      timeScale: (k: number) => {
        timeScale = k;
      },
      visit: () => (visit ? { stage: visit.stage, line: visit.line, a: visit.visitor.id, b: visit.host.id } : null),
      npc: (id = "mocha") => {
        const v = villagers.find((x) => x.id === id) ?? villagers[0];
        return { x: v.actor.root.position.x, z: v.actor.root.position.z };
      },
      fishing: () => fishing.phase,
      sit: () => (sit ? sit.phase : null),
      look: () => ({ ...look, cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z } }),
      rodTip: () => {
        const v = new THREE.Vector3();
        rodTip.getWorldPosition(v);
        return { x: v.x, y: v.y, z: v.z, hand: !!playerHand };
      },
      tuneWear: (id: string, patch: Partial<WearFit>, line: number | null, look: Look) => {
        Object.assign(WEAR[id]!, patch);
        if (line !== null) HAT_LINE[id as Hat] = line;
        applyLook(look);
      },
      fishReady: () => {
        loadFishAssets();
        return fishAssets.size === FISH_MODELS.length;
      },
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
    setWeather: (kind) => {
      if (kind === weather) return;
      weather = kind;
      applySky();
      rebuildParticles();
    },
    setInputLocked: (on) => {
      inputLocked = on;
      if (on) keys.clear();
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
      for (const v of villagers) {
        if (v.talking) v.wait = 1.5;
        v.talking = false;
      }
    },
    markMailRead: () => {
      save.mailRead = latestMail;
      syncMail();
      persist();
    },
    mutateSave: (fn) => {
      fn(save);
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
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      window.clearInterval(skyTimer);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
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
