import { SPECIES, type Species } from "./fish";
import { type IslandSave, XMAS_ITEMS } from "./save";

/**
 * 크리스마스 트리 밑 선물 상자 — 하루에 세 개, 열면 랜덤한 선물이 나온다.
 * 다음 날이면 새 상자가 놓인다.
 */

export const GIFT_COUNT = 3;
export const GIFT_COLORS: [string, string][] = [["#e0453a", "#f2c94c"], ["#4f8fe0", "#ffffff"], ["#6faa4f", "#e0453a"]];

export type GiftReward = {
  emoji: string;
  title: string;
  text: string;
  /** 큰 선물이면 반짝이는 효과 */
  rare?: boolean;
  /** 꾸미기 아이템이면 옷장에서 바로 입어 볼 수 있다 */
  wear?: boolean;
};

const NOTES = [
  "“올해도 섬에 놀러 와 줘서 고마워요. 따뜻한 겨울 보내요!” — trond",
  "“글이 막힐 때 이 섬을 걸어요. 당신도 쉬어 가요.” — trond",
  "“메리 크리스마스! 내년에도 같이 걸어요.” — trond",
  "“오늘 하루도 수고 많았어요. 핫초코 한 잔 어때요?” — trond",
];

const pick = <T,>(a: T[], rand: () => number) => a[Math.floor(rand() * a.length)];

/** 선물을 고르고 저장 데이터에 반영한다 (save를 직접 고친다) */
export function openGift(save: IslandSave, rand = Math.random): GiftReward {
  // 아직 못 받은 꾸미기 아이템이 있으면 절반쯤은 그게 나온다 (맨 처음 상자는 꼭 산타 모자)
  const owned = new Set(save.unlocked ?? []);
  const left = XMAS_ITEMS.filter((x) => !owned.has(x.id));
  if (left.length && (!owned.size || rand() < 0.55)) {
    const item = owned.size ? pick(left, rand) : XMAS_ITEMS[0];
    save.unlocked = [...owned, item.id];
    return {
      emoji: item.emoji,
      title: item.name,
      text: `크리스마스에만 받을 수 있는 꾸미기예요. 옷장에서 입어 볼 수 있어요! (${owned.size + 1}/${XMAS_ITEMS.length})`,
      rare: true,
      wear: true,
    };
  }
  const r = rand();
  if (r < 0.1) {
    save.bag.seed += 5;
    save.bag.apple += 3;
    save.bag.orange += 3;
    return { emoji: "🎅", title: "산타의 큰 선물!", text: "꽃씨 5개, 사과 3개, 오렌지 3개가 한가득 들어 있어요!", rare: true };
  }
  if (r < 0.4) {
    const n = 2 + Math.floor(rand() * 3);
    save.bag.seed += n;
    return { emoji: "🌱", title: `꽃씨 ${n}개`, text: "봄이 오면 섬 어딘가에 심어 볼까요?" };
  }
  if (r < 0.62) {
    const apple = rand() < 0.5;
    const n = 2 + Math.floor(rand() * 2);
    if (apple) save.bag.apple += n;
    else save.bag.orange += n;
    return apple
      ? { emoji: "🍎", title: `사과 ${n}개`, text: "빨갛게 잘 익었어요. 모카가 좋아할 거예요." }
      : { emoji: "🍊", title: `오렌지 ${n}개`, text: "상큼한 냄새! 단풍이가 탐낼지도 몰라요." };
  }
  if (r < 0.82) {
    const pool: Species[] = SPECIES.filter((s) => !s.junk && s.size[1] <= 90);
    const s = pick(pool, rand);
    save.fish[s.id] = (save.fish[s.id] ?? 0) + 1;
    return { emoji: s.emoji, title: `${s.name} 한 마리`, text: "리본을 단 물고기예요. 가방에 넣어 뒀어요. 주민에게 선물해도 좋아요." };
  }
  save.bag.seed += 1;
  return { emoji: "💌", title: "크리스마스 카드", text: `${pick(NOTES, rand)} (꽃씨 1개도 같이 들어 있어요)` };
}
