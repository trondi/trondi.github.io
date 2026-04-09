export type Season = "spring" | "summer" | "autumn" | "winter";

export function getSeason(): Season {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export const SEASON_CONFIG = {
  spring: {
    count: 120,
    color: [1.0, 0.72, 0.77] as [number, number, number],
    darkColor: [0.9, 0.55, 0.65] as [number, number, number],
    gravity: 0.06,
    sway: 0.9,
    rotSpeed: 0.8,
    size: [4.0, 9.0] as [number, number],
    spread: [22, 14, 6] as [number, number, number],
    label: "봄 · 벚꽃",
    emoji: "🌸",
  },
  summer: {
    count: 80,
    color: [0.95, 0.95, 0.55] as [number, number, number],
    darkColor: [0.7, 1.0, 0.4] as [number, number, number],
    gravity: 0.01,
    sway: 1.2,
    rotSpeed: 0.3,
    size: [3.0, 6.0] as [number, number],
    spread: [20, 12, 5] as [number, number, number],
    label: "여름 · 반딧불",
    emoji: "🌿",
  },
  autumn: {
    count: 100,
    color: [0.88, 0.42, 0.12] as [number, number, number],
    darkColor: [0.75, 0.35, 0.1] as [number, number, number],
    gravity: 0.1,
    sway: 1.4,
    rotSpeed: 1.2,
    size: [5.0, 11.0] as [number, number],
    spread: [22, 14, 4] as [number, number, number],
    label: "가을 · 낙엽",
    emoji: "🍂",
  },
  winter: {
    count: 160,
    color: [0.92, 0.96, 1.0] as [number, number, number],
    darkColor: [0.75, 0.85, 1.0] as [number, number, number],
    gravity: 0.04,
    sway: 0.5,
    rotSpeed: 0.2,
    size: [2.0, 7.0] as [number, number],
    spread: [22, 14, 3] as [number, number, number],
    label: "겨울 · 눈",
    emoji: "❄️",
  },
} as const;
