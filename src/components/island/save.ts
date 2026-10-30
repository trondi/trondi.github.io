/** 섬 진행 상황 — 방문자 브라우저(localStorage)에만 저장된다 */

export type ItemType = "apple" | "orange" | "seed";

export type PlantedFlower = { id: string; x: number; z: number; color: number; at: number };
export type GroundItem = { id: string; type: ItemType; x: number; z: number };
export type Hat = "none" | "straw" | "beanie" | "cap" | "bow";
export type Look = {
  body: "a" | "b";
  skin: number;
  /** 아래 팔레트의 색 번호 — 예전 저장에는 없을 수 있다 */
  shirt?: number;
  pants?: number;
  hair?: number;
  hat?: Hat;
};

export const SHIRT_COLORS = ["#4f4a8a", "#7d5bb0", "#e8707a", "#f0a24a", "#f5d26b", "#6faa4f", "#4f9fd0", "#ffffff", "#3a3a44", "#c96f5a"];
export const PANTS_COLORS = ["#1f2a44", "#3b4a6b", "#5a4632", "#7a8796", "#2f2f35", "#d9c7a6", "#6f5aa8", "#4a6b4a"];
export const HAIR_COLORS = ["#4a1f1a", "#2a1f1a", "#7a4a2a", "#c98f4a", "#e8d6a8", "#d66fa0", "#6f8fd0", "#9a9aa6"];
export const HATS: { id: Hat; name: string }[] = [
  { id: "none", name: "없음" },
  { id: "straw", name: "밀짚모자" },
  { id: "beanie", name: "비니" },
  { id: "cap", name: "캡" },
  { id: "bow", name: "리본" },
];

export type DexEntry = { count: number; best: number; first: number };

export type IslandSave = {
  v: 1;
  look: Look | null;
  bag: Record<ItemType, number>;
  flowers: PlantedFlower[];
  /** 나무를 마지막으로 흔든 날짜 (YYYY-MM-DD) */
  shaken: Record<string, string>;
  /** 과일을 마지막으로 딴 날짜 — 다음 날 다시 열린다 */
  harvested: Record<string, string>;
  ground: GroundItem[];
  /** 마지막으로 읽은 편지(글 slug) */
  mailRead: string | null;
  /** 가방 속 물고기 (종류별 마리 수) */
  fish: Record<string, number>;
  /** 도감 — 한 번이라도 낚은 것 */
  dex: Record<string, DexEntry>;
};

const KEY = "trond-island:v1";

export function emptySave(): IslandSave {
  return {
    v: 1,
    look: null,
    bag: { apple: 0, orange: 0, seed: 3 },
    flowers: [],
    shaken: {},
    harvested: {},
    ground: [],
    mailRead: null,
    fish: {},
    dex: {},
  };
}

export function loadSave(): IslandSave {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as Partial<IslandSave>;
    if (parsed.v !== 1) return emptySave();
    const base = emptySave();
    return { ...base, ...parsed, bag: { ...base.bag, ...parsed.bag } };
  } catch {
    return emptySave();
  }
}

export function writeSave(save: IslandSave) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // 사생활 보호 모드 등 — 저장 없이 계속 플레이
  }
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 꽃 성장 단계 0~3 — 심은 뒤 실제 시간이 지나야 자란다 */
export function flowerStage(at: number, now = Date.now()) {
  const h = (now - at) / 3_600_000;
  if (h < 0.5) return 0;
  if (h < 3) return 1;
  if (h < 12) return 2;
  return 3;
}

export const FLOWER_STAGE_LABEL = ["새싹", "줄기", "꽃봉오리", "활짝 핀 꽃"] as const;
