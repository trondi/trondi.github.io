/** 섬 진행 상황 — 방문자 브라우저(localStorage)에만 저장된다 */

export type ItemType = "apple" | "orange" | "seed";

export type PlantedFlower = { id: string; x: number; z: number; color: number; at: number };
export type GroundItem = { id: string; type: ItemType; x: number; z: number };
export type Look = { body: "a" | "b"; skin: number };

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
