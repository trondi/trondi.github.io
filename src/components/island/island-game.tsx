"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSeasonalContext } from "@/components/blog/seasonal-context";
import { type Season, getSeason } from "@/lib/season";
import { cn } from "@/lib/utils";

import { type Bgm, createBgm, loadSoundOn } from "./bgm";
import type { CatchEvent, EngineSfx, FishingPhase, InteractEvent, IslandHandle, Mode } from "./engine";
import type { GiftReward } from "./gifts";
import { SPECIES, SPECIES_BY_ID } from "./fish";
import { type Sfx, createSfx } from "./sfx";
import { SNOWMAN_QUESTIONS, SNOWMEN, type SnowmanId, snowmanLines } from "./snowman";
import { WEATHER_PLACE, WEATHER_TTL, type Weather, fetchWeather } from "./weather";
import {
  type GiftItem, type GiftResult, MAX_HEARTS, RESIDENTS, chatLines, giveGift, greet, npcState, recordTalk, shuffled,
} from "./residents";
import {
  FLOWER_STAGE_LABEL, GLASSES, HAIR_COLORS, HATS, NECKS, PANTS_COLORS, SHIRT_COLORS, TOPS, canWear,
  type IslandSave, type Look, loadSave, writeSave,
} from "./save";

export type IslandPost = { slug: string; title: string; summary: string };

type Panel =
  | {
      kind: "npc";
      /** 주민 id */
      who: string;
      view: "menu" | "chat" | "tip" | "gift" | "rec";
      seed: number;
      /** 처음 열었을 때의 인사 — 메뉴로 돌아오면 비운다 */
      greet: string[];
      chat: number;
      tip: number;
      rec: number;
      /** 지금 보여 주는 수다 (질문이면 q, 고른 대답이면 answer) */
      line?: string;
      q?: number;
      answer?: string;
      gift?: GiftResult;
    }
  | { kind: "mail" }
  | { kind: "board" }
  | { kind: "house" }
  | { kind: "flower"; stage: number }
  /** 눈사람과 이야기 — n번째 말 (세 번에 한 번은 질문) */
  | { kind: "snowman"; who: SnowmanId; seed: number; n: number; line: string; q?: number; answer?: string }
  | { kind: "gift"; reward: GiftReward }
  | { kind: "bag" }
  | { kind: "dex" }
  | { kind: "wardrobe"; draft: Look };

/** 주민 목소리 높이 (0 낮음 ~ 1 높음) */
const VOICE: Record<string, number> = { mocha: 0.45, danpung: 0.62, mongsil: 0.22, seolgi: 0.32, tori: 0.75, dungi: 0.9 };

const SEASON_EMOJI = { spring: "🌸", summer: "🌿", autumn: "🍂", winter: "❄️" } as const;
const SKIN_SWATCH = ["#f6d7bd", "#e2b08b", "#a8714a"];
const DEFAULT_OUTFIT = { shirt: 0, pants: 0, hair: 0, hat: "none", glasses: "none", neck: "none", top: "tee" } as const;

