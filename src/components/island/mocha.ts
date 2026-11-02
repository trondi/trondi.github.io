import type { Season } from "@/lib/season";

import { SPECIES, SPECIES_BY_ID } from "./fish";
import { GLASSES, HATS, type IslandSave, type NpcState, flowerStage } from "./save";

/**
 * 섬 주민 모카(시바견)의 대화 — 시간·계절·요일, 옷차림, 낚시·꽃 기록, 친밀도에 따라 달라진다.
 * 서버 없이 미리 써 둔 대사에서 고른다.
 */

export const NPC_NAME = "모카";
export const MAX_HEARTS = 5;

export const TIPS = [
  "나무를 흔들면 가끔 꽃씨가 떨어져. 나무마다 하루에 한 번이야!",
  "과일나무는 열매를 따도 다음 날이면 다시 열려. 강 건너에 과수원도 있어!",
  "우편함 위에 빨간 느낌표가 보이면 새 글 편지가 온 거야.",
  "꽃씨는 가방에서 꺼내 심을 수 있어. 시간이 지나면 조금씩 자라!",
  "가방에서 낚싯대를 꺼내 물을 탭해 봐. 찌가 쑥 들어갈 때 바로 탭해야 해!",
  "강, 위쪽 숲의 연못, 남쪽 바다에서 사는 물고기가 달라. 밤에만 나오는 애들도 있대.",
  "뒤쪽 언덕은 경사로로 올라갈 수 있어. 연못가 벤치가 내 비밀 장소야.",
  "집에 있는 옷장에서 옷이랑 모자를 바꿀 수 있어.",
  "선착장 끝에서 낚싯대를 던지면 바다 물고기가 잘 잡혀. 옆에 배도 한 척 있어!",
  "과일이나 물고기를 나한테 선물해 줄 수도 있어. 하루에 한 번이면 충분해!",
];

/** 대답을 고르는 질문 — [질문, [대답, 모카의 반응] × 2] */
export const QUESTIONS: [string, [string, string], [string, string]][] = [
  ["너는 강아지파야, 고양이파야?", ["강아지!", "역시! 우린 잘 맞을 줄 알았어 🐶"], ["고양이…", "흥, 괜찮아. 나도 고양이 귀엽다고 생각해… 조금은."]],
  ["아침형이야, 저녁형이야?", ["아침형", "부지런하구나! 나도 해 뜨면 눈이 번쩍 떠져."], ["저녁형", "밤에 집중이 잘 되지? trond도 밤에 글을 많이 써."]],
  ["여름이 좋아, 겨울이 좋아?", ["여름", "수박! 바다! 나도 여름 좋아 🍉"], ["겨울", "눈밭에서 뒹구는 거 최고지! ❄️"]],
  ["섬에서 뭐가 제일 재밌어?", ["낚시", "손맛 알지? 나는 옆에서 구경하는 게 재밌어."], ["옷 갈아입기", "나도 옷장 구경 좋아해! 다음엔 뭐 입을 거야?"]],
  ["요즘 잘 자?", ["푹 자", "다행이다. 잘 자는 게 제일 중요해."], ["잘 못 자…", "따뜻한 우유 마시고 일찍 누워 봐. 오늘은 휴대폰도 조금만 보고 🌙"]],
  ["오늘 기분은 어때?", ["좋아!", "꼬리가 저절로 흔들린다! 🐕"], ["그저 그래", "그럴 땐 산책이 최고야. 섬 한 바퀴 같이 걸을래?"]],
  ["커피파야, 차파야?", ["커피", "trond도 커피 없인 글을 못 쓴대 ☕"], ["차", "차 마시면 마음이 차분해지지 🍵"]],
  ["좋아하는 음식 있어?", ["달콤한 거", "나도! 고구마 맛탕 최고 🍠"], ["매운 거", "헉, 나는 매운 거 먹으면 혀에 불나… 🔥"]],
  ["바다가 좋아, 산이 좋아?", ["바다", "파도 소리 들으면서 낮잠 자는 거 최고야 🌊"], ["산", "섬 뒤쪽 언덕도 꽤 높아! 올라가 봤어?"]],
  ["비 오는 날 좋아해?", ["좋아", "빗소리 들으면서 뒹굴뒹굴… 알지 알지."], ["별로", "나도 털이 젖으면 냄새나서 싫어 😣"]],
];

