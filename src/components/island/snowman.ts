import type { IslandSave } from "./save";
import type { WeatherKind } from "./weather";

/**
 * 크리스마스 시즌에만 서 있는 눈사람 둘 — 마을 광장의 눈송이, 바닷가 꽃밭 마을의 몽글이.
 * 주민처럼 친밀도나 선물은 없고, 날짜·시간·날씨에 맞춰 말을 건네고 가끔 질문을 던진다.
 */
export type SnowmanId = "village" | "hamlet";

export const SNOWMEN: Record<SnowmanId, { name: string; color: string; greet: string }> = {
  village: { name: "눈송이", color: "#6fa8d6", greet: "안녕! 나는 광장 지킴이 눈송이야 ⛄ 말 걸어 줘서 고마워!" },
  hamlet: { name: "몽글이", color: "#8fb8de", greet: "어… 안녕… 나는 몽글이야 ⛄ 꽃밭 마을 앞마당을 지키고 있어." },
};

const daysUntil = (now: Date, month: number, day: number) => {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(now.getFullYear(), month, day);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
};

/** 지금 할 수 있는 이야기 — first는 그날에만 하는 이야기(먼저 꺼낸다), general은 섞어서 꺼내는 이야기 */
export function snowmanLines(id: SnowmanId, ctx: { now: Date; save: IslandSave | null; weather: WeatherKind | null }) {
  const { now, save, weather } = ctx;
  const m = now.getMonth();
  const d = now.getDate();
  const h = now.getHours();
  const first: string[] = [];
  // 크리스마스·새해
  if (m === 11 && d === 24) first.push("내일이 크리스마스야!! 오늘 밤엔 굴뚝 쪽을 잘 봐 둬. 🎅");
  else if (m === 11 && d === 25) first.push("메리 크리스마스!! 🎄 오늘은 섬 전체가 반짝반짝해!");
  else if (m === 11 && d > 25) first.push("산타 할아버지 다녀가셨어? 나는 당근 하나 더 받았으면 했는데…");
  else if (m === 0) first.push("새해 복 많이 받아! 🎍 올해도 같이 놀자.");
  else if (m === 10 || m === 11) first.push(`크리스마스까지 ${daysUntil(now, 11, 25)}일 남았어! 손꼽아 기다리는 중이야.`);
  // 날씨
  if (weather === "snow") first.push("눈이 온다!! 친구들이 하늘에서 내려오는 거야. 너무 신나! ❄️");
  else if (weather === "rain") first.push("비가 오면 조금 걱정돼… 내 몸이 줄어들면 어떡하지?");
  else if (weather === "clear" && h >= 11 && h < 16) first.push("햇볕이 쨍쨍하네… 그늘로 가고 싶은데 발이 없어. 히히.");
  else if (weather === "fog") first.push("안개 속에선 내가 구름이 된 기분이야. 몽글몽글~");

  const general: string[] = [];
  if (h >= 20 || h < 5) general.push("밤엔 집집마다 전구가 반짝여서 하나도 안 무서워. 다리 위 전구도 봤어?");
  else if (h < 10) general.push("아침 햇살은 반가운데 조금 무서워… 녹을까 봐!");
  const gifts = save?.xmasGifts;
  const today = `${now.getFullYear()}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const opened = gifts?.day === today ? gifts.opened.length : 0;
  if (opened < 3) general.push("집 오른쪽 큰 트리 밑에 선물 상자 있는 거 알아? 하루에 세 개씩 열 수 있대!");
  else general.push("오늘 선물 상자 다 열었구나! 내일 또 새로 생긴대.");
  general.push(
    "마을 크리스마스 트리를 흔들면 하루에 한 번 돈주머니가 떨어진대. 쉿, 비밀이야.",
    "내 코는 당근이야. 배고파도 먹으면 안 돼!",
    "목도리는 설기가 둘러 줬어. 나는 안 추운데… 그래도 따뜻한 기분이야.",
    "트리 꼭대기 별을 보면 소원을 빌고 싶어져. 너도 하나 빌어 봐!",
    "단풍이가 내 모자를 몰래 가져가려다 들켰어. 흐흥, 나도 눈이 있다구.",
    "겨울이 끝나면 어디 가냐고? 비밀이야… 내년 겨울에 또 만나!",
  );
  if (id === "village") {
    general.push(
      "여기 광장에선 모카랑 둥이가 맨날 뛰어다녀. 나도 같이 놀고 싶은데 발이 없어…",
      "바닷가 꽃밭 마을에 내 동생 몽글이가 있어. 만나면 안부 전해 줘!",
      "우편함에 편지가 오면 빨간 깃발이 올라가. 내가 늘 지켜보고 있지!",
    );
  } else {
    general.push(
      "모카네, 토리네, 설기네가 나란히 있어서 밤이면 창문 불빛이 셋이야. 따뜻해…",
      "파도 소리 들려? 나는 이 소리 들으면서 잠들어… 눈사람도 자냐고? 응, 서서 자.",
      "광장에 있는 눈송이 형은 나보다 말이 많아. 나는 조용한 게 좋아…",
    );
  }
  return { first, general };
}

/** 가끔 던지는 질문 — [질문, [대답, 눈사람 반응] × 2] */
export const SNOWMAN_QUESTIONS: [string, [string, string], [string, string]][] = [
  ["눈싸움 좋아해?", ["좋아!", "그럼 나는 던질 손이 없으니까 응원 담당 할게!"], ["별로…", "그럼 눈사람 만들기는 어때? 내 친구를 만들어 줘!"]],
  ["산타 할아버지 믿어?", ["믿어!", "나도! 굴뚝 있는 집부터 들르신대."], ["음…", "괜찮아, 선물을 받으면 믿게 될 거야. 히히."]],
  ["크리스마스에 뭐 받고 싶어?", ["선물!", "나는 안 녹는 마법 목도리!"], ["눈!", "역시 뭘 아는구나! 하얀 크리스마스가 최고야!"]],
  ["따뜻한 코코아 좋아해?", ["좋아!", "나는 마시면 녹으니까… 네가 두 잔 마셔 줘!"], ["차가운 게 좋아", "통했다! 우리 친구 하자 ⛄"]],
];
