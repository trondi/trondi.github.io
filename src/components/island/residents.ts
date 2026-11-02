import { SPECIES_BY_ID } from "./fish";
import { MOCHA } from "./mocha";
import {
  type ChatCtx, type GiftItem, MAX_HEARTS, type Resident, dayKey, daysBetween, facts, timeSlot,
} from "./resident-core";
import type { IslandSave, NpcState } from "./save";
import type { WeatherKind } from "./weather";
import { DANPUNG, DUNGI, MONGSIL, SEOLGI, TORI } from "./villagers";

export { MAX_HEARTS, shuffled, type GiftItem, type Resident } from "./resident-core";

export const RESIDENTS: Record<string, Resident> = { mocha: MOCHA, danpung: DANPUNG, mongsil: MONGSIL, seolgi: SEOLGI, tori: TORI, dungi: DUNGI };

const EMPTY: NpcState = { talks: 0, hearts: 0, lastTalk: null, lastGift: null };

/** 모카는 예전 저장(npc)을 그대로 쓰고, 다른 주민은 npcs에 */
export function npcState(save: IslandSave, id: string): NpcState {
  return (id === "mocha" ? save.npc : save.npcs?.[id]) ?? EMPTY;
}

function setNpcState(save: IslandSave, id: string, st: NpcState) {
  if (id === "mocha") save.npc = st;
  else save.npcs = { ...save.npcs, [id]: st };
}

function specialDay(d: Date) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 1 && day === 1) return "새해 복 많이 받아! 올해도 자주 놀러 와 🎍";
  if (m === 2 && day === 14) return "오늘 발렌타인데이래! 달콤한 하루 보내 💝";
  if (m === 10 && day === 31) return "해피 할로윈! 🎃 간식 안 주면 장난칠 거야~";
  if (m === 12 && (day === 24 || day === 25)) return "메리 크리스마스! 🎄 산타가 이 섬에도 올까?";
  if (m === 12 && day === 31) return "올해 마지막 날이네. 올 한 해도 정말 수고했어!";
  return null;
}

/** 대화를 처음 열 때의 인사 — 처음 만남·오늘 또 옴·오랜만·시간대 */
export function greet(r: Resident, ctx: ChatCtx): string[] {
  const st = npcState(ctx.save, r.id);
  const today = dayKey(ctx.now);
  const lines: string[] = [];
  if (!st.talks) lines.push(r.intro);
  else if (st.lastTalk === today) lines.push(r.again[st.talks % 3 ? 0 : 1]);
  else if (st.lastTalk && daysBetween(st.lastTalk, today) >= 3) lines.push(r.longAgo(daysBetween(st.lastTalk, today)));
  else lines.push(r.timeGreet[timeSlot(ctx.now.getHours())]);
  const sp = specialDay(ctx.now);
  if (sp && st.lastTalk !== today) lines.push(sp);
  return lines;
}