const LOVED_FISH = new Set(["tuna", "salmon", "seabream", "koi"]);

export type MochaCtx = {
  now: Date;
  season: Season;
  save: IslandSave;
};

export function npcState(save: IslandSave): NpcState {
  return save.npc ?? { talks: 0, hearts: 0, lastTalk: null, lastGift: null };
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function timeGreeting(h: number) {
  if (h >= 5 && h < 11) return "좋은 아침이야! ☀️ 오늘도 섬에 와 줘서 고마워.";
  if (h >= 11 && h < 17) return "왔구나! 오늘 하루는 어때?";
  if (h >= 17 && h < 20) return "노을이 예쁘지? 이 시간 섬이 제일 좋아.";
  return "이 시간까지 깨어 있구나 🌙 너무 무리하지 마.";
}

function specialDay(d: Date) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 1 && day === 1) return "새해 복 많이 받아! 올해도 자주 놀러 와 🎍";
  if (m === 2 && day === 14) return "오늘 발렌타인데이래! 나한테는… 사과 주면 돼 🍎";
  if (m === 10 && day === 31) return "해피 할로윈! 🎃 간식 안 주면 장난칠 거야~";
  if (m === 12 && (day === 24 || day === 25)) return "메리 크리스마스! 🎄 산타가 이 섬에도 올까?";
  if (m === 12 && day === 31) return "올해 마지막 날이네. 올 한 해도 정말 수고했어!";
  return null;
}

/** 대화를 처음 열 때의 인사 — 처음 만남·오늘 또 옴·오랜만·시간대 */
export function greet(ctx: MochaCtx): string[] {
  const st = npcState(ctx.save);
  const today = dayKey(ctx.now);
  const lines: string[] = [];
  if (!st.talks) lines.push("안녕! 나는 모카야 🐾 이 섬을 지키는 시바견이지. 만나서 반가워!");
  else if (st.lastTalk === today) lines.push(st.talks % 3 ? "또 왔네? 헤헤, 심심했구나!" : "오늘만 벌써 몇 번째야? 나 인기 많은가 봐 😆");
  else if (st.lastTalk && daysBetween(st.lastTalk, today) >= 3) lines.push(`오랜만이야! ${daysBetween(st.lastTalk, today)}일 만이네. 보고 싶었어 🥺`);
  else lines.push(timeGreeting(ctx.now.getHours()));
  const sp = specialDay(ctx.now);
  if (sp && st.lastTalk !== today) lines.push(sp);
  return lines;
}

