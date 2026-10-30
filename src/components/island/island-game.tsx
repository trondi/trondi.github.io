"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSeasonalContext } from "@/components/blog/seasonal-context";
import { getSeason } from "@/lib/season";
import { cn } from "@/lib/utils";

import type { CatchEvent, FishingPhase, InteractEvent, IslandHandle, Mode } from "./engine";
import { SPECIES, SPECIES_BY_ID } from "./fish";
import {
  FLOWER_STAGE_LABEL, HAIR_COLORS, HATS, PANTS_COLORS, SHIRT_COLORS,
  type IslandSave, type Look, loadSave, writeSave,
} from "./save";

export type IslandPost = { slug: string; title: string; summary: string };

type Panel =
  | { kind: "npc"; step: number; pick: number }
  | { kind: "mail" }
  | { kind: "board" }
  | { kind: "house" }
  | { kind: "flower"; stage: number }
  | { kind: "bag" }
  | { kind: "dex" }
  | { kind: "wardrobe"; draft: Look };

const NPC_NAME = "모카";
const SEASON_EMOJI = { spring: "🌸", summer: "🌿", autumn: "🍂", winter: "❄️" } as const;
const SKIN_SWATCH = ["#f6d7bd", "#e2b08b", "#a8714a"];
const DEFAULT_OUTFIT = { shirt: 0, pants: 0, hair: 0, hat: "none" } as const;

const TIPS = [
  "나무를 흔들면 가끔 꽃씨가 떨어져. 나무마다 하루에 한 번이야!",
  "과일나무는 열매를 따도 다음 날이면 다시 열려. 강 건너에 과수원도 있어!",
  "우편함 위에 빨간 느낌표가 보이면 새 글 편지가 온 거야.",
  "꽃씨는 가방에서 꺼내 심을 수 있어. 시간이 지나면 조금씩 자라!",
  "가방에서 낚싯대를 꺼내 물을 탭해 봐. 찌가 쑥 들어갈 때 바로 탭해야 해!",
  "강, 위쪽 숲의 연못, 남쪽 바다에서 사는 물고기가 달라. 밤에만 나오는 애들도 있대.",
  "뒤쪽 언덕은 경사로로 올라갈 수 있어. 연못가 벤치가 내 비밀 장소야.",
  "집에 있는 옷장에서 옷이랑 모자를 바꿀 수 있어.",
];

function greeting(h: number) {
  if (h >= 5 && h < 11) return "좋은 아침이야! ☀️ 오늘도 섬에 와 줘서 고마워.";
  if (h >= 11 && h < 17) return "왔구나! 오늘 하루는 어때?";
  if (h >= 17 && h < 20) return "노을이 예쁘지? 이 시간 섬이 제일 좋아.";
  return "이 시간까지 깨어 있구나 🌙 너무 무리하지 마.";
}

/** 받침 유무로 을/를 */
function eulReul(word: string) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "를";
  return (c - 0xac00) % 28 ? "을" : "를";
}

