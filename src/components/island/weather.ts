/**
 * 섬 날씨 — 서울의 지금 날씨를 Open-Meteo(무료, API 키 없음, CC BY 4.0)에서 받아 온다.
 * 모든 방문자에게 같은 "trond 섬의 날씨"가 보이고, 위치 권한은 묻지 않는다.
 * 받아 오지 못하면 null — 섬은 계절 효과만 보여 준다.
 */

export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";
export type Weather = { kind: WeatherKind; temp: number; label: string; emoji: string; at: number };

export const WEATHER_PLACE = "서울";
const LAT = 37.5665;
const LON = 126.978;
const KEY = "trond-island:weather";
/** 이만큼 지나면 다시 받아 온다 */
export const WEATHER_TTL = 20 * 60_000;

const INFO: Record<WeatherKind, { label: string; emoji: string }> = {
  clear: { label: "맑음", emoji: "☀️" },
  cloudy: { label: "흐림", emoji: "☁️" },
  fog: { label: "안개", emoji: "🌫️" },
  rain: { label: "비", emoji: "🌧️" },
  snow: { label: "눈", emoji: "🌨️" },
  storm: { label: "뇌우", emoji: "⛈️" },
};

/** WMO 날씨 코드 → 섬 날씨 */
export function kindOf(code: number, cloudCover = 0): WeatherKind {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code === 3 || (code === 2 && cloudCover > 70)) return "cloudy";
  return "clear";
}

export function makeWeather(kind: WeatherKind, temp: number, at = Date.now()): Weather {
  return { kind, temp, at, ...INFO[kind] };
}

function readCache(): Weather | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const w = JSON.parse(raw) as Weather;
    return Date.now() - w.at < WEATHER_TTL && INFO[w.kind] ? w : null;
  } catch {
    return null;
  }
}

export async function fetchWeather(): Promise<Weather | null> {
  const cached = readCache();
  if (cached) return cached;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      "&current=weather_code,cloud_cover,temperature_2m&timezone=Asia%2FSeoul";
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { current?: { weather_code?: number; cloud_cover?: number; temperature_2m?: number } };
    const c = data.current;
    if (!c || typeof c.weather_code !== "number") return null;
    const w = makeWeather(kindOf(c.weather_code, c.cloud_cover), Math.round(c.temperature_2m ?? 0));
    try {
      window.localStorage.setItem(KEY, JSON.stringify(w));
    } catch {
      // 저장 못 해도 괜찮다
    }
    return w;
  } catch {
    return null;
  }
}
