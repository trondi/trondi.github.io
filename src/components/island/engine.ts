import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { Season } from "@/lib/season";

import { NavGrid, type Point } from "./pathfind";
import { type IslandSave, type ItemType, type Look, flowerStage, today } from "./save";
import { skyAt, skyTexture } from "./sky";
import {
  BRIDGE, TIER, WATER_Y, buildGround, buildUpperRiver, cliffZ, groundHeight, riverX, terrainWalkable, walkHeight,
} from "./terrain";

/* ───────────────────────────── 타입 ───────────────────────────── */

export type InteractEvent =
  | { kind: "npc" }
  | { kind: "mail" }
  | { kind: "board" }
  | { kind: "house" }
  | { kind: "flower"; stage: number }
  | { kind: "tree"; dropped: ItemType[] };

export type IslandCallbacks = {
  onProgress: (ratio: number) => void;
  onInteract: (e: InteractEvent) => void;
  onToast: (text: string) => void;
  onSave: (save: IslandSave) => void;
  onModeChange: (mode: "walk" | "plant") => void;
};

export type IslandOptions = {
  season: Season;
  save: IslandSave;
  latestMail: string | null;
  reducedMotion: boolean;
};

export type IslandHandle = {
  setSeason: (s: Season) => void;
  setLook: (look: Look) => void;
  startPlanting: () => void;
  cancelPlanting: () => void;
  endDialog: () => void;
  markMailRead: () => void;
  dispose: () => void;
};

/* ───────────────────────────── 배치 ───────────────────────────── */