/** 지금 상황에 맞는 수다 거리 — 앞쪽일수록 상황에 딱 맞는 말 */
export function chatLines(ctx: MochaCtx): { contextual: string[]; general: string[] } {
  const { now, season, save } = ctx;
  const h = now.getHours();
  const st = npcState(save);
  const contextual: string[] = [];
  const general: string[] = [];

  // 옷차림
  const hat = save.look?.hat ?? "none";
  const glasses = save.look?.glasses ?? "none";
  if (hat === "crown") contextual.push("왕관?! 오늘은 네가 이 섬의 왕이야 👑");
  else if (hat === "antler") contextual.push("사슴뿔이다! 루돌프 같아 🦌");
  else if (hat === "headphones") contextual.push("무슨 노래 들어? 나도 같이 들을래 🎧");
  else if (hat === "hardhat") contextual.push("안전모까지 쓰고… 오늘 뭐 지을 거야? 🔨");
  else if (hat === "elf") contextual.push("요정 모자 귀엽다! 숲속 요정인 줄 알았어 🧚");
  else if (hat === "grad") contextual.push("학사모! 졸업 축하해… 아니면 그냥 멋 낸 거야? 🎓");
  else if (hat !== "none") {
    const name = HATS.find((x) => x.id === hat)?.name;
    if (name) contextual.push(`${name} 잘 어울린다! 나도 하나 써 보고 싶어.`);
  }
  if (glasses !== "none") contextual.push(`${GLASSES.find((g) => g.id === glasses)?.name ?? "선글라스"} 멋진데? 눈부신 날엔 딱이야 😎`);

  // 낚시
  const dexIds = Object.keys(save.dex).filter((id) => !SPECIES_BY_ID.get(id)?.junk);
  const total = SPECIES.filter((s) => !s.junk).length;
  if (!dexIds.length) contextual.push("아직 낚시 안 해 봤어? 가방에서 낚싯대를 꺼내 봐! 찌가 쑥 들어가면 탭!");
  else {
    contextual.push(
      dexIds.length >= total
        ? `도감을 다 채웠다고?! ${total}종 전부? 너 진짜 낚시왕이구나 🏆`
        : `도감에 벌써 ${dexIds.length}종이나 모았네! 다 모으면 ${total}종이야.`,
    );
    const best = dexIds
      .map((id) => ({ s: SPECIES_BY_ID.get(id)!, cm: save.dex[id].best }))
      .sort((a, b) => b.cm - a.cm)[0];
    if (best) contextual.push(`${best.s.name} ${best.cm}cm 잡았다며? 섬에 소문 다 났어!`);
    if (save.dex.anglerfish) contextual.push("아귀 잡았어? 밤바다는 무섭지 않았어? 😨");
  }
  if (Object.values(save.fish).some((n) => n > 0)) contextual.push("가방에서 생선 냄새가 솔솔 나는데…? 킁킁 🐟");

  // 꽃·과일
  const bloomed = save.flowers.filter((f) => flowerStage(f.at) >= 3).length;
  if (bloomed) contextual.push(`네가 심은 꽃이 ${bloomed > 1 ? `${bloomed}송이나 ` : ""}활짝 폈더라 🌷 벌이 좋아하겠어.`);
  else if (save.flowers.length) contextual.push("심어 둔 꽃은 잘 자라고 있어? 내가 가끔 물 주고 있어 💧");
  else if (save.bag.seed > 0) contextual.push("꽃씨가 있으면 심어 봐! 꽃이 피면 섬이 더 예뻐져.");
  if (save.bag.apple >= 5) contextual.push("사과가 많네! 하나만… 아니 두 개만 나눠 줄래? 🍎");

  // 친밀도
  if (st.hearts >= MAX_HEARTS) contextual.push("우리 이제 단짝이지? 🐾 너만 오면 꼬리가 멈추질 않아.");
  else if (st.hearts >= 3) contextual.push("너랑 얘기하는 게 하루 중 제일 즐거워.");
  if (st.talks >= 20) contextual.push(`벌써 우리 ${st.talks}번째 수다야. 나 너 많이 좋아하나 봐.`);

  // 시간대
  if (h >= 5 && h < 11) general.push("아침 산책은 최고야. 풀잎에 이슬이 반짝반짝해.", "아침밥 먹었어? 나는 벌써 두 그릇 먹었지 🍚");
  else if (h >= 11 && h < 17) general.push("점심 먹고 나면 꼭 졸리더라… 하암.", "햇볕 좋은 데 엎드려 있는 게 내 오후 일과야.");
  else if (h >= 17 && h < 20) general.push("어디서 고구마 굽는 냄새가 나… 킁킁.", "해 질 녘엔 바다가 주황색으로 물들어. 선착장에 가 봐!");
  else general.push("밤엔 반딧불이가 나와. 강가에 가 봤어?", "별 보는 거 좋아해? 언덕 위가 제일 잘 보여 ✨", "졸리면 언제든 들어가서 자. 섬은 내가 지킬게.");

  // 계절
  if (season === "spring") general.push("봄바람에 꽃가루가 날려서 자꾸 재채기가 나… 에취!", "벚꽃 필 때 섬이 제일 예뻐. 분홍색 눈이 오는 것 같아 🌸");
  else if (season === "summer") general.push("더워서 혀가 자꾸 나와 😛 그늘이 최고야.", "여름엔 강물에 발 담그는 게 제일 좋아.");
  else if (season === "autumn") general.push("가을엔 고구마가 제일 맛있어. 군고구마 냄새만 맡아도 행복해 🍠", "낙엽 밟는 소리 좋지 않아? 바스락바스락.");
  else general.push("눈 오는 날엔 나도 모르게 뛰어다니게 돼! ❄️", "추우면 꼬리로 코를 덮고 자. 따뜻하거든.");

  // 요일
  const wd = now.getDay();
  if (wd === 1) general.push("월요일이네. 이번 주도 천천히 가 보자.");
  else if (wd === 5) general.push("금요일이다! 주말에 뭐 할 거야?");
  else if (wd === 0 || wd === 6) general.push("주말엔 trond도 좀 쉬었으면 좋겠는데… 또 글 쓰고 있을지도 몰라.");

  // 모카 이야기
  general.push(
    "어제 꼬리 쫓다가 한 시간이 지났어. 결국 못 잡았지 🐕",
    "우편함 옆이 내 낮잠 명당이야. 비밀이야!",
    "trond는 글 쓰다 막히면 섬을 한 바퀴 돈대. 그럴 땐 나도 같이 걸어.",
    "아까 뼈다귀 모양 구름을 봤어! 너도 봤어?",
    "냄새로 날씨를 맞힐 수 있어. 오늘은… 음, 맑음!",
    "산책할 땐 꼭 같은 길로만 가게 돼. 익숙한 게 좋거든.",
    "물고기는 좋아하는데 물은 조금 무서워. 비밀이야 🤫",
    "집 앞 우물에 동전 던지면 소원이 이뤄진대. 나는 간식 많이 달라고 빌었어.",
  );
  return { contextual, general };
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

export type GiftItem = { kind: "apple" } | { kind: "orange" } | { kind: "fish"; id: string };
export type GiftResult = { line: string; heart: boolean; reward: number; given: boolean };

/** 하트가 이 수가 되면 고마움의 표시로 꽃씨를 준다 */
const REWARDS: Record<number, number> = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 5 };

