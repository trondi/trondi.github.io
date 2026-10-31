import type { Season } from "@/lib/season";

import type { WaterKind } from "./terrain";

/** 낚을 수 있는 것들 — 물 종류·시간·계절에 따라 나온다 */

export type FishShape = "slim" | "round" | "long" | "flat" | "squid" | "can" | "boot";

export type Species = {
  id: string;
  name: string;
  emoji: string;
  where: WaterKind[];
  /** 클수록 자주 나온다 */
  weight: number;
  size: [number, number];
  color: string;
  belly: string;
  shape: FishShape;
  night?: boolean;
  seasons?: Season[];
  junk?: boolean;
  /** Cute Fish 팩 모델 이름 — 없으면 코드로 만든 모델 */
  model?: string;
  /** 모델 재질 이름 → 색 (팩 모델을 다른 물고기로 쓸 때) */
  tint?: Record<string, string>;
};

/** 낚시할 때만 불러오는 물고기 모델 */
export const FISH_MODELS = [
  "Anglerfish", "ArmoredCatfish", "Betta", "BlueGoldfish", "BlueTang", "Clownfish", "Flatfish", "Goldfish",
  "Koi", "Lionfish", "Puffer", "RedSnapper", "Tetra", "Tuna", "YellowTang",
] as const;