type TreeKind = "common" | "pine" | "birch";
const TREES: [number, number, TreeKind, number, number][] = [
  [-6.8, 0.6, "common", 1, 1], [-9.2, -3.4, "pine", 2, 1], [-11.2, 0.8, "pine", 1, 1.1], [-10.6, 4.2, "common", 2, 1],
  [-8.8, 6.6, "birch", 1, 0.9], [6.6, -3.2, "common", 3, 1], [9.6, -1.0, "pine", 1, 1], [10.4, 3.2, "common", 1, 1],
  [8.4, 6.8, "birch", 1, 0.9], [7.0, 7.9, "pine", 2, 0.85], [-4.6, 8.2, "common", 3, 0.9], [-2.2, -5.7, "birch", 1, 0.9],
  [0.6, -5.9, "pine", 1, 0.9], [-6.4, -5.6, "common", 2, 0.9], [-6.6, 8.1, "common", 1, 0.95], [1.4, 9.3, "pine", 2, 0.9],
  [-11.4, 6.0, "pine", 1, 0.9], [10.8, 6.4, "common", 2, 0.9],
];
const FRUIT_TREES: [string, number, number, "apple" | "orange"][] = [
  ["apple-1", 1.8, -1.4, "apple"], ["apple-2", -7.8, -1.6, "apple"],
  ["orange-1", 7.6, 3.4, "orange"], ["orange-2", -2.8, 5.6, "orange"],
];
const HOUSE = { x: -4.4, z: -3.7, rot: Math.PI / 2 + 0.15, scale: 2.2 };
const MAILBOX = { x: -1.8, z: -1.5 };
const BOARD = { x: 0.7, z: -3.7 };
const WELL = { x: -7.4, z: 2.9 };
const NPC_HOME = { x: -1.6, z: 1.4, r: 2.6 };
const SPAWN = { x: 0.6, z: 3.2 };
const LAMPS: Point[] = [{ x: -0.6, z: 0.2 }, { x: 2.0, z: 1.7 }, { x: 6.4, z: 0.8 }];
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
  "Lilypad", "TreeStump_Moss", "WoodLog_Moss", "Mushroom_1",
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
  scene.fog = new THREE.Fog(0xcfe6f7, 24, 48);
  const camera = new THREE.PerspectiveCamera(mobile ? 42 : 34, W() / H(), 0.1, 140);
  const camOffset = mobile ? new THREE.Vector3(0, 11.5, 12.5) : new THREE.Vector3(0, 10.4, 13.6);
  const camTarget = new THREE.Vector3(SPAWN.x, 0, SPAWN.z - 1.5);
  const FOCUS = camOffset.length() + 1.5;

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

  /* 꽃잎 색 — 같은 모델을 여러 색으로 */
  const petalMats = new Map<number, THREE.Material>();
  const recolor = (o: THREE.Object3D, from: string, color: number) => {
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => {
        if (m.name !== from) return m;
        const key = color * 31 + from.length;
        if (!petalMats.has(key)) {
          const nm = (m as THREE.MeshStandardMaterial).clone();
          nm.color.set(color);
          nm.userData = {};
          petalMats.set(key, curve(nm));
        }
        return petalMats.get(key)!;
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
  type Target = {
    obj: THREE.Object3D;
    pos: Point;
    reach: number;
    act: () => void;
  };
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

  /* ───────────── 고정 지형 ───────────── */
  const groundMat = std(0xffffff, { vertexColors: true });
  let ground = buildGround(season, groundMat);
  scene.add(ground);

  const waterMat = curve(new THREE.MeshStandardMaterial({ color: 0x6fd0de, transparent: true, opacity: 0.82, roughness: 0.2, metalness: 0.05 })) as THREE.MeshStandardMaterial;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 45, 45), waterMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, WATER_Y, 8);
  sea.receiveShadow = true;
  scene.add(sea);
  const upper = buildUpperRiver(waterMat);
  scene.add(upper.mesh);

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
  const fall = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, TIER - 0.3 - WATER_Y + 0.05, 1, 4),
    curve(new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.92 })),
  );
  fall.position.set(upper.fallX, (TIER - 0.3 + WATER_Y) / 2, upper.fallZ + 0.25);
  scene.add(fall);
  const foam = new THREE.Mesh(new THREE.CircleGeometry(1.15, 14), curve(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(riverX(upper.fallZ + 0.9), WATER_Y + 0.02, upper.fallZ + 0.9);
  scene.add(foam);

  // 다리
  const bridge = new THREE.Group();
  for (let k = 0; k < 10; k++) {
    const u = k / 9;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, BRIDGE.halfWidth * 2 + 0.3), std(k % 2 ? "#9b6b45" : "#a87650"));
    p.position.set(-BRIDGE.halfLength + u * BRIDGE.halfLength * 2, 0.12 + Math.sin(u * Math.PI) * 0.18, 0);
    bridge.add(p);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 4; k++) {
      const u = k / 4;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), std("#7a5236"));
      post.position.set(-BRIDGE.halfLength + u * BRIDGE.halfLength * 2, 0.4 + Math.sin(u * Math.PI) * 0.18, side * (BRIDGE.halfWidth + 0.12));
      bridge.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(BRIDGE.halfLength * 2, 0.07, 0.07), std("#7a5236"));
    rail.position.set(0, 0.72, side * (BRIDGE.halfWidth + 0.12));
    bridge.add(rail);
  }
  bridge.position.set(riverX(BRIDGE.z), 0, BRIDGE.z);
  scene.add(curveAll(bridge));

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

  // 가로등 — 밤에 켜진다
  const lampMat = std("#fff1b8", { emissive: 0xffc56b, emissiveIntensity: 0 });
  const lampGlows: THREE.Sprite[] = [];
  for (const l of LAMPS) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), std("#4a3a46"));
    pole.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), lampMat);
    head.position.y = 1.6;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 4), std("#4a3a46"));
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

  // 위 단 숲 (장식, 걸어갈 수 없음)
  const decor = new THREE.Group();
  scene.add(decor);
  const nav = new NavGrid(walkable);

  /* ───────────── 계절에 따라 바뀌는 것 ───────────── */
  type TreeState = { id: string; obj: THREE.Object3D; shake: number; fruit?: "apple" | "orange" };
  const trees: TreeState[] = [];
  const seasonal = new THREE.Group();
  scene.add(seasonal);
  const seasonColliders: Collider[] = [];

  const buildSeason = () => {
    seasonal.clear();
    decor.clear();
    trees.length = 0;
    for (let i = targets.length - 1; i >= 0; i--) {
      if (targets[i].obj.userData.seasonal) {
        targets.splice(i, 1);
        const proxy = hitProxies.splice(i, 1)[0];
        scene.remove(proxy);
      }
    }
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
    TREES.forEach(([x, z, kind, variant, scale], i) => {
      const obj = place(treeModel(kind, variant, season), x, z, scale, R() * Math.PI * 2);
      if (cherry && kind === "common" && i % 2 === 0) recolor(obj, "Green", 0xf4b8cc);
      obj.userData.seasonal = true;
      seasonal.add(obj);
      addCollider({ x, z, r: 0.5 * scale });
      const t: TreeState = { id: `tree-${i}`, obj, shake: 0 };
      trees.push(t);
      addTarget({ obj, pos: { x, z }, reach: 0.95, act: () => shakeTree(t) }, 0.9, 3).userData.seasonal = true;
    });
    FRUIT_TREES.forEach(([id, x, z, fruit]) => {
      const picked = save.harvested[id] === today();
      const name = (fruit === "apple" ? (picked ? "Apple_Harvested" : "Apple_4") : picked ? "Orange_Harvested" : "Orange_4") as ModelName;
      const obj = place(name, x, z, 1, (x * 7) % 6);
      obj.userData.seasonal = true;
      seasonal.add(obj);
      addCollider({ x, z, r: 0.45 });
      const t: TreeState = { id, obj, shake: 0, fruit };
      trees.push(t);
      addTarget({ obj, pos: { x, z }, reach: 0.95, act: () => shakeTree(t) }, 0.9, 2.8).userData.seasonal = true;
    });

    // 위 단 숲
    const D = rng(21);
    for (let x = -18; x <= 18; x += 1.7) {
      for (let row = 0; row < 3; row++) {
        const tx = x + (D() - 0.5) * 1.2;
        const tz = cliffZ(tx) - 1.1 - row * 2.2 - D() * 1.4;
        if (Math.abs(tx - riverX(tz)) < 1.8) continue;
        const kind: TreeKind = D() < 0.55 ? "pine" : "common";
        decor.add(place(treeModel(kind, 1 + Math.floor(D() * 3), season), tx, tz, 0.9 + D() * 0.3, D() * 6));
      }
    }
    // 바닷가 쪽 섬 테두리 나무 (화면 아래쪽은 비워 둔다)
    for (let a = Math.PI * 1.05; a < Math.PI * 1.95; a += 0.16) {
      const tx = Math.cos(a) * 14.6;
      const tz = 1.5 - Math.sin(a) * 10.2;
      if (tz < cliffZ(tx) || Math.abs(tx - riverX(tz)) < 1.8) continue;
      decor.add(place(treeModel(D() < 0.5 ? "pine" : "common", 1 + Math.floor(D() * 2), season), tx, tz, 0.95, D() * 6));
    }

    // 덤불·바위·풀
    const snow = season === "winter";
    const bush = snow ? "Bush_Snow_1" : season === "summer" ? "BushBerries_1" : "Bush_1";
    for (const [x, z] of [[-3.4, -5.0], [-6.0, 5.5], [6.9, -0.9], [-9.6, 1.9], [9.2, 5.0]] as const) {
      seasonal.add(place(bush, x, z, 0.62, x));
      addCollider({ x, z, r: 0.5 });
    }
    const rocks: [number, number, ModelName, number][] = [
      [-5.4, 4.6, snow ? "Rock_Snow_2" : "Rock_2", 0.8], [8.7, 1.4, snow ? "Rock_Snow_1" : "Rock_Moss_1", 0.8],
      [-8.4, -4.6, snow ? "Rock_Snow_2" : "Rock_Moss_2", 0.9], [2.6, 6.8, snow ? "Rock_Snow_2" : "Rock_2", 0.6],
    ];
    for (const [x, z, name, s] of rocks) {
      seasonal.add(place(name, x, z, s, x * 2));
      addCollider({ x, z, r: 0.35 * s + 0.1 });
    }
    seasonal.add(place("TreeStump_Moss", -2.9, -2.8, 0.55, 1.2));
    addCollider({ x: -2.9, z: -2.8, r: 0.38 });
    seasonal.add(place("WoodLog_Moss", 8.1, -3.6, 0.65, 0.9));
    addCollider({ x: 8.1, z: -3.6, r: 0.6 });
    if (!snow) {
      for (const [x, z] of [[-2.6, -3.3], [-3.2, -2.4], [8.6, -3.0], [-6.1, 1.2]] as const) seasonal.add(place("Mushroom_1", x, z, 1.6, x));
      const G = rng(5);
      for (let i = 0; i < 70; i++) {
        const x = (G() - 0.5) * 24;
        const z = -6 + G() * 14;
        if (!terrainWalkable(x, z)) continue;
        seasonal.add(place(G() < 0.6 ? "Grass_Short" : "Grass", x, z, 0.5 + G() * 0.3, G() * 6));
      }
      for (const [x, z, c] of [
        [-1.0, 4.8, 0], [-5.4, -0.8, 1], [6.2, 2.4, 2], [-8.6, 4.8, 3], [3.2, -4.6, 0], [-0.4, -4.4, 2],
        [-3.6, 7.2, 1], [0.2, 7.6, 3], [-8.0, 8.2, 0], [7.6, 8.6, 2], [2.2, 4.8, 1],
      ] as const) {
        const f = place("Flowers", x, z, 0.75, x);
        recolor(f, "Cyan", PETALS[c]);
        seasonal.add(f);
      }
      for (const z of [-2.4, 4.6, 6.8]) seasonal.add(place("Lilypad", riverX(z) + (z % 2 ? 0.4 : -0.4), z, 0.45, z, WATER_Y + 0.01));
    }
    // 울타리
    for (const [x, z, r] of [[-7.3, -5.4, 0.2], [-1.6, -5.6, -0.1]] as const) {
      seasonal.add(place("Fence", x, z, 0.42, r));
    }

    seasonal.traverse((o) => (o.userData.seasonal = true));
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
    busy: number;
  };
  const makeActor = (name: ModelName, scale: number): Actor => {
    const src = gltfs.get(name)!;
    const root = cloneSkinned(src.scene);
    root.scale.setScalar(scale);
    curveAll(root);
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map(src.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const idle = actions.get("Idle");
    idle?.play();
    scene.add(root);
    return { root, mixer, actions, current: "Idle", path: [], speed: 0, onArrive: null, busy: 0 };
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
  const setLook = (look: Look) => {
    const pos = player ? player.root.position.clone() : new THREE.Vector3(SPAWN.x, walkHeight(SPAWN.x, SPAWN.z), SPAWN.z);
    const rot = player?.root.rotation.y ?? 0;
    if (player) scene.remove(player.root);
    player = makeActor(look.body === "a" ? "Casual2_Female" : "Casual2_Male", 0.43);
    player.root.position.copy(pos);
    player.root.rotation.y = rot;
    const skin = new THREE.Color(SKINS[look.skin] ?? SKINS[0]);
    player.root.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => {
        if (m.name !== "Skin") return m;
        const nm = (m as THREE.MeshStandardMaterial).clone();
        nm.color.copy(skin).convertSRGBToLinear();
        nm.userData = {};
        return curve(nm);
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  };
  if (save.look) setLook(save.look);

  const npc = makeActor("ShibaInu", 0.24);
  npc.root.position.set(NPC_HOME.x, groundHeight(NPC_HOME.x, NPC_HOME.z), NPC_HOME.z);
  let npcTalking = false;
  let npcWait = 2;
  const npcProxy = addTarget(
    { obj: npc.root, pos: NPC_HOME, reach: 1.15, act: () => talkToNpc() },
    0.55, 1.0,
  );

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
        const i = targets.findIndex((t) => t.obj === cur.obj);
        if (i >= 0) {
          targets.splice(i, 1);
          scene.remove(hitProxies.splice(i, 1)[0]);
        }
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

  const persist = () => {
    cb.onSave(structuredClone(save));
  };

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
        bare.userData.seasonal = true;
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
    if (player) play(player, "PickUp", true);
    cb.onToast(g.type === "apple" ? "🍎 사과를 주웠어요" : g.type === "orange" ? "🍊 오렌지를 주웠어요" : "🌱 꽃씨를 주웠어요");
    persist();
  };

  let mode: "walk" | "plant" = "walk";
  const setMode = (m: "walk" | "plant") => {
    mode = m;
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
    if (!player) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    if (mode === "walk") {
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
    const g = raycaster.intersectObject(ground, false)[0];
    if (!g) return;
    if (mode === "plant") plantAt({ x: g.point.x, z: g.point.z });
    else walkTo({ x: g.point.x, z: g.point.z });
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
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
    for (let i = 0; i < 600; i++) pts.push((S() - 0.5) * 160, 10 + S() * 45, -50 - S() * 25);
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
      const n = season === "summer" ? 36 : 14;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const z = -5 + Math.random() * 11;
        pos.set([riverX(z) + (Math.random() - 0.5) * 5, 0.5 + Math.random() * 1.4, z], i * 3);
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
      if (keys.has("w") || keys.has("arrowup")) kz -= 1;
      if (keys.has("s") || keys.has("arrowdown")) kz += 1;
      if (keys.has("a") || keys.has("arrowleft")) kx -= 1;
      if (keys.has("d") || keys.has("arrowright")) kx += 1;
      let moving = false;
      if (kx || kz) {
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
        const remain = player.path.reduce(
          (acc, q, i, arr) => acc + Math.hypot(q.x - (i ? arr[i - 1].x : player!.root.position.x), q.z - (i ? arr[i - 1].z : player!.root.position.z)),
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
      const pickingUp = player.current === "PickUp" && (player.actions.get("PickUp")?.isRunning() ?? false);
      if (moving) play(player, !(kx || kz) && player.speed > 3 ? "Run" : "Walk");
      if (!moving && !pickingUp && player.current !== "Idle") play(player, "Idle");
      if (moving && player.current === "PickUp") play(player, "Walk");

      // 지나가며 줍기
      for (const [id, o] of itemObjs) {
        if (o.userData.fall) continue;
        if ((o.position.x - player.root.position.x) ** 2 + (o.position.z - player.root.position.z) ** 2 < 0.2) pickUp(id);
      }
      player.mixer.update(dt);

      // 카메라
      const tx = THREE.MathUtils.clamp(player.root.position.x, -7, 7);
      const tz = THREE.MathUtils.clamp(player.root.position.z - 1.5, -4.5, 5.5);
      tmp.set(tx, 0, tz);
      if (opts.reducedMotion) camTarget.copy(tmp);
      else camTarget.lerp(tmp, Math.min(1, dt * 3));
    }
    camera.position.copy(camTarget).add(camOffset);
    camera.lookAt(camTarget);
    const dir = (sun.userData.dir as THREE.Vector3) ?? new THREE.Vector3(-6, 10, 5);
    sun.position.copy(camTarget).add(dir);
    sun.target.position.copy(camTarget);

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
      season: (s: Season) => {
        season = s;
        buildSeason();
      },
      screenOf: (x: number, z: number, y = 0.5) => {
        const v = new THREE.Vector3(x, groundHeight(x, z) + y, z).project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      },
    };
  }

  return {
    setSeason: (s) => {
      if (s === season) return;
      season = s;
      buildSeason();
    },
    setLook: (look) => {
      save.look = look;
      setLook(look);
      persist();
    },
    startPlanting: () => setMode("plant"),
    cancelPlanting: () => setMode("walk"),
    endDialog: () => {
      npcTalking = false;
      npcWait = 1.5;
    },
    markMailRead: () => {
      save.mailRead = latestMail;
      syncMail();
      persist();
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