/** 선물에 대한 반응을 정하고 저장 데이터를 바꾼다 (save를 직접 고친다) */
export function giveGift(save: IslandSave, item: GiftItem, now: Date): GiftResult {
  const st = { ...npcState(save) };
  const today = dayKey(now);
  if (st.lastGift === today) {
    return { line: "오늘은 벌써 선물 받았어! 마음만 받을게 ☺️ 내일 또 와 줘.", heart: false, reward: 0, given: false };
  }
  let line: string;
  let heart = true;
  if (item.kind === "apple") {
    if (save.bag.apple <= 0) return { line: "어라, 사과가 없는걸?", heart: false, reward: 0, given: false };
    save.bag.apple -= 1;
    line = "사과다! 아삭아삭 🍎 역시 사과가 최고야. 고마워!";
  } else if (item.kind === "orange") {
    if (save.bag.orange <= 0) return { line: "어라, 오렌지가 없는걸?", heart: false, reward: 0, given: false };
    save.bag.orange -= 1;
    line = "오렌지! 좀 시큼하지만… 네가 준 거니까 맛있어 🍊";
  } else {
    const s = SPECIES_BY_ID.get(item.id);
    if (!s || !save.fish[item.id]) return { line: "어라, 그 물고기는 없는걸?", heart: false, reward: 0, given: false };
    save.fish[item.id] -= 1;
    if (save.fish[item.id] <= 0) delete save.fish[item.id];
    if (s.junk) {
      heart = false;
      line = s.id === "boot" ? "…이건 장화잖아! 😂 그래도 웃겨 줘서 고마워." : "빈 깡통…? 섬 청소해 준 걸로 칠게! ♻️";
    } else if (LOVED_FISH.has(s.id)) line = `헉, ${s.name}?! 이건 진짜 귀한 건데… 너 최고야!! ${s.emoji}`;
    else line = `${s.name}! 오늘 저녁은 생선이다 ${s.emoji} 고마워!`;
  }
  st.lastGift = today;
  let reward = 0;
  if (heart && st.hearts < MAX_HEARTS) {
    st.hearts += 1;
    reward = REWARDS[st.hearts] ?? 0;
    save.bag.seed += reward;
  }
  save.npc = st;
  return { line, heart, reward, given: true };
}

/** 대화를 열 때 한 번 — 수다 횟수와 날짜를 남긴다 */
export function recordTalk(save: IslandSave, now: Date) {
  const st = { ...npcState(save) };
  st.talks += 1;
  st.lastTalk = dayKey(now);
  save.npc = st;
}
