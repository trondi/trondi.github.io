import type { Season } from "@/lib/season";

import { SPECIES, SPECIES_BY_ID, type Species } from "./fish";
import { GLASSES, HATS, type IslandSave, type NpcState, flowerStage } from "./save";
import type { WeatherKind } from "./weather";

/** 섬 주민 공통 — 주민마다 말투·좋아하는 것만 다르고 대화 흐름은 같다 */

export const MAX_HEARTS = 5;

export type ChatCtx = { now: Date; season: Season; save: IslandSave; weather?: WeatherKind | null };
export type Question = [string, [string, string], [string, string]];
export type GiftItem = { kind: "apple" } | { kind: "orange" } | { kind: "fish"; id: string };
export type GiftReaction = { line: string; heart: boolean };

export type Resident = {
  id: string;
  name: string;
  /** 이름표 색 */
  color: string;
  intro: string;
  /** 같은 날 다시 왔을 때 */
  again: [string, string];
  longAgo: (days: number) => string;
  /** 아침·낮·저녁·밤 인사 */
  timeGreet: [string, string, string, string];
  tips: string[];
  questions: Question[];
  chat: (ctx: ChatCtx, f: Facts, st: NpcState) => { contextual: string[]; general: string[] };
  react: (item: GiftItem, species: Species | null) => GiftReaction;
  already: string;
  reward: (seeds: number, bestFriend: boolean) => string;
  recIntro: string;
};

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function timeSlot(h: number) {
  if (h >= 5 && h < 11) return 0;
  if (h >= 11 && h < 17) return 1;
  if (h >= 17 && h < 20) return 2;
  return 3;
}

/** 대화에 쓰는 섬 기록 요약 */
export type Facts = {
  hat: string;
  hatName: string | null;
  glassesName: string | null;
  dexCount: number;
  dexTotal: number;
  best: { s: Species; cm: number } | null;
  caught: (id: string) => boolean;
  fishInBag: boolean;
  bloomed: number;
  planted: number;
  seeds: number;
  apples: number;
  oranges: number;
};

export function facts(save: IslandSave): Facts {
  const hat = save.look?.hat ?? "none";
  const glasses = save.look?.glasses ?? "none";
  const dexIds = Object.keys(save.dex).filter((id) => !SPECIES_BY_ID.get(id)?.junk);
  const best =
    dexIds
      .map((id) => ({ s: SPECIES_BY_ID.get(id)!, cm: save.dex[id].best }))
      .sort((a, b) => b.cm - a.cm)[0] ?? null;
  return {
    hat,
    hatName: hat === "none" ? null : HATS.find((x) => x.id === hat)?.name ?? null,
    glassesName: glasses === "none" ? null : GLASSES.find((g) => g.id === glasses)?.name ?? null,
    dexCount: dexIds.length,
    dexTotal: SPECIES.filter((s) => !s.junk).length,
    best,
    caught: (id) => !!save.dex[id],
    fishInBag: Object.values(save.fish).some((n) => n > 0),
    bloomed: save.flowers.filter((f) => flowerStage(f.at) >= 3).length,
    planted: save.flowers.length,
    seeds: save.bag.seed,
    apples: save.bag.apple,
    oranges: save.bag.orange,
  };
}

/** 같은 대화 안에서는 겹치지 않게 섞는다 */
export function shuffled<T>(items: T[], seed: number) {
  const a = [...items];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