export function IslandGame({ posts }: { posts: IslandPost[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<IslandHandle | null>(null);
  const [save, setSave] = useState<IslandSave | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [mode, setMode] = useState<Mode>("walk");
  const [fishPhase, setFishPhase] = useState<FishingPhase>("idle");
  const [caught, setCaught] = useState<CatchEvent | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [mobile, setMobile] = useState(false);
  const [draftLook, setDraftLook] = useState<Look>({ body: "a", skin: 0 });

  const { activeSeason } = useSeasonalContext();
  const season = activeSeason ?? getSeason();
  const latest = posts[0] ?? null;

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const onInteract = useCallback((e: InteractEvent) => {
    if (e.kind === "tree") {
      const fruit = e.dropped.filter((d) => d !== "seed");
      if (fruit.length) toast(`${fruit[0] === "apple" ? "🍎 사과" : "🍊 오렌지"} ${fruit.length}개가 떨어졌어요!`);
      else if (e.dropped.includes("seed")) toast("🌱 꽃씨가 떨어졌어요!");
      else toast("바스락… 아무것도 떨어지지 않았어요");
      return;
    }
    if (e.kind === "npc") setPanel({ kind: "npc", step: 0, pick: Math.floor(Math.random() * 1000) });
    else if (e.kind === "flower") setPanel({ kind: "flower", stage: e.stage });
    else setPanel({ kind: e.kind });
  }, [toast]);

  const onCatch = useCallback((e: CatchEvent) => {
    setCaught(e);
    window.setTimeout(() => setCaught((c) => (c === e ? null : c)), 2800);
  }, []);

  // 엔진 시작
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initial = loadSave();
    setSave(initial);
    setMobile(host.clientWidth < 768);
    let disposed = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("./engine")
      .then(({ createIsland }) =>
        createIsland(host, { season, save: initial, latestMail: latest?.slug ?? null, reducedMotion }, {
          onProgress: setProgress,
          onInteract,
          onToast: toast,
          onSave: (s) => {
            writeSave(s);
            setSave(s);
          },
          onModeChange: setMode,
          onFishing: setFishPhase,
          onCatch,
        }),
      )
      .then((handle) => {
        if (disposed) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        setReady(true);
      })
      .catch(() => setFailed(true));

    return () => {
      disposed = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
    // 엔진은 한 번만 만든다 — 계절 변경은 아래 effect에서 전달
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setSeason(season);
  }, [season, ready]);

  // 시계
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // 배경 페이지 스크롤 잠금
  useEffect(() => {
    const { body } = document;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, []);

  const closePanel = useCallback(() => {
    setPanel((p) => {
      if (p?.kind === "npc") handleRef.current?.endDialog();
      if (p?.kind === "wardrobe") {
        // 저장하지 않고 닫으면 원래 모습으로
        if (save?.look) handleRef.current?.setLook(save.look, false);
        handleRef.current?.setCloseUp(false);
      }
      return null;
    });
  }, [save?.look]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode !== "walk" && !panel) handleRef.current?.cancelMode();
      closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, panel, closePanel]);

  // 편지를 열면 읽음 처리
  useEffect(() => {
    if (panel?.kind === "mail" && latest && save?.mailRead !== latest.slug) handleRef.current?.markMailRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel?.kind]);

  // 저장은 엔진이 맡는다 — 엔진이 onSave로 돌려준다
  const chooseLook = () => handleRef.current?.setLook({ ...DEFAULT_OUTFIT, ...draftLook });

  const openWardrobe = () => {
    if (!save?.look) return;
    handleRef.current?.setCloseUp(true);
    setPanel({ kind: "wardrobe", draft: { ...DEFAULT_OUTFIT, ...save.look } });
  };

  const clock = useMemo(() => {
    const date = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
    const h = now.getHours();
    const time = `${h % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")}`;
    return { date, time, ampm: h < 12 ? "AM" : "PM" };
  }, [now]);

  const needsLook = ready && save && !save.look;
  const hudBtn = "relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-[#fff8e7]/95 text-[18px] leading-none shadow-lg transition-transform active:scale-95";

  return (
    <div className="fixed inset-0 z-[55] select-none overflow-hidden bg-[#cfe6f7] text-[#5a4632]">
      <div ref={hostRef} className="absolute inset-0 isolate" aria-label="trond 섬 — 3D 산책 게임" role="application" />

      {/* 불러오는 중 */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#6f5aa8] via-[#e79a8a] to-[#f6c58f] text-white">
          {failed ? (
            <>
              <p className="text-lg font-bold">섬에 가지 못했어요 😢</p>
              <p className="max-w-xs text-center text-sm opacity-90">이 브라우저에서는 3D 화면(WebGL)을 쓸 수 없는 것 같아요.</p>
              <Link href="/" className="rounded-full bg-white/90 px-5 py-2 text-sm font-bold text-[#5a4632]">블로그로 돌아가기</Link>
            </>
          ) : (
            <>
              <p className="text-4xl motion-safe:animate-bounce">⛵</p>
              <p className="text-lg font-bold">섬으로 가는 중…</p>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-white/30">
                <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      )}

      {ready && (
        <>
          {/* 시계 */}
          <div className="pointer-events-none absolute left-3 top-3 rounded-[18px] bg-[#fff8e7]/95 px-4 py-2 shadow-lg md:left-5 md:top-5">
            <div className="text-[11px] font-bold opacity-70">
              {clock.date} {SEASON_EMOJI[season]}
            </div>
            <div className="text-[22px] font-black leading-7 tracking-tight">
              {clock.time} <span className="text-[13px]">{clock.ampm}</span>
            </div>
          </div>

          {/* 오른쪽 위 버튼 */}
          {panel?.kind !== "wardrobe" && (
            <div className="absolute right-3 top-3 flex gap-1.5 md:right-5 md:top-5 md:gap-2">
              <button type="button" onClick={() => setPanel({ kind: "dex" })} className={hudBtn} aria-label="도감 열기">
                📖<span className="mt-1 text-[9px] font-bold opacity-70">도감</span>
              </button>
              <button type="button" onClick={() => setPanel({ kind: "bag" })} className={hudBtn} aria-label="가방 열기">
                🎒<span className="mt-1 text-[9px] font-bold opacity-70">가방</span>
              </button>
              <Link href="/" className={cn(hudBtn, "text-[16px]")} aria-label="섬에서 나가기">
                ✕<span className="mt-1 text-[9px] font-bold opacity-70">나가기</span>
              </Link>
            </div>
          )}

          {/* 심기·낚시 모드 */}
          {mode !== "walk" && !panel && (
            <div className="absolute inset-x-0 top-20 flex justify-center px-4 md:top-24">
              <div className="flex items-center gap-3 rounded-full bg-[#fff8e7]/95 py-2 pl-4 pr-2 text-sm font-bold shadow-lg">
                {mode === "plant"
                  ? `🌱 꽃씨를 심을 곳을 ${mobile ? "탭" : "클릭"}하세요`
                  : fishPhase === "idle"
                    ? `🎣 물을 ${mobile ? "탭" : "클릭"}해서 찌를 던지세요`
                    : `찌가 쑥 들어가면 바로 ${mobile ? "탭" : "클릭(또는 Space)"}!`}
                <button type="button" onClick={() => handleRef.current?.cancelMode()} className="rounded-full border border-[#d9c7a6] px-3 py-1 text-xs">
                  {mode === "plant" ? "취소" : "낚싯대 넣기"}
                </button>
              </div>
            </div>
          )}

          {/* 입질! */}
          {fishPhase === "bite" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#d9534f] text-[52px] font-black text-white shadow-2xl motion-safe:animate-bounce">!</span>
                <span className="mt-3 rounded-full bg-[#5a4632]/85 px-4 py-1.5 text-sm font-bold text-white">지금 {mobile ? "탭" : "클릭"}!</span>
              </div>
            </div>
          )}

          {/* 낚았다! */}
          {caught && (
            <div className="pointer-events-none absolute inset-x-0 top-[18%] flex justify-center px-4">
              <div className="rounded-[26px] bg-[#fff8e7] px-6 py-4 text-center shadow-2xl">
                <div className="text-[40px] leading-none">{caught.species.emoji}</div>
                <p className="mt-2 text-[17px] font-black">
                  {caught.species.junk ? "…" : ""}
                  {caught.species.name}{eulReul(caught.species.name)} 낚았다{caught.species.junk ? "…" : "!"}
                </p>
                {!caught.species.junk && <p className="text-[13px] opacity-70">{caught.size}cm</p>}
                <div className="mt-2 flex justify-center gap-1.5 text-[11px] font-bold">
                  {caught.isNew && <span className="rounded-full bg-[#7d5bb0] px-2.5 py-0.5 text-white">도감 새로 등록!</span>}
                  {caught.isRecord && <span className="rounded-full bg-[#f0a24a] px-2.5 py-0.5 text-white">최고 기록!</span>}
                </div>
              </div>
            </div>
          )}

          {/* 토스트 */}
          <div className="pointer-events-none absolute inset-x-0 top-20 flex flex-col items-center gap-2 px-4 md:top-24" aria-live="polite">
            {mode === "walk" &&
              toasts.map((t) => (
                <div key={t.id} className="rounded-full bg-[#5a4632]/85 px-4 py-2 text-sm font-bold text-white shadow-lg">
                  {t.text}
                </div>
              ))}
          </div>
          {mode !== "walk" && toasts.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4" aria-live="polite">
              <div className="rounded-full bg-[#5a4632]/85 px-4 py-2 text-sm font-bold text-white shadow-lg">{toasts[toasts.length - 1].text}</div>
            </div>
          )}

          {/* 안내 */}
          {!panel && !needsLook && mode === "walk" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
              <span className="rounded-full bg-black/35 px-4 py-2 text-center text-[12px] text-white/95 backdrop-blur">
                {mobile ? "가고 싶은 곳을 탭하세요 · 나무·주민·우편함도 탭해 보세요" : "클릭 또는 WASD로 이동 · 나무·주민·우편함을 클릭해 보세요"}
              </span>
            </div>
          )}

          {/* 패널 */}
          {panel && (
            <div className={cn(
              "absolute inset-x-0 bottom-0 flex justify-center p-3 md:p-6",
              // 옷장은 데스크톱에서 오른쪽에 — 가운데의 캐릭터를 가리지 않게
              panel.kind === "wardrobe" && "md:inset-y-0 md:left-auto md:right-0 md:w-[500px] md:items-center",
            )}>
              <div className={cn(
                "relative w-full max-w-[460px] rounded-[26px] bg-[#fff8e7] px-5 pb-4 pt-6 text-[14px] leading-6 shadow-2xl",
                (panel.kind === "dex" || panel.kind === "wardrobe") && "max-h-[62vh] overflow-y-auto pt-4",
              )}>
                <PanelBody
                  panel={panel}
                  posts={posts}
                  save={save}
                  setPanel={setPanel}
                  onClose={closePanel}
                  onPlant={() => {
                    setPanel(null);
                    handleRef.current?.startPlanting();
                  }}
                  onRod={() => {
                    setPanel(null);
                    handleRef.current?.setRod(true);
                  }}
                  onWardrobe={openWardrobe}
                  onRelease={(id) => handleRef.current?.releaseFish(id)}
                  onPreview={(look) => handleRef.current?.setLook(look, false)}
                  onWear={(look) => {
                    handleRef.current?.setLook(look);
                    handleRef.current?.setCloseUp(false);
                    setPanel(null);
                    toast("👕 옷을 갈아입었어요!");
                  }}
                />
              </div>
            </div>
          )}

          {/* 처음 왔을 때 — 모습 고르기 */}
          {needsLook && (
            <div className="absolute inset-0 flex items-end justify-center bg-black/25 p-3 md:items-center">
              <div className="w-full max-w-[420px] rounded-[26px] bg-[#fff8e7] p-5 shadow-2xl">
                <p className="text-[18px] font-black">trond 섬에 온 걸 환영해요! 🏝</p>
                <p className="mt-1 text-[13px] opacity-75">어떤 모습으로 산책할까요? 옷은 나중에 집 옷장에서 바꿀 수 있어요.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {([["a", "긴 머리"], ["b", "짧은 머리"]] as const).map(([body, label]) => (
                    <button
                      key={body}
                      type="button"
                      onClick={() => setDraftLook((l) => ({ ...l, body }))}
                      className={cn(
                        "rounded-2xl border-2 px-3 py-3 text-[14px] font-bold",
                        draftLook.body === body ? "border-[#7d5bb0] bg-[#7d5bb0]/10" : "border-[#e8dcc4]",
                      )}
                    >
                      {body === "a" ? "👩" : "🧑"} {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[13px]">
                  <span className="opacity-75">피부색</span>
                  {SKIN_SWATCH.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`피부색 ${i + 1}`}
                      onClick={() => setDraftLook((l) => ({ ...l, skin: i }))}
                      className={cn("h-8 w-8 rounded-full border-2", draftLook.skin === i ? "border-[#7d5bb0]" : "border-transparent")}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={chooseLook}
                  className="mt-5 w-full rounded-full bg-[#7d5bb0] py-3 text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
                >
                  섬으로 출발 ⛵
                </button>
                <p className="mt-3 text-center text-[11px] opacity-60">진행 상황은 이 브라우저에만 저장돼요</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Swatches({
  colors,
  value,
  onPick,
  label,
}: {
  colors: readonly string[];
  value: number;
  onPick: (i: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${i + 1}`}
          onClick={() => onPick(i)}
          className={cn("h-8 w-8 rounded-full border-2 shadow-sm", value === i ? "border-[#7d5bb0] ring-2 ring-[#7d5bb0]/30" : "border-white")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function PanelBody({
  panel,
  posts,
  save,
  setPanel,
  onClose,
  onPlant,
  onRod,
  onWardrobe,
  onRelease,
  onPreview,
  onWear,
}: {
  panel: Panel;
  posts: IslandPost[];
  save: IslandSave | null;
  setPanel: (p: Panel) => void;
  onClose: () => void;
  onPlant: () => void;
  onRod: () => void;
  onWardrobe: () => void;
  onRelease: (id: string) => void;
  onPreview: (look: Look) => void;
  onWear: (look: Look) => void;
}) {
  const btn = "rounded-full px-4 py-1.5 text-[13px] font-bold transition-transform active:scale-95";
  const primary = cn(btn, "bg-[#7d5bb0] text-white");
  const secondary = cn(btn, "border border-[#d9c7a6] text-[#8a7458]");
  // 스크롤되는 패널(도감·옷장)은 바깥이 잘리므로 이름표를 안쪽에 둔다
  const scrolls = panel.kind === "dex" || panel.kind === "wardrobe";
  const Tag = ({ children, color = "#f0a24a" }: { children: React.ReactNode; color?: string }) => (
    <span
      className={cn(
        "rounded-full px-3 py-0.5 text-[12px] font-bold text-white",
        scrolls ? "mb-2 inline-block" : "absolute -top-3 left-5",
      )}
      style={{ background: color }}
    >
      {children}
    </span>
  );

  if (panel.kind === "npc") {
    const pool = posts.slice(1).length ? posts.slice(1) : posts;
    const rec = pool.length ? pool[panel.pick % pool.length] : null;
    // 0: 인사 + 추천, 1..: 이야기와 추천을 번갈아
    const talkTip = panel.step > 0 && panel.step % 2 === 1;
    const tip = TIPS[(panel.pick + panel.step) % TIPS.length];
    return (
      <>
        <Tag>{NPC_NAME}</Tag>
        {panel.step === 0 && <p>{greeting(new Date().getHours())}</p>}
        {talkTip ? (
          <p>{tip}</p>
        ) : rec ? (
          <p className="mt-1">
            혹시 이 글 읽어 봤어? <b className="text-[#7d5bb0]">「{rec.title}」</b>
          </p>
        ) : (
          <p>{tip}</p>
        )}
        <div className="mt-3 flex flex-wrap justify-end gap-1.5">
          {!talkTip && rec && (
            <Link href={`/posts/${rec.slug}`} className={primary}>
              읽어 볼래!
            </Link>
          )}
          <button type="button" className={secondary} onClick={() => setPanel({ ...panel, step: panel.step + 1, pick: panel.pick + 7 })}>
            다른 얘기 해 줘
          </button>
          <button type="button" className={secondary} onClick={onClose}>
            안녕!
          </button>
        </div>
      </>
    );
  }

  if (panel.kind === "mail") {
    const latest = posts[0];
    return (
      <>
        <Tag color="#d9534f">우편함</Tag>
        {latest ? (
          <>
            <p className="font-bold">📮 trond가 보낸 편지</p>
            <p className="mt-1">
              새 글을 올렸어요! <b className="text-[#7d5bb0]">「{latest.title}」</b>
            </p>
            {latest.summary && <p className="mt-1 text-[13px] opacity-75">{latest.summary}</p>}
            <div className="mt-3 flex justify-end gap-1.5">
              <Link href={`/posts/${latest.slug}`} className={primary}>
                읽으러 가기
              </Link>
              <button type="button" className={secondary} onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        ) : (
          <>
            <p>편지함이 비어 있어요. 새 글이 올라오면 편지가 와요 ✉️</p>
            <div className="mt-3 flex justify-end">
              <button type="button" className={secondary} onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  if (panel.kind === "board") {
    return (
      <>
        <Tag color="#b98b5e">섬 게시판</Tag>
        <p>지나가는 길에 한 줄 남기고 가요!</p>
        <ul className="mt-2 space-y-1 text-[13px]">
          {posts.slice(0, 3).map((p) => (
            <li key={p.slug} className="truncate">
              📌{" "}
              <Link href={`/posts/${p.slug}`} className="underline decoration-[#d9c7a6] underline-offset-2">
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end gap-1.5">
          <Link href="/guestbook" className={primary}>
            방명록 쓰러 가기
          </Link>
          <button type="button" className={secondary} onClick={onClose}>
            닫기
          </button>
        </div>
      </>
    );
  }

  if (panel.kind === "house") {
    return (
      <>
        <Tag color="#7d5bb0">trond의 집</Tag>
        <p>똑똑… 문에 쪽지가 붙어 있어요 📝</p>
        <p className="mt-1 rounded-xl bg-[#f3e9d2] px-3 py-2 text-[13px]">
          “놀러 와 줘서 고마워요! 지금은 글 쓰러 잠깐 나갔어요. 현관 옆 옷장은 마음껏 써도 돼요. 제가 궁금하면 소개 페이지에 들러 주세요. — trond”
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-1.5">
          <button type="button" className={primary} onClick={onWardrobe}>
            👕 옷장 열기
          </button>
          <Link href="/about" className={secondary}>
            trond 알아보기
          </Link>
          <button type="button" className={secondary} onClick={onClose}>
            닫기
          </button>
        </div>
      </>
    );
  }

  if (panel.kind === "flower") {
    const msg = [
      "🌱 새싹이 났어요. 조금만 기다려 주세요.",
      "🌿 줄기가 쑥 자랐어요.",
      "🌷 꽃봉오리가 맺혔어요. 곧 필 것 같아요!",
      "🌸 꽃이 활짝 피었어요!",
    ][panel.stage];
    return (
      <>
        <Tag color="#6faa4f">{FLOWER_STAGE_LABEL[panel.stage]}</Tag>
        <p>{msg}</p>
        <div className="mt-3 flex justify-end">
          <button type="button" className={secondary} onClick={onClose}>
            닫기
          </button>
        </div>
      </>
    );
  }

  if (panel.kind === "dex") {
    const dex = save?.dex ?? {};
    const real = SPECIES.filter((s) => !s.junk);
    const found = real.filter((s) => dex[s.id]).length;
    return (
      <>
        <Tag color="#4f9fd0">물고기 도감</Tag>
        <p className="text-[13px] opacity-75">
          {found} / {real.length}종 발견 · 강, 연못, 바다마다 사는 물고기가 달라요
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {SPECIES.map((s) => {
            const d = dex[s.id];
            return (
              <div key={s.id} className={cn("flex flex-col items-center rounded-2xl py-2.5", d ? "bg-[#e8f3fb]" : "bg-[#f3e9d2]")}>
                <span className={cn("text-[24px] leading-none", !d && "opacity-30 grayscale")}>{d ? s.emoji : "❔"}</span>
                <span className="mt-1 text-[12px] font-bold">{d ? s.name : "???"}</span>
                <span className="text-[10px] opacity-60">
                  {d ? (s.junk ? `${d.count}번` : `최고 ${d.best}cm · ${d.count}마리`) : s.night ? "밤에만?" : s.seasons ? "철마다 달라요" : " "}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" className={secondary} onClick={onClose}>
            닫기
          </button>
        </div>
      </>
    );
  }

  if (panel.kind === "wardrobe") {
    const d = panel.draft;
    const update = (patch: Partial<Look>) => {
      const next = { ...d, ...patch };
      setPanel({ kind: "wardrobe", draft: next });
      onPreview(next);
    };
    const row = "mt-3";
    const label = "mb-1.5 block text-[12px] font-bold opacity-70";
    return (
      <>
        <Tag color="#7d5bb0">옷장</Tag>
        <div>
          <span className={label}>모습</span>
          <div className="grid grid-cols-2 gap-2">
            {([["a", "👩 긴 머리"], ["b", "🧑 짧은 머리"]] as const).map(([body, name]) => (
              <button
                key={body}
                type="button"
                onClick={() => update({ body })}
                className={cn("rounded-2xl border-2 py-2 text-[13px] font-bold", d.body === body ? "border-[#7d5bb0] bg-[#7d5bb0]/10" : "border-[#e8dcc4]")}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className={label}>상의</span>
          <Swatches colors={SHIRT_COLORS} value={d.shirt ?? 0} onPick={(shirt) => update({ shirt })} label="상의 색" />
        </div>
        <div className={row}>
          <span className={label}>하의</span>
          <Swatches colors={PANTS_COLORS} value={d.pants ?? 0} onPick={(pants) => update({ pants })} label="하의 색" />
        </div>
        <div className={row}>
          <span className={label}>머리색</span>
          <Swatches colors={HAIR_COLORS} value={d.hair ?? 0} onPick={(hair) => update({ hair })} label="머리색" />
        </div>
        <div className={row}>
          <span className={label}>피부색</span>
          <Swatches colors={SKIN_SWATCH} value={d.skin} onPick={(skin) => update({ skin })} label="피부색" />
        </div>
        <div className={row}>
          <span className={label}>모자</span>
          <div className="flex flex-wrap gap-1.5">
            {HATS.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => update({ hat: h.id })}
                className={cn("rounded-full border-2 px-3 py-1 text-[12px] font-bold", (d.hat ?? "none") === h.id ? "border-[#7d5bb0] bg-[#7d5bb0]/10" : "border-[#e8dcc4]")}
              >
                {h.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-1.5">
          <button type="button" className={primary} onClick={() => onWear(d)}>
            이대로 입기
          </button>
          <button type="button" className={secondary} onClick={onClose}>
            취소
          </button>
        </div>
      </>
    );
  }

  // 가방
  const bag = save?.bag ?? { apple: 0, orange: 0, seed: 0 };
  const fish = Object.entries(save?.fish ?? {}).filter(([, n]) => n > 0);
  return (
    <>
      <Tag color="#7d5bb0">가방</Tag>
      <div className="grid grid-cols-3 gap-2">
        {([["apple", "🍎", "사과"], ["orange", "🍊", "오렌지"], ["seed", "🌱", "꽃씨"]] as const).map(([k, icon, name]) => (
          <div key={k} className="flex flex-col items-center rounded-2xl bg-[#f3e9d2] py-3">
            <span className="text-[26px] leading-none">{icon}</span>
            <span className="mt-1 text-[12px] font-bold">{name}</span>
            <span className="text-[12px] opacity-70">× {bag[k]}</span>
          </div>
        ))}
      </div>
      {fish.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-bold opacity-70">낚은 것</p>
          <div className="flex flex-wrap gap-1.5">
            {fish.map(([id, n]) => {
              const s = SPECIES_BY_ID.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onRelease(id)}
                  title="눌러서 물로 돌려보내기"
                  className="flex items-center gap-1 rounded-full bg-[#e8f3fb] px-3 py-1 text-[12px] font-bold"
                >
                  {s?.emoji} {s?.name ?? id} × {n}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] opacity-60">물고기를 누르면 한 마리씩 물로 돌려보내요</p>
        </div>
      )}
      <p className="mt-3 text-[12px] opacity-70">
        꽃 {save?.flowers.length ?? 0}송이를 심었어요 · 꽃씨는 나무를 흔들면 가끔 떨어져요
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
        <button type="button" className={primary} onClick={onRod}>
          🎣 낚싯대 들기
        </button>
        <button type="button" className={cn(primary, !bag.seed && "opacity-40")} disabled={!bag.seed} onClick={onPlant}>
          🌱 꽃씨 심기
        </button>
        <button type="button" className={secondary} onClick={onWardrobe}>
          👕 옷장
        </button>
        <button type="button" className={secondary} onClick={onClose}>
          닫기
        </button>
      </div>
    </>
  );
}
