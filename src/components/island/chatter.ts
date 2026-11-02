import type { Season } from "@/lib/season";

/**
 * 주민끼리 나누는 짧은 대화 — 한 주민(a)이 다른 주민(b)을 찾아가 말풍선으로 주고받는다.
 * lines의 0은 찾아간 쪽(a), 1은 맞이하는 쪽(b).
 */
export type Chatter = {
  a: string;
  b: string;
  lines: [0 | 1, string][];
  when?: (hour: number, season: Season) => boolean;
};

const night = (h: number) => h >= 20 || h < 5;
const morning = (h: number) => h >= 5 && h < 11;

export const CHATTER: Chatter[] = [
  {
    a: "danpung", b: "mocha",
    lines: [[0, "모카야~ 뭐 해?"], [1, "단풍아! 너 혹시 내 뼈다귀 못 봤어?"], [0, "뼈다귀? 글쎄~ 과수원엔 없을걸? 흐흥"], [1, "…너 지금 웃고 있잖아!"], [0, "들켰다! 🦊💨"]],
  },
  {
    a: "mocha", b: "danpung",
    lines: [[0, "단풍아, 오렌지 하나만 줄래?"], [1, "흐흥, 공짜는 없지! 대신 뭐 줄 건데?"], [0, "음… 꼬리 흔들어 줄게! 🐕"], [1, "…그건 좀 귀엽네. 하나 줄게 🍊"]],
  },
  {
    a: "mongsil", b: "mocha",
    lines: [[0, "모카야… 오늘도 섬 지키느라 수고했어."], [1, "헤헤, 몽실이가 알아주니까 힘이 나!"], [0, "가끔은 쉬어도 돼… 구름이 대신 지켜 줄 거야."], [1, "구름이…? 그럼 나 낮잠 좀 잘까 😴"]],
  },
  {
    a: "mocha", b: "mongsil",
    lines: [[0, "몽실아! 같이 산책 갈래?"], [1, "음~ 좋아… 천천히 걸어 줄 거지?"], [0, "응! 아주 아주 천천히!"], [1, "고마워… 너는 참 착한 강아지야."]],
  },
  {
    a: "danpung", b: "mongsil",
    lines: [[0, "몽실아, 새 시 썼어?"], [1, "응… 「여우가 웃으면 / 오렌지가 사라진다」"], [0, "…그거 나 얘기지?"], [1, "후후… 비밀이야."]],
  },
  {
    a: "mongsil", b: "danpung",
    lines: [[0, "단풍아… 저번에 준 오렌지 고마웠어. 상큼하더라."], [1, "쉿! 모카한테는 비밀이야!"], [0, "왜…?"], [1, "나만 착한 척하는 거 들키면 곤란하거든. 흐흥."]],
  },
  {
    a: "mocha", b: "danpung",
    lines: [[0, "오늘 섬에 손님 왔어! 봤어?"], [1, "봤지! 과수원에서 나무 흔드는 거 다 봤어."], [0, "착한 친구야. 장난치면 안 돼!"], [1, "흐흥, 아주 조금만 칠게."]],
  },
  {
    a: "danpung", b: "mocha", when: (h) => night(h),
    lines: [[0, "모카야… 오늘 너네 집 옆에서 자도 돼?"], [1, "또 무서워? 괜찮아, 내가 지켜 줄게!"], [0, "무, 무서운 거 아니거든! 그냥… 따뜻해서야."]],
  },
  {
    a: "danpung", b: "mongsil", when: (h) => morning(h),
    lines: [[0, "몽실아 일어나! 아침이야!"], [1, "음… 오 분만…"], [0, "벌써 열 번째 오 분이야!"], [1, "…그럼 열한 번째 오 분…"]],
  },
  {
    a: "mongsil", b: "mocha", when: (h) => night(h),
    lines: [[0, "모카야… 별 보러 언덕에 갈래?"], [1, "좋아! 근데 나 별자리는 하나도 몰라."], [0, "괜찮아… 예쁘면 그걸로 충분해. ✨"]],
  },
  {
    a: "mocha", b: "danpung", when: (_, s) => s === "autumn",
    lines: [[0, "단풍아, 네 이름이랑 똑같은 계절이야!"], [1, "그치? 가을엔 내가 주인공이지 🍁"], [0, "그럼 오늘은 네가 섬 지킴이 해!"], [1, "…그건 좀 귀찮은데."]],
  },
  {
    a: "mongsil", b: "mocha", when: (_, s) => s === "winter",
    lines: [[0, "모카야… 눈이 쌓이면 나 하얘지는 거 알아?"], [1, "몽실이는 원래 갈색이잖아?"], [0, "눈이 소복이 쌓이면… 하얀 알파카가 돼."], [1, "우와, 그럼 나도 하얀 시바 될래! ❄️"]],
  },
  {
    a: "mongsil", b: "danpung", when: (_, s) => s === "summer",
    lines: [[0, "단풍아… 털 안 더워?"], [1, "엄청 더워! 너는?"], [0, "나는 몽실몽실해서… 더 더워…"], [1, "…우리 같이 강에 발 담그러 가자."]],
  },
  {
    a: "mocha", b: "mongsil", when: (_, s) => s === "spring",
    lines: [[0, "몽실아, 벚꽃 폈어!"], [1, "응… 분홍 눈이 내리는 것 같아. 🌸"], [0, "에취! 꽃가루 때문에 코가 간질간질해…"], [1, "후후… 봄이 인사하는 거야."]],
  },
];

export function pickChatter(hour: number, season: Season, rand = Math.random) {
  const pool = CHATTER.filter((c) => !c.when || c.when(hour, season));
  // 조건이 맞는 계절·시간 대화는 조금 더 자주
  const weighted = pool.flatMap((c) => (c.when ? [c, c] : [c]));
  return weighted[Math.floor(rand() * weighted.length)];
}
