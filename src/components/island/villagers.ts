import { MAX_HEARTS, type Resident } from "./resident-core";

/** 단풍 — 강 건너 과수원에 사는 장난꾸러기 여우. 오렌지와 반짝이는 것(빈 깡통도!)을 좋아한다. */
export const DANPUNG: Resident = {
  id: "danpung",
  name: "단풍",
  color: "#e0703a",
  intro: "어, 처음 보는 얼굴이네? 나는 단풍이야 🦊 강 건너 과수원은 내 구역이거든!",
  again: ["또 왔어? 혹시 나 보고 싶었던 거야? 흐흥", "벌써 또 왔네! 과수원이 그렇게 좋아?"],
  longAgo: (n) => `${n}일 동안 어디 갔었어? 그새 과수원 오렌지가 또 열렸다고!`,
  timeGreet: [
    "아침 이슬 맺힌 오렌지가 제일 맛있어 보이는 시간이야!",
    "오, 왔어? 마침 심심했거든.",
    "노을이 내 털 색이랑 똑같지? 흐흥 🦊",
    "쉿, 밤엔 과수원에 부엉이가 와. 살금살금 다녀.",
  ],
  tips: [
    "과일나무는 하루에 한 번 흔들 수 있어. 매일 와서 흔들어 봐!",
    "다리를 건너면 강 건너로 올 수 있어. 다리는 모두 세 개야.",
    "강에서는 피라미랑 붕어가 잘 잡혀. 가을엔 연어도 올라와!",
    "밤에 강가에 가면 메기를 낚을 수 있대. 수염이 길쭉해!",
    "나무 아래 떨어진 과일은 그냥 걸어가서 주우면 돼.",
    "모카는 사과를, 몽실이는 예쁜 연못 물고기를 좋아해. 나? 당연히 오렌지지!",
    "빈 깡통은 나한테 보물이야. 낚이면 버리지 말고 나 줘!",
  ],
  questions: [
    ["숨바꼭질 잘해?", ["잘해!", "그럼 다음에 과수원에서 한판 하자! 나 진짜 잘 숨거든."], ["못해…", "괜찮아, 내가 일부러 들켜 줄게. 흐흥."]],
    ["사과가 좋아, 오렌지가 좋아?", ["사과", "흥, 모카랑 똑같은 소리 하네!"], ["오렌지", "역시 뭘 좀 아는구나! 🍊"]],
    ["비밀 하나 알려 줄까?", ["알려 줘!", "사실 나 밤엔 무서워서 모카 집 근처에서 자… 아무한테도 말하지 마!"], ["괜찮아", "치, 궁금해할 줄 알았는데."]],
    ["모험 좋아해?", ["좋아!", "폭포 뒤에 뭐가 있을지 궁금하지 않아? 언젠가 같이 가 보자!"], ["집이 최고", "그것도 좋지. 집에서 오렌지 까먹는 게 최고야."]],
    ["탐정 놀이 할래?", ["좋아", "사건이야! 누군가 과수원 오렌지를 몰래 먹었어… 범인은… 바로 나야! 흐흥"], ["다음에", "알았어, 사건 생기면 꼭 부를게!"]],
    ["반짝이는 거 좋아해?", ["좋아해", "우리 통했다! 내 보물 상자 보여 줄까? …아니다, 비밀이야."], ["별로", "에이, 반짝이는 걸 싫어하는 애도 있구나. 신기해."]],
    ["장난치는 거 좋아해?", ["좋아!", "좋아, 모카한테 같이 장난치자. 걔는 맨날 속거든 😆"], ["싫어", "알았어… 너한테는 안 칠게. 아마도."]],
  ],
  chat: ({ now, season }, f, st) => {
    const h = now.getHours();
    const contextual: string[] = [];
    const general: string[] = [];
    if (f.hat === "crown") contextual.push("왕관! 반짝반짝… 잠깐만 만져 봐도 돼? 👀");
    else if (f.hatName) contextual.push(`${f.hatName}이라… 흐흥, 나쁘지 않네.`);
    if (f.glassesName) contextual.push("선글라스 낀 거야? 탐정 같다! 🕵️");
    if (f.oranges > 0) contextual.push("가방에서 상큼한 냄새가 나는데… 혹시 오렌지?! 🍊");
    if (f.dexCount) contextual.push(`도감 ${f.dexCount}종이라고? 나는 물고기 이름 세 개밖에 몰라.`);
    if (f.caught("catfish")) contextual.push("메기 낚았다며! 밤에 강가에 나간 거야? 용감하다!");
    if (f.caught("salmon")) contextual.push("연어 잡았어? 강을 거슬러 올라오는 애들이잖아. 대단해!");
    if (f.bloomed) contextual.push("꽃 심었더라? 과수원 옆에도 하나 심어 줘. 오렌지 꽃이랑 잘 어울릴 거야.");
    if (st.hearts >= MAX_HEARTS) contextual.push("너는 내 보물 목록 1번이야. 진짜로! 🦊💛");
    else if (st.hearts >= 3) contextual.push("너랑 노는 게 장난치는 것보다 재밌어. 이건 칭찬이야!");
    contextual.push("오늘 과수원 나무 흔들어 봤어? 매일 새 과일이 열리거든!");

    if (h >= 20 || h < 5) general.push("밤엔 눈이 반짝반짝 잘 보여. 여우는 원래 밤에 강하거든.");
    else if (h < 11) general.push("아침엔 과수원 나무를 한 바퀴 돌면서 과일 개수를 세. 오늘도 이상 없음!");
    else general.push("햇볕 드는 나무 밑이 내 낮잠 자리야. 모카한테는 비밀!");
    if (season === "autumn") general.push("가을이 제일 좋아! 단풍잎이 내 이름이랑 같거든 🍁");
    else if (season === "winter") general.push("눈 위에 발자국 찍는 거 재밌어. 따라와 봐!");
    else if (season === "spring") general.push("봄엔 과수원에 꽃이 펴. 오렌지 꽃 냄새 맡아 봤어?");
    else general.push("여름 오렌지는 시원하게 먹어야 제맛이야.");
    general.push(
      "다람쥐가 없어서 다행이야. 오렌지는 내 거니까!",
      "과수원 나무 개수 세어 봤어? 다섯 그루야. 내가 매일 세거든.",
      "어제 강물에 비친 내 얼굴 봤는데 꽤 잘생겼더라. 흐흥.",
      "꼬리가 복슬복슬해서 겨울에도 안 추워. 부럽지?",
      "모카는 착한데 너무 순진해. 뼈다귀 숨겨 놔도 맨날 못 찾아!",
      "몽실이는 하루 종일 연못가에서 시를 써. 신기하지?",
      "다리 위에서 강물 내려다보면 물고기가 보여. 진짜야!",
      "trond가 우편함에 편지 넣는 거 몰래 봤어. 엄청 진지한 얼굴이더라.",
    );
    return { contextual, general };
  },
  react: (item, s) => {
    if (item.kind === "orange") return { line: "오렌지다!!! 🍊 너 진짜 뭘 좀 아는구나! 최고의 선물이야!", heart: true };
    if (item.kind === "apple") return { line: "사과? 모카가 좋아하는 거잖아… 뭐, 나도 싫진 않아. 고마워 🍎", heart: true };
    if (!s) return { line: "이게 뭐야?", heart: false };
    if (s.id === "can") return { line: "반짝반짝 깡통!! 이건 내 보물 상자에 넣을 거야. 고마워! ✨", heart: true };
    if (s.id === "boot") return { line: "장화…? 한 짝뿐이네. 나머지 한 짝 찾으면 신어 볼게! 😂", heart: false };
    if (s.id === "salmon" || s.id === "sweetfish" || s.id === "catfish")
      return { line: `${s.name}! 강에서 잡은 거지? 이거 진짜 맛있는 건데! ${s.emoji}`, heart: true };
    return { line: `${s.name}이라… 흐흥, 잘 먹을게! ${s.emoji}`, heart: true };
  },
  already: "오늘은 벌써 받았잖아! 욕심쟁이는 나 하나로 충분해. 내일 또 와!",
  reward: (n, best) =>
    best ? `우리 이제 단짝이니까… 내 비밀 보물을 나눠 줄게! 🌱 꽃씨 ${n}개!` : `이건 내 보물 중 하나야… 🌱 꽃씨 ${n}개! 아껴 써!`,
  recIntro: "이 글 몰래 읽어 봤는데 재밌더라!",
};