/** 받침 유무로 와/과 */
function withWa(word: string) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "와";
  return (c - 0xac00) % 28 ? "과" : "와";
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
  const bgmRef = useRef<Bgm | null>(null);
  const sfxRef = useRef<Sfx | null>(null);
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
  // 콜백 안에서 최신 값을 읽기 위한 참조
  const saveRef = useRef<IslandSave | null>(null);
  saveRef.current = save;
  const seasonRef = useRef(season);
  seasonRef.current = season;

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    // 같은 안내가 이미 떠 있으면 겹쳐 쌓지 않고 그 자리를 새로 띄운다 (집·나무를 여러 번 탭할 때)
    setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const onInteract = useCallback((e: InteractEvent) => {
    if (e.kind === "tree") {
      const fruit = e.dropped.filter((d) => d === "apple" || d === "orange");
      if (e.dropped.includes("coin")) toast("💰 돈주머니가 떨어졌어요! 주워 보세요");
      else if (fruit.length) toast(`${fruit[0] === "apple" ? "🍎 사과" : "🍊 오렌지"} ${fruit.length}개가 떨어졌어요!`);
      else if (e.dropped.includes("seed")) toast("🌱 꽃씨가 떨어졌어요!");
      else toast("바스락… 아무것도 떨어지지 않았어요");
      return;
    }
    if (e.kind === "npc") {
      const now = new Date();
      const cur = saveRef.current;
      const r = RESIDENTS[e.id] ?? RESIDENTS.mocha;
      setPanel({
        kind: "npc",
        who: r.id,
        view: "menu",
        seed: 1 + Math.floor(Math.random() * 100000),
        greet: cur ? greet(r, { now, season: seasonRef.current, save: cur }) : [],
        chat: 0,
        tip: 0,
        rec: 0,
      });
      handleRef.current?.mutateSave((sv) => recordTalk(r, sv, now));
    }
    else if (e.kind === "flower") setPanel({ kind: "flower", stage: e.stage });
    else if (e.kind === "snowman") {
      setPanel({ kind: "snowman", who: e.id, seed: 1 + Math.floor(Math.random() * 100000), n: 0, line: SNOWMEN[e.id].greet });
    }
    else if (e.kind === "gift") setPanel({ kind: "gift", reward: e.reward });
    else setPanel({ kind: e.kind });
  }, [toast]);

  // 엔진이 알려 주는 순간에 효과음
  const onSfx = useCallback((n: EngineSfx) => {
    const s = sfxRef.current;
    if (!s) return;
    if (n === "nibble") s.play("plop", { rate: 1.35, gain: 0.55 });
    else if (n === "bite") s.play("splash");
    else if (n === "coin") {
      s.play("pickup");
      s.chime();
    } else if (n === "catch") {
      s.play("splash-big");
      window.setTimeout(() => sfxRef.current?.play("jingle"), 280);
    } else s.play(n);
  }, []);

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
          onSfx,
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

  // 서울의 실제 날씨 — 20분마다 다시 받아 온다
  const [weather, setWeatherState] = useState<Weather | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchWeather().then((w) => {
        if (alive) setWeatherState(w);
      });
    load();
    const id = window.setInterval(load, WEATHER_TTL);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => {
    handleRef.current?.setWeather(weather?.kind ?? null);
  }, [weather, ready]);

  // 대화창·가방 같은 창이 열려 있는 동안에는 화면을 탭하거나 키를 눌러도 캐릭터가 움직이지 않는다
  useEffect(() => {
    handleRef.current?.setInputLocked(panel !== null);
  }, [panel, ready]);

  // 시계
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // 배경음악·효과음 — 처음 화면을 누르거나 키를 누를 때 시작한다 (브라우저 자동 재생 제한)
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    const on = loadSoundOn();
    setSoundOn(on);
    const bgm = createBgm(on);
    const sfx = createSfx(on);
    bgmRef.current = bgm;
    sfxRef.current = sfx;
    const unlock = () => {
      bgm.unlock();
      const c = bgm.context();
      if (c) sfx.attach(c);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      bgm.dispose();
      bgmRef.current = null;
      sfxRef.current = null;
    };
  }, []);
  useEffect(() => {
    bgmRef.current?.tick(now);
  }, [now]);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    bgmRef.current?.setOn(next);
    sfxRef.current?.setOn(next);
    if (next) sfxRef.current?.play("toggle");
  };

  // 창이 열리고 닫힐 때 소리, 주민이 말할 때 말소리
  const panelBoxRef = useRef<HTMLDivElement>(null);
  const prevPanelRef = useRef<Panel | null>(null);
  const lastBabbleRef = useRef("");
  useEffect(() => {
    const s = sfxRef.current;
    const prev = prevPanelRef.current;
    prevPanelRef.current = panel;
    if (!s) return;
    if (!panel) {
      if (prev) s.play("close");
      lastBabbleRef.current = "";
      return;
    }
    if (prev?.kind !== panel.kind) {
      if (panel.kind === "dex") s.play("pages");
      else if (panel.kind === "bag") s.play("bag");
      else if (panel.kind === "wardrobe") s.play("bag", { rate: 1.2 });
      else if (panel.kind === "mail" || panel.kind === "board") s.play("paper");
      else if (panel.kind === "house") s.knock();
      else if (panel.kind === "flower") s.play("pop");
      else if (panel.kind === "snowman") s.play("jingle");
      else if (panel.kind === "gift") s.play("jingle");
    }
    if (panel.kind === "npc" || panel.kind === "snowman") {
      // 화면에 보이는 대사를 읽어 그 길이만큼 말소리를 낸다 (눈사람은 조금 높은 목소리)
      const text = [...(panelBoxRef.current?.querySelectorAll("p") ?? [])].map((p) => p.textContent ?? "").join(" ");
      const voice = panel.kind === "npc" ? VOICE[panel.who] ?? 0.5 : panel.who === "village" ? 0.68 : 0.58;
      if (text && text !== lastBabbleRef.current) s.babble(text, voice);
      lastBabbleRef.current = text;
    } else lastBabbleRef.current = "";
  }, [panel]);

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
    <div
      className="fixed inset-0 z-[55] select-none overflow-hidden bg-[#cfe6f7] text-[#5a4632]"
      // 버튼을 누르면 짧게 딸깍
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("button")) sfxRef.current?.play("click");
      }}
    >
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
            {weather && (
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
                title={`${WEATHER_PLACE}의 지금 날씨 · 날씨 정보: Open-Meteo.com`}
                className="pointer-events-auto mt-0.5 block text-[11px] font-bold opacity-75"
              >
                {weather.emoji} {WEATHER_PLACE} {weather.label} {weather.temp}°
              </a>
            )}
          </div>

          {/* 오른쪽 위 버튼 */}
          {panel?.kind !== "wardrobe" && (
            <div className="absolute right-3 top-3 flex gap-1.5 md:right-5 md:top-5 md:gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className={hudBtn}
                aria-label={soundOn ? "소리 끄기" : "소리 켜기"}
                aria-pressed={soundOn}
              >
                {soundOn ? "🔊" : "🔇"}
                <span className="mt-1 text-[9px] font-bold opacity-70">소리</span>
              </button>
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
                {mobile ? "가고 싶은 곳을 탭하세요 · 나무·주민·우편함·벤치도 탭해 보세요" : "클릭 또는 WASD로 이동 · 나무·주민·우편함·벤치를 클릭해 보세요"}
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
              <div ref={panelBoxRef} className={cn(
                "relative w-full max-w-[460px] rounded-[26px] bg-[#fff8e7] px-5 pb-4 pt-6 text-[14px] leading-6 shadow-2xl",
                (panel.kind === "dex" || panel.kind === "wardrobe") && "max-h-[62vh] overflow-y-auto pt-4",
              )}>
                <PanelBody
                  panel={panel}
                  posts={posts}
                  save={save}
                  season={season}
                  weather={weather}
                  onMutate={(fn) => handleRef.current?.mutateSave(fn)}
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
  locked,
}: {
  colors: readonly string[];
  value: number;
  onPick: (i: number) => void;
  label: string;
  /** 아직 못 받은 색 — 자물쇠로 보이고 고를 수 없다 */
  locked?: (i: number) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c, i) => {
        const lock = locked?.(i) ?? false;
        return (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${i + 1}${lock ? " (크리스마스 선물에서 나와요)" : ""}`}
            title={lock ? "크리스마스 선물 상자에서 나와요" : undefined}
            disabled={lock}
            onClick={() => onPick(i)}
            className={cn(
              "relative h-8 w-8 rounded-full border-2 shadow-sm",
              value === i ? "border-[#7d5bb0] ring-2 ring-[#7d5bb0]/30" : "border-white",
              lock && "opacity-40",
            )}
            style={{ background: c }}
          >
            {lock && <span className="absolute inset-0 grid place-items-center text-[12px]">🔒</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 옷장의 고르기 버튼 — 크리스마스 선물 아이템은 받기 전까지 잠겨 있다 */
function Pick({ on, lock, onClick, children }: { on: boolean; lock: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={lock}
      title={lock ? "크리스마스 선물 상자에서 나와요" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-full border-2 px-3 py-1 text-[12px] font-bold",
        on ? "border-[#7d5bb0] bg-[#7d5bb0]/10" : "border-[#e8dcc4]",
        lock && "border-dashed opacity-45",
      )}
    >
      {lock ? "🔒 " : ""}
      {children}
    </button>
  );
}

function PanelBody({
  panel,
  posts,
  save,
  season,
  weather,
  onMutate,
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
  season: Season;
  weather: Weather | null;
  onMutate: (fn: (save: IslandSave) => void) => void;
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
    const r = RESIDENTS[panel.who] ?? RESIDENTS.mocha;
    const st = save ? npcState(save, r.id) : null;
    const hearts = st?.hearts ?? 0;
    const go = (patch: Partial<typeof panel>) => setPanel({ ...panel, ...patch });
    const toMenu = () => go({ view: "menu", greet: [], line: undefined, q: undefined, answer: undefined, gift: undefined });
    const nextChat = () => {
      const n = panel.chat;
      // 세 번에 한 번은 모카가 질문을 던진다
      if (n % 3 === 2) {
        const order = shuffled(r.questions.map((_, i) => i), panel.seed);
        go({ view: "chat", chat: n + 1, q: order[Math.floor(n / 3) % order.length], answer: undefined, line: undefined });
        return;
      }
      if (!save) return;
      const { contextual, general, weather: weatherLine } = chatLines(r, { now: new Date(), season, save, weather: weather?.kind ?? null });
      // 비·눈 오는 날엔 날씨 이야기부터
      const lines = [...(weatherLine ? [weatherLine] : []), ...shuffled(contextual, panel.seed), ...shuffled(general, panel.seed + 1)];
      const k = n - Math.floor((n + 1) / 3);
      go({ view: "chat", chat: n + 1, line: lines[k % lines.length], q: undefined, answer: undefined });
    };
    const pool = posts.slice(1).length ? posts.slice(1) : posts;
    const rec = pool.length ? pool[(panel.seed + panel.rec) % pool.length] : null;
    const give = (item: GiftItem) => {
      let result: GiftResult | null = null;
      onMutate((sv) => {
        result = giveGift(r, sv, item, new Date());
      });
      if (result) go({ view: "gift", gift: result });
    };
    const fishInBag = Object.entries(save?.fish ?? {}).filter(([, n]) => n > 0);
    const chip = "rounded-full border-2 border-[#e8dcc4] bg-white/70 px-3 py-1 text-[13px] font-bold transition-transform active:scale-95";
    const moreTalk = (
      <>
        <button type="button" className={secondary} onClick={toMenu}>
          다른 얘기
        </button>
        <button type="button" className={secondary} onClick={onClose}>
          안녕!
        </button>
      </>
    );
    return (
      <>
        <Tag color={r.color}>
          {r.name}{" "}
          <span aria-label={`친밀도 ${hearts}/${MAX_HEARTS}`} className="tracking-tight">
            {"♥".repeat(hearts)}
            <span className="opacity-50">{"♡".repeat(MAX_HEARTS - hearts)}</span>
          </span>
        </Tag>

        {panel.view === "menu" && (
          <>
            {panel.greet.length ? panel.greet.map((g) => <p key={g}>{g}</p>) : <p>또 무슨 얘기 할까?</p>}
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
              <button type="button" className={primary} onClick={nextChat}>
                💬 수다 떨기
              </button>
              <button type="button" className={secondary} onClick={() => go({ view: "tip" })}>
                🏝️ 섬 이야기
              </button>
              <button type="button" className={secondary} onClick={() => go({ view: "gift", gift: undefined })}>
                🎁 선물 주기
              </button>
              {rec && (
                <button type="button" className={secondary} onClick={() => go({ view: "rec" })}>
                  📖 글 추천
                </button>
              )}
              <button type="button" className={secondary} onClick={onClose}>
                안녕!
              </button>
            </div>
          </>
        )}

        {panel.view === "chat" && panel.q !== undefined && !panel.answer && (
          <>
            <p>{r.questions[panel.q][0]}</p>
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
              {[r.questions[panel.q][1], r.questions[panel.q][2]].map(([label, reply]) => (
                <button key={label} type="button" className={primary} onClick={() => go({ answer: reply })}>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {panel.view === "chat" && (panel.answer || panel.q === undefined) && (
          <>
            <p>{panel.answer ?? panel.line}</p>
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
              <button type="button" className={primary} onClick={nextChat}>
                더 얘기하자
              </button>
              {moreTalk}
            </div>
          </>
        )}

        {panel.view === "tip" && (
          <>
            <p>{r.tips[(panel.seed + panel.tip) % r.tips.length]}</p>
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
              <button type="button" className={primary} onClick={() => go({ tip: panel.tip + 1 })}>
                하나 더 알려 줘
              </button>
              {moreTalk}
            </div>
          </>
        )}

        {panel.view === "rec" && rec && (
          <>
            <p>
              {r.recIntro} <b className="text-[#7d5bb0]">「{rec.title}」</b>
            </p>
            {rec.summary && <p className="mt-1 text-[13px] opacity-75">{rec.summary}</p>}
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
              <Link href={`/posts/${rec.slug}`} className={primary}>
                읽어 볼래!
              </Link>
              {pool.length > 1 && (
                <button type="button" className={secondary} onClick={() => go({ rec: panel.rec + 1 })}>
                  다른 글
                </button>
              )}
              {moreTalk}
            </div>
          </>
        )}

        {panel.view === "gift" && !panel.gift && (
          <>
            {save && (save.bag.apple || save.bag.orange || fishInBag.length) ? (
              <>
                <p>나 주려고? 뭐 줄 거야? 두근두근…</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {save.bag.apple > 0 && (
                    <button type="button" className={chip} onClick={() => give({ kind: "apple" })}>
                      🍎 사과 ×{save.bag.apple}
                    </button>
                  )}
                  {save.bag.orange > 0 && (
                    <button type="button" className={chip} onClick={() => give({ kind: "orange" })}>
                      🍊 오렌지 ×{save.bag.orange}
                    </button>
                  )}
                  {fishInBag.map(([id, n]) => {
                    const sp = SPECIES_BY_ID.get(id);
                    return (
                      <button key={id} type="button" className={chip} onClick={() => give({ kind: "fish", id })}>
                        {sp?.emoji ?? "🐟"} {sp?.name ?? id} ×{n}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p>가방이 비었네? 나무를 흔들어 과일을 따거나 물고기를 낚아서 가져와 줘! 🍎🐟</p>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">{moreTalk}</div>
          </>
        )}

        {panel.view === "gift" && panel.gift && (
          <>
            <p>{panel.gift.line}</p>
            {panel.gift.heart && (
              <p className="mt-1 text-[13px] font-bold text-[#e8707a]">♥ {r.name}{withWa(r.name)} 조금 더 친해졌어요</p>
            )}
            {panel.gift.reward > 0 && (
              <p className="mt-1">{r.reward(panel.gift.reward, hearts >= MAX_HEARTS)}</p>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">{moreTalk}</div>
          </>
        )}
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

  if (panel.kind === "gift") {
    const { reward } = panel;
    return (
      <>
        <Tag color="#e0453a">🎁 선물 상자</Tag>
        <div className="flex items-center gap-3">
          <span className={cn("text-[44px] leading-none", reward.rare && "animate-bounce")}>{reward.emoji}</span>
          <div>
            <p className="font-black text-[#7d5bb0]">{reward.title}</p>
            <p className="text-[13px] opacity-80">{reward.text}</p>
          </div>
        </div>
        <p className="mt-2 text-[12px] opacity-60">상자는 하루에 세 개씩 놓여요. 내일 또 와 보세요!</p>
        <div className="mt-3 flex justify-end gap-1.5">
          {reward.wear && (
            <button type="button" className={secondary} onClick={onWardrobe}>
              👕 입어 보기
            </button>
          )}
          <button type="button" className={primary} onClick={onClose}>
            고마워요!
          </button>
        </div>
      </>
    );
  }

  if (panel.kind === "snowman") {
    const sm = SNOWMEN[panel.who];
    const go = (patch: Partial<typeof panel>) => setPanel({ ...panel, ...patch });
    const next = () => {
      const n = panel.n;
      // 세 번에 한 번은 눈사람이 질문을 던진다
      if (n % 3 === 2) {
        const order = shuffled(SNOWMAN_QUESTIONS.map((_, i) => i), panel.seed);
        go({ n: n + 1, q: order[Math.floor(n / 3) % order.length], answer: undefined, line: "" });
        return;
      }
      const { first, general } = snowmanLines(panel.who, { now: new Date(), save, weather: weather?.kind ?? null });
      const lines = [...first, ...shuffled(general, panel.seed)];
      const k = n - Math.floor((n + 1) / 3);
      go({ n: n + 1, line: lines[k % lines.length], q: undefined, answer: undefined });
    };
    const q = panel.q !== undefined ? SNOWMAN_QUESTIONS[panel.q] : null;
    return (
      <>
        <Tag color={sm.color}>⛄ {sm.name}</Tag>
        {q ? (
          <>
            <p>{q[0]}</p>
            {panel.answer ? (
              <p className="mt-1">{panel.answer}</p>
            ) : (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {[q[1], q[2]].map(([a, reply]) => (
                  <button key={a} type="button" className={secondary} onClick={() => go({ answer: reply })}>
                    {a}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p>{panel.line}</p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          {(!q || panel.answer) && (
            <button type="button" className={primary} onClick={next}>
              더 얘기하기
            </button>
          )}
          <button type="button" className={secondary} onClick={onClose}>
            안녕!
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
          <span className={label}>상의 종류</span>
          <div className="flex flex-wrap gap-1.5">
            {TOPS.map((t) => (
              <Pick key={t.id} on={(d.top ?? "tee") === t.id} lock={false} onClick={() => update({ top: t.id })}>
                {t.name}
              </Pick>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className={label}>상의 색</span>
          <Swatches
            colors={SHIRT_COLORS}
            value={d.shirt ?? 0}
            onPick={(shirt) => update({ shirt })}
            label="상의 색"
            locked={(i) => !canWear(save, `shirt:${i}`)}
          />
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
              <Pick key={h.id} on={(d.hat ?? "none") === h.id} lock={!canWear(save, `hat:${h.id}`)} onClick={() => update({ hat: h.id })}>
                {h.name}
              </Pick>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className={label}>안경</span>
          <div className="flex flex-wrap gap-1.5">
            {GLASSES.map((g) => (
              <Pick key={g.id} on={(d.glasses ?? "none") === g.id} lock={!canWear(save, `glasses:${g.id}`)} onClick={() => update({ glasses: g.id })}>
                {g.name}
              </Pick>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className={label}>목도리</span>
          <div className="flex flex-wrap gap-1.5">
            {NECKS.map((n) => (
              <Pick key={n.id} on={(d.neck ?? "none") === n.id} lock={!canWear(save, `neck:${n.id}`)} onClick={() => update({ neck: n.id })}>
                {n.name}
              </Pick>
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
      <div className="mb-2 flex items-center justify-between rounded-2xl bg-[#fbeec3] px-4 py-2">
        <span className="text-[13px] font-bold">🪙 코인</span>
        <span className="text-[15px] font-black tabular-nums">{(save?.coins ?? 0).toLocaleString()}</span>
      </div>
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
