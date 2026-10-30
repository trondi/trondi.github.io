"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSeasonalContext } from "@/components/blog/seasonal-context";
import { getSeason } from "@/lib/season";
import { cn } from "@/lib/utils";

import type { InteractEvent, IslandHandle } from "./engine";
import { FLOWER_STAGE_LABEL, type IslandSave, type Look, loadSave, writeSave } from "./save";

export type IslandPost = { slug: string; title: string; summary: string };

type Panel =
  | { kind: "npc"; step: number; pick: number }
  | { kind: "mail" }
  | { kind: "board" }
  | { kind: "house" }
  | { kind: "flower"; stage: number }
  | { kind: "bag" };

const NPC_NAME = "모카";
const SEASON_EMOJI = { spring: "🌸", summer: "🌿", autumn: "🍂", winter: "❄️" } as const;
const SKIN_SWATCH = ["#f6d7bd", "#e2b08b", "#a8714a"];

const TIPS = [
  "나무를 흔들면 가끔 꽃씨가 떨어져. 나무마다 하루에 한 번이야!",
  "과일나무는 열매를 따도 다음 날이면 다시 열려.",
  "우편함 위에 빨간 느낌표가 보이면 새 글 편지가 온 거야.",
  "꽃씨는 가방에서 꺼내 심을 수 있어. 시간이 지나면 조금씩 자라!",
  "밤이 되면 가로등이 켜지고 강가에 반딧불이가 나와.",
];

function greeting(h: number) {
  if (h >= 5 && h < 11) return "좋은 아침이야! ☀️ 오늘도 섬에 와 줘서 고마워.";
  if (h >= 11 && h < 17) return "왔구나! 오늘 하루는 어때?";
  if (h >= 17 && h < 20) return "노을이 예쁘지? 이 시간 섬이 제일 좋아.";
  return "이 시간까지 깨어 있구나 🌙 너무 무리하지 마.";
}

export function IslandGame({ posts }: { posts: IslandPost[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<IslandHandle | null>(null);
  const [save, setSave] = useState<IslandSave | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [mode, setMode] = useState<"walk" | "plant">("walk");
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
      return null;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "plant") handleRef.current?.cancelPlanting();
      closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, closePanel]);

  // 편지를 열면 읽음 처리
  useEffect(() => {
    if (panel?.kind === "mail" && latest && save?.mailRead !== latest.slug) handleRef.current?.markMailRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel?.kind]);

  // 저장은 엔진이 맡는다 — 엔진이 onSave로 돌려준다
  const chooseLook = () => handleRef.current?.setLook(draftLook);

  const clock = useMemo(() => {
    const date = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
    const h = now.getHours();
    const time = `${h % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")}`;
    return { date, time, ampm: h < 12 ? "AM" : "PM" };
  }, [now]);

  const needsLook = ready && save && !save.look;

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
          <div className="absolute right-3 top-3 flex gap-2 md:right-5 md:top-5">
            <button
              type="button"
              onClick={() => setPanel({ kind: "bag" })}
              className="relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-[#fff8e7]/95 text-[18px] leading-none shadow-lg transition-transform active:scale-95"
              aria-label="가방 열기"
            >
              🎒<span className="mt-1 text-[9px] font-bold opacity-70">가방</span>
            </button>
            <Link
              href="/"
              className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-[#fff8e7]/95 text-[16px] leading-none shadow-lg transition-transform active:scale-95"
              aria-label="섬에서 나가기"
            >
              ✕<span className="mt-1 text-[9px] font-bold opacity-70">나가기</span>
            </Link>
          </div>

          {/* 심기 모드 */}
          {mode === "plant" && (
            <div className="absolute inset-x-0 top-20 flex justify-center px-4 md:top-24">
              <div className="flex items-center gap-3 rounded-full bg-[#fff8e7]/95 py-2 pl-4 pr-2 text-sm font-bold shadow-lg">
                🌱 꽃씨를 심을 곳을 {mobile ? "탭" : "클릭"}하세요
                <button type="button" onClick={() => handleRef.current?.cancelPlanting()} className="rounded-full border border-[#d9c7a6] px-3 py-1 text-xs">
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 토스트 */}
          <div className="pointer-events-none absolute inset-x-0 top-20 flex flex-col items-center gap-2 px-4 md:top-24" aria-live="polite">
            {mode !== "plant" &&
              toasts.map((t) => (
                <div key={t.id} className="rounded-full bg-[#5a4632]/85 px-4 py-2 text-sm font-bold text-white shadow-lg">
                  {t.text}
                </div>
              ))}
          </div>

          {/* 안내 */}
          {!panel && !needsLook && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
              <span className="rounded-full bg-black/35 px-4 py-2 text-center text-[12px] text-white/95 backdrop-blur">
                {mobile ? "가고 싶은 곳을 탭하세요 · 나무·주민·우편함도 탭해 보세요" : "클릭 또는 WASD로 이동 · 나무·주민·우편함을 클릭해 보세요"}
              </span>
            </div>
          )}

          {/* 패널 */}
          {panel && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 md:p-6">
              <div className="relative w-full max-w-[460px] rounded-[26px] bg-[#fff8e7] px-5 pb-4 pt-6 text-[14px] leading-6 shadow-2xl">
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
                />
              </div>
            </div>
          )}

          {/* 처음 왔을 때 — 모습 고르기 */}
          {needsLook && (
            <div className="absolute inset-0 flex items-end justify-center bg-black/25 p-3 md:items-center">
              <div className="w-full max-w-[420px] rounded-[26px] bg-[#fff8e7] p-5 shadow-2xl">
                <p className="text-[18px] font-black">trond 섬에 온 걸 환영해요! 🏝</p>
                <p className="mt-1 text-[13px] opacity-75">어떤 모습으로 산책할까요?</p>
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

function PanelBody({
  panel,
  posts,
  save,
  setPanel,
  onClose,
  onPlant,
}: {
  panel: Panel;
  posts: IslandPost[];
  save: IslandSave | null;
  setPanel: (p: Panel) => void;
  onClose: () => void;
  onPlant: () => void;
}) {
  const btn = "rounded-full px-4 py-1.5 text-[13px] font-bold transition-transform active:scale-95";
  const primary = cn(btn, "bg-[#7d5bb0] text-white");
  const secondary = cn(btn, "border border-[#d9c7a6] text-[#8a7458]");
  const Tag = ({ children, color = "#f0a24a" }: { children: React.ReactNode; color?: string }) => (
    <span className="absolute -top-3 left-5 rounded-full px-3 py-0.5 text-[12px] font-bold text-white" style={{ background: color }}>
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
          “놀러 와 줘서 고마워요! 지금은 글 쓰러 잠깐 나갔어요. 제가 궁금하면 소개 페이지에 들러 주세요. — trond”
        </p>
        <div className="mt-3 flex justify-end gap-1.5">
          <Link href="/about" className={primary}>
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

  // 가방
  const bag = save?.bag ?? { apple: 0, orange: 0, seed: 0 };
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
      <p className="mt-3 text-[12px] opacity-70">
        꽃 {save?.flowers.length ?? 0}송이를 심었어요 · 꽃씨는 나무를 흔들면 가끔 떨어져요
      </p>
      <div className="mt-3 flex justify-end gap-1.5">
        <button type="button" className={cn(primary, !bag.seed && "opacity-40")} disabled={!bag.seed} onClick={onPlant}>
          🌱 꽃씨 심기
        </button>
        <button type="button" className={secondary} onClick={onClose}>
          닫기
        </button>
      </div>
    </>
  );
}