/** 몽실 — 위쪽 연못가 벤치 옆에 사는 느긋한 알파카. 꽃과 구름, 예쁜 연못 물고기를 좋아한다. */
export const MONGSIL: Resident = {
  id: "mongsil",
  name: "몽실",
  color: "#9b8fd0",
  intro: "안녕… 나는 몽실이야 🦙 연못가에서 구름 구경하는 게 내 일이야. 천천히 쉬다 가.",
  again: ["또 와 줬구나… 기뻐.", "음~ 오늘은 자주 보네. 좋다…"],
  longAgo: (n) => `${n}일 만이네… 그동안 구름이 몇 번이나 바뀌었는지 몰라. 보고 싶었어.`,
  timeGreet: [
    "좋은 아침… 연못에 물안개가 피었어. 예쁘지?",
    "어서 와… 햇살이 포근해서 졸려…",
    "노을이 연못에 비쳐서 두 개가 됐어… 아름다워.",
    "밤하늘 별이 연못에 떨어진 것 같아… 너도 봤어?",
  ],
  tips: [
    "위쪽 연못에는 금붕어랑 비단잉어가 살아. 밤엔 메기도 나와…",
    "연못 낚시는 조용히… 물고기도 쉬고 싶거든.",
    "벤치에 앉아 있으면 시간이 천천히 가. 너도 쉬어 가.",
    "꽃은 심고 나서 반나절쯤 지나면 활짝 펴. 기다리는 것도 즐거움이야.",
    "폭포 소리 들으면서 낮잠 자면 꿈이 맑아져.",
    "계절마다 섬 색깔이 달라. 겨울엔 나무에 눈이 소복이 쌓여.",
    "선물은 하루에 한 번이면 충분해… 마음이 중요하니까.",
  ],
  questions: [
    ["구름 보는 거 좋아해?", ["좋아", "저기 저 구름, 솜사탕 같지 않아…? 🍭"], ["잘 안 봐", "가끔 올려다봐… 하늘은 매일 다른 그림이야."]],
    ["시 한 편 들어 볼래?", ["들려줘", "「연못에 비친 달 / 물고기가 먹을까 봐 / 살며시 덮어 준다」… 어때? 🌙"], ["다음에", "응… 언제든 들려줄게."]],
    ["쉬는 날엔 뭐 해?", ["푹 자", "최고의 선택이야… 나도 그래 😴"], ["놀러 가", "부지런하구나… 다녀와서 얘기해 줘."]],
    ["좋아하는 꽃 있어?", ["벚꽃", "봄에 섬이 분홍색이 되면 마음도 분홍색이 돼… 🌸"], ["해바라기", "해를 따라 고개를 돌리는 거… 꼭 너 같아. 밝아서."]],
    ["요즘 힘든 일 있어?", ["조금…", "괜찮아… 여기선 천천히 해도 돼. 숨 한번 크게 쉬어 보자."], ["괜찮아!", "다행이다… 그 마음 오래 갔으면 좋겠어."]],
    ["음악 좋아해?", ["신나는 거", "모카가 좋아하겠다… 같이 뛰어다니면서 들어."], ["잔잔한 거", "폭포 소리도 음악이야… 가만히 들어 봐."]],
    ["별자리 알아?", ["알아!", "그럼 나중에 같이 찾아보자… 나는 국자 모양밖에 몰라."], ["몰라", "나도 잘 몰라… 그냥 예쁘면 됐지."]],
  ],
  chat: ({ now, season }, f, st) => {
    const h = now.getHours();
    const contextual: string[] = [];
    const general: string[] = [];
    if (f.hat === "straw") contextual.push("밀짚모자… 햇살이랑 잘 어울려.");
    else if (f.hatName) contextual.push(`${f.hatName}… 포근해 보여. 잘 어울려.`);
    if (f.glassesName) contextual.push("선글라스… 눈부신 날 좋겠다. 나는 속눈썹이 길어서 괜찮아…");
    if (f.bloomed) contextual.push("네가 심은 꽃 봤어… 향기가 여기까지 나는 것 같아 🌷");
    else if (f.planted) contextual.push("꽃이 자라는 걸 지켜보는 거… 참 좋아. 천천히 자라도 괜찮아.");
    else if (f.seeds > 0) contextual.push("꽃씨가 있으면… 연못가에도 하나 심어 줄래?");
    if (f.caught("koi")) contextual.push("비단잉어 낚았구나… 연못에서 제일 예쁜 아이야.");
    if (f.dexCount) contextual.push(`도감이 ${f.dexCount}종이 됐구나… 천천히 다 채워 봐.`);
    if (st.hearts >= MAX_HEARTS) contextual.push("우리… 이제 소중한 친구야. 🦙💕");
    else if (st.hearts >= 3) contextual.push("너랑 있으면 마음이 말랑말랑해져…");

    if (h >= 20 || h < 5) general.push("밤엔 반딧불이가 연못 위로 날아… 작은 별 같아.");
    else if (h < 11) general.push("아침엔 풀 냄새가 진해… 크게 숨 쉬어 봐.");
    else general.push("낮잠 자기 딱 좋은 날씨야… 하암.");
    if (season === "spring") general.push("봄바람이 털 사이로 지나가… 간지러워.");
    else if (season === "summer") general.push("털이 복슬복슬해서… 여름엔 조금 더워…");
    else if (season === "autumn") general.push("낙엽이 연못에 떠 있으면 작은 배 같아… 🍂");
    else general.push("눈 오는 날엔 털에 눈이 쌓여… 원래 하얀데 더 하얘져.");
    general.push(
      "어제 구름 하나가 모카랑 똑같이 생겼었어…",
      "단풍이가 오렌지를 몰래 가져다줬어… 착한 아이야. 장난이 좀 심하지만.",
      "모카는 늘 바빠 보여… 섬을 지키느라.",
      "연못 물고기들한테 이름을 하나씩 지어 줬어… 비밀이야.",
      "이 벤치는 trond가 글 생각할 때 앉는 자리래…",
      "천천히 걷는 게 좋아… 빨리 가면 꽃을 놓치니까.",
      "가끔 폭포 위로 무지개가 떠… 🌈",
    );
    return { contextual, general };
  },
  react: (item, s) => {
    if (item.kind === "apple") return { line: "사과… 고마워. 아삭한 소리가 참 좋아 🍎", heart: true };
    if (item.kind === "orange") return { line: "오렌지… 상큼해서 잠이 깬다. 고마워 🍊", heart: true };
    if (!s) return { line: "음… 이건 뭘까…", heart: false };
    if (s.id === "boot") return { line: "장화…? 여기에 꽃을 심으면 예쁜 화분이 되겠다… 고마워 🌼", heart: true };
    if (s.junk) return { line: "깡통은… 단풍이가 좋아하겠다. 전해 줄게.", heart: false };
    if (["koi", "goldfish", "bluegoldfish", "betta"].includes(s.id))
      return { line: `${s.name}…! 너무 예쁘다… 연못에서 제일 반짝일 거야 ${s.emoji}✨`, heart: true };
    return { line: `${s.name}… 나는 물고기는 안 먹지만, 연못에 살게 해 줄게. 고마워 ${s.emoji}`, heart: true };
  },
  already: "오늘은 벌써 받았어… 마음은 충분히 전해졌어. 내일 또 와 줘.",
  reward: (n, best) =>
    best ? `소중한 친구한테만 주는 거야… 🌱 꽃씨 ${n}개. 함께 피워 보자.` : `연못가에서 모은 꽃씨야… 🌱 ${n}개. 예쁘게 피워 줘.`,
  recIntro: "이 글… 천천히 읽어 보면 좋을 것 같아.",
};