export const SPECIES: Species[] = [
  { id: "crucian", name: "붕어", emoji: "🐟", where: ["river", "pond"], weight: 10, size: [15, 30], color: "#8a8f6a", belly: "#d9d2a8", shape: "round", model: "Tetra", tint: { Tetra_Main: "#8a8f6a", Tetra_Light: "#d9d2a8", Tetra_Fins: "#6b6f4f" } },
  { id: "chub", name: "피라미", emoji: "🐟", where: ["river"], weight: 10, size: [8, 14], color: "#a9b8c4", belly: "#eef2f5", shape: "slim", model: "Tetra", tint: { Tetra_Main: "#a9b8c4", Tetra_Light: "#eef2f5", Tetra_Fins: "#8497a6" } },
  { id: "goldfish", name: "금붕어", emoji: "🐠", where: ["pond"], weight: 5, size: [8, 15], color: "#f2793a", belly: "#ffd2a8", shape: "round", model: "Goldfish" },
  { id: "carp", name: "잉어", emoji: "🐟", where: ["pond"], weight: 4, size: [40, 80], color: "#b08a4a", belly: "#e8d6a8", shape: "long", model: "Goldfish", tint: { Goldfish_Main: "#b08a4a", Goldfish_Fins: "#8a6a3a" } },
  { id: "koi", name: "비단잉어", emoji: "🐠", where: ["pond"], weight: 1.2, size: [40, 70], color: "#f0803c", belly: "#ffffff", shape: "long", model: "Koi" },
  { id: "catfish", name: "메기", emoji: "🐟", where: ["river", "pond"], weight: 4, size: [40, 90], color: "#5a5248", belly: "#a89f92", shape: "long", night: true, model: "ArmoredCatfish" },
  { id: "sweetfish", name: "은어", emoji: "🐟", where: ["river"], weight: 5, size: [15, 25], color: "#9fae9a", belly: "#f3f1dc", shape: "slim", seasons: ["summer"], model: "Tetra", tint: { Tetra_Main: "#9fae9a", Tetra_Light: "#f3f1dc", Tetra_Fins: "#7d8c78" } },
  { id: "salmon", name: "연어", emoji: "🐟", where: ["river"], weight: 3, size: [60, 90], color: "#7a8796", belly: "#f0a58f", shape: "long", seasons: ["autumn"], model: "RedSnapper", tint: { RedSnapper_Main: "#7a8796", RedSnapper_Light: "#f0a58f", RedSnapper_Fins: "#5f6b78" } },
  { id: "smelt", name: "빙어", emoji: "🐟", where: ["pond", "river"], weight: 8, size: [8, 12], color: "#cfe0e6", belly: "#ffffff", shape: "slim", seasons: ["winter"], model: "Tetra", tint: { Tetra_Main: "#cfe0e6", Tetra_Light: "#ffffff", Tetra_Fins: "#a9c4cc" } },
  { id: "mackerel", name: "고등어", emoji: "🐟", where: ["sea"], weight: 10, size: [25, 40], color: "#3f6f92", belly: "#e6eef2", shape: "slim", model: "BlueTang", tint: { BlueTang_Main: "#3f6f92", BlueTang_Dark: "#1f3a52", BlueTang_Fins: "#e6eef2" } },
  { id: "horsemackerel", name: "전갱이", emoji: "🐟", where: ["sea"], weight: 9, size: [20, 35], color: "#7d97a8", belly: "#f0f3f5", shape: "slim", model: "Tetra", tint: { Tetra_Main: "#7d97a8", Tetra_Light: "#f0f3f5", Tetra_Fins: "#5f7a8c" } },
  { id: "flatfish", name: "넙치", emoji: "🐟", where: ["sea"], weight: 4, size: [35, 70], color: "#8a7a5a", belly: "#f2ece0", shape: "flat", model: "Flatfish" },
  { id: "seabream", name: "참돔", emoji: "🐠", where: ["sea"], weight: 1.4, size: [40, 70], color: "#e8707a", belly: "#ffd8dc", shape: "round", model: "RedSnapper" },
  { id: "puffer", name: "복어", emoji: "🐡", where: ["sea"], weight: 4, size: [15, 30], color: "#d9c27a", belly: "#ffffff", shape: "round", seasons: ["summer", "autumn"], model: "Puffer" },
  { id: "squid", name: "오징어", emoji: "🦑", where: ["sea"], weight: 4, size: [25, 40], color: "#f2c7b6", belly: "#ffffff", shape: "squid", night: true },
  { id: "tuna", name: "참치", emoji: "🐟", where: ["sea"], weight: 0.4, size: [100, 200], color: "#2f4a66", belly: "#d6dee6", shape: "long", model: "Tuna" },
  // Cute Fish 팩으로 늘어난 친구들
  { id: "clownfish", name: "흰동가리", emoji: "🐠", where: ["sea"], weight: 4, size: [8, 12], color: "#f08a3c", belly: "#ffffff", shape: "round", model: "Clownfish" },
  { id: "bluetang", name: "블루탱", emoji: "🐠", where: ["sea"], weight: 3, size: [20, 30], color: "#3f6fd0", belly: "#f5d26b", shape: "round", model: "BlueTang" },
  { id: "yellowtang", name: "옐로탱", emoji: "🐠", where: ["sea"], weight: 3, size: [15, 20], color: "#f5d26b", belly: "#ffffff", shape: "round", model: "YellowTang", seasons: ["summer", "autumn"] },
  { id: "lionfish", name: "쏠배감펭", emoji: "🐠", where: ["sea"], weight: 1.2, size: [25, 38], color: "#c96f5a", belly: "#ffffff", shape: "round", model: "Lionfish" },
  { id: "anglerfish", name: "아귀", emoji: "🐟", where: ["sea"], weight: 1.5, size: [40, 100], color: "#5a3f32", belly: "#a07a5a", shape: "round", model: "Anglerfish", night: true },
  { id: "betta", name: "베타", emoji: "🐠", where: ["pond"], weight: 3, size: [5, 7], color: "#3f4fb0", belly: "#d9534f", shape: "round", model: "Betta" },
  { id: "bluegoldfish", name: "파란 금붕어", emoji: "🐠", where: ["pond"], weight: 0.8, size: [8, 15], color: "#4f7fd0", belly: "#d8ecff", shape: "round", model: "BlueGoldfish" },
  { id: "can", name: "빈 깡통", emoji: "🥫", where: ["river", "pond", "sea"], weight: 1.2, size: [10, 10], color: "#b8c0c8", belly: "#d9534f", shape: "can", junk: true },
  { id: "boot", name: "낡은 장화", emoji: "👢", where: ["river", "pond", "sea"], weight: 0.8, size: [30, 30], color: "#4a5a3a", belly: "#3a4a2a", shape: "boot", junk: true },
];

export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function isNight(h: number) {
  return h >= 19 || h < 5;
}

/** 지금 이 물에서 나올 수 있는 것 중 하나를 뽑는다 */
export function rollCatch(kind: WaterKind, season: Season, hour: number, rand = Math.random) {
  const night = isNight(hour);
  const pool = SPECIES.filter(
    (s) => s.where.includes(kind) && (!s.night || night) && (!s.seasons || s.seasons.includes(season)),
  );
  const total = pool.reduce((a, s) => a + s.weight, 0);
  let r = rand() * total;
  const pick = pool.find((s) => (r -= s.weight) <= 0) ?? pool[0];
  const [lo, hi] = pick.size;
  const size = Math.round(lo + (hi - lo) * Math.pow(rand(), 1.6));
  return { species: pick, size };
}

/** 그림자 크기 — 큰 물고기일수록 큰 그림자 */
export function shadowScale(s: Species) {
  if (s.junk) return 0.7;
  const avg = (s.size[0] + s.size[1]) / 2;
  return avg < 20 ? 0.55 : avg < 50 ? 0.85 : avg < 100 ? 1.15 : 1.6;
}