/** 주민마다 날씨 이야기 — 비·눈·뇌우·안개일 때 수다 맨 앞에 끼워 넣는다 */
const WEATHER_TALK: Record<string, Partial<Record<WeatherKind, string>>> = {
  mocha: { rain: "비 온다! 털이 젖으면 냄새나서 싫은데… 그래도 빗소리는 좋아 🌧️", snow: "눈이다!! 나도 모르게 뛰어다니게 돼! ❄️", storm: "천둥 무서워… 오늘은 집 근처에 꼭 붙어 있을래 ⛈️", fog: "안개 때문에 코로만 길을 찾고 있어. 킁킁!" },
  danpung: { rain: "비 오는 날엔 과수원 나무 밑이 최고야. 흐흥, 여기 비 안 맞거든!", snow: "눈 위에 발자국 찍기 놀이 하자! 내가 먼저 찍었다~", storm: "번개 칠 때마다 꼬리가 빵빵해져… 웃지 마!", fog: "안개 낀 날엔 숨바꼭질 필승이야. 날 찾아봐!" },
  mongsil: { rain: "빗소리… 시 쓰기 좋은 날이야. 「톡, 톡, 연못이 웃는다」…", snow: "눈이 털에 쌓이면… 나 하얀 알파카 돼.", storm: "천둥이 치면 구름이 화난 거래… 금방 풀릴 거야.", fog: "안개 속 연못은 꿈속 같아… 천천히 걸어." },
  seolgi: { rain: "비 오는 날 바다 수영 최고!! …아, 감기 걸린다고? 괜찮아!", snow: "눈이다!!! 허스키의 계절이야!! 같이 뒹굴자!!", storm: "번개 치는 바다는 위험해! 오늘은 모래사장에서만 놀자.", fog: "안개 때문에 바다가 안 보여! 냄새로 찾아갈 거야!" },
  tori: { rain: "비가 오면 꽃들이 물을 마셔서 좋아해요… 저도 좋아요.", snow: "눈꽃이 피었어요… 꽃밭이 하얘졌어요.", storm: "처, 천둥이요…? 저 몽실 언니한테 가 있어도 될까요…", fog: "안개 속에선 제가 더 잘 숨어요… 헤헤." },
  dungi: { rain: "비 온다냥… 오늘은 다리 밑에서 한 발짝도 안 나간다냥.", snow: "눈은 차갑다냥! 발 시려… 그래도 조금 예쁘긴 하다냥.", storm: "천둥 싫다냥!! 이불 속에 들어가 있고 싶다냥 😿", fog: "안개 낀 날은 사냥하기 좋다냥. 나비가 안 보이지만." },
};

export function chatLines(r: Resident, ctx: ChatCtx) {
  const lines = r.chat(ctx, facts(ctx.save), npcState(ctx.save, r.id));
  const w = ctx.weather ? WEATHER_TALK[r.id]?.[ctx.weather] : undefined;
  return w ? { contextual: lines.contextual, general: lines.general, weather: w } : { ...lines, weather: undefined as string | undefined };
}

export type GiftResult = { line: string; heart: boolean; reward: number; given: boolean };

/** 하트가 이 수가 되면 고마움의 표시로 꽃씨를 준다 */
const REWARDS: Record<number, number> = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 5 };

/** 선물에 대한 반응을 정하고 저장 데이터를 바꾼다 (save를 직접 고친다) */
export function giveGift(r: Resident, save: IslandSave, item: GiftItem, now: Date): GiftResult {
  const st = { ...npcState(save, r.id) };
  const today = dayKey(now);
  const none = (line: string): GiftResult => ({ line, heart: false, reward: 0, given: false });
  if (st.lastGift === today) return none(r.already);
  let species = null;
  if (item.kind === "apple") {
    if (save.bag.apple <= 0) return none("어라, 사과가 없는걸?");
    save.bag.apple -= 1;
  } else if (item.kind === "orange") {
    if (save.bag.orange <= 0) return none("어라, 오렌지가 없는걸?");
    save.bag.orange -= 1;
  } else {
    species = SPECIES_BY_ID.get(item.id) ?? null;
    if (!species || !save.fish[item.id]) return none("어라, 그 물고기는 없는걸?");
    save.fish[item.id] -= 1;
    if (save.fish[item.id] <= 0) delete save.fish[item.id];
  }
  const { line, heart } = r.react(item, species);
  st.lastGift = today;
  let reward = 0;
  if (heart && st.hearts < MAX_HEARTS) {
    st.hearts += 1;
    reward = REWARDS[st.hearts] ?? 0;
    save.bag.seed += reward;
  }
  setNpcState(save, r.id, st);
  return { line, heart, reward, given: true };
}

/** 대화를 열 때 한 번 — 수다 횟수와 날짜를 남긴다 */
export function recordTalk(r: Resident, save: IslandSave, now: Date) {
  const st = { ...npcState(save, r.id) };
  st.talks += 1;
  st.lastTalk = dayKey(now);
  setNpcState(save, r.id, st);
}
