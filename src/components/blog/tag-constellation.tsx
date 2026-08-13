"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HubTag, SubTag, TagConstellation } from "@/lib/blog/tag-graph";
import { formatDate } from "@/lib/blog/utils";
import { cn } from "@/lib/utils";

/**
 * 태그 성좌 — 브라우저 창 안에서 3단계로 탐색한다.
 *   L1 허브 태그 성좌 → L2 상세 태그 성좌 → L3 글 목록
 * 뒤로가기: 배경 클릭 / ESC / 주소창 브레드크럼 / 툴바 ‹ 버튼
 */

const VIEW_W = 560;
const VIEW_H = 430;
/** 별 반지름: 글 수에 비례 */
const R_MIN = 3.4;
const R_RANGE = 5.6;
/** 글 수 상위 N개를 핑크로 강조 — 글이 쌓여도 자동으로 따라간다 */
const HIGHLIGHT_TOP_N = 5;

type Level = 1 | 2 | 3;

/** 나가는 화면이 사라지는 시간 — CSS .tc-view 트랜지션과 맞춘다 */
const FADE_MS = 190;
/** 별이 순차로 피어나는 간격 */
const STAGGER_MS = 22;

function twinkleClass(index: number) {
  return `tc-tw${(index % 3) + 1}`;
}

/** 상세 태그를 중심 둘레의 두 겹 링에 배치 */
function subPositions(subs: SubTag[]) {
  const cx = 280;
  const cy = 205;
  const inner = Math.min(6, subs.length);

  return subs.map((sub, i) => {
    const ring = i < 6 ? 0 : 1;
    const indexInRing = i < 6 ? i : i - 6;
    const perRing = i < 6 ? inner : subs.length - 6;
    const radius = ring === 0 ? 118 : 190;
    const angle = (indexInRing / perRing) * Math.PI * 2 - Math.PI / 2 + ring * 0.5;

    return {
      sub,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.82,
    };
  });
}

export function TagConstellationWindow({ data }: { data: TagConstellation }) {
  const [level, setLevel] = useState<Level>(1);
  const [hub, setHub] = useState<HubTag | null>(null);
  const [sub, setSub] = useState<SubTag | null>(null);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 현재 화면을 먼저 페이드아웃한 뒤 단계를 바꾼다 */
  const navigate = useCallback((apply: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    setPhase("out");
    timer.current = setTimeout(() => {
      apply();
      setPhase("in");
    }, FADE_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const maxCount = useMemo(
    () => Math.max(...data.tags.map((tag) => tag.count), 1),
    [data.tags],
  );
  const byName = useMemo(
    () => new Map(data.tags.map((tag) => [tag.name, tag])),
    [data.tags],
  );
  const highlighted = useMemo(() => {
    const top = [...data.tags]
      .sort((a, b) => b.count - a.count)
      .slice(0, HIGHLIGHT_TOP_N);
    return new Set(top.map((tag) => tag.name));
  }, [data.tags]);

  const goBack = useCallback(() => {
    if (level === 3) {
      navigate(() => {
        setSub(null);
        setLevel(2);
      });
    } else if (level === 2) {
      navigate(() => {
        setHub(null);
        setLevel(1);
      });
    }
  }, [level, navigate]);

  // ESC로 한 단계 뒤로
  useEffect(() => {
    if (level === 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goBack();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [level, goBack]);

  const subLayout = useMemo(() => (hub ? subPositions(hub.subs) : []), [hub]);
  const subMax = useMemo(
    () => (hub ? Math.max(...hub.subs.map((s) => s.count), 1) : 1),
    [hub],
  );

  return (
    <div className="glass-window overflow-hidden rounded-2xl">
      {/* ── 타이틀바 ─────────────────────────────────────────────────── */}
      <div className="flex items-end gap-2.5 border-b border-[hsl(var(--ring)/0.12)] bg-white/35 px-3.5 pt-2.5 dark:bg-white/[0.04]">
        <span className="flex gap-1.5 pb-2.5" aria-hidden>
          <i className="block h-[11px] w-[11px] rounded-full bg-[#F4A9A3]" />
          <i className="block h-[11px] w-[11px] rounded-full bg-[#F4D9A3]" />
          <i className="block h-[11px] w-[11px] rounded-full bg-[#A9D9B4]" />
        </span>
        <span className="flex max-w-[260px] items-center gap-[7px] rounded-t-[9px] border border-b-0 border-[hsl(var(--ring)/0.14)] bg-white/70 px-3 py-[7px] font-mono text-[10.5px] text-foreground dark:bg-white/[0.07]">
          <span className="text-[10px] text-[hsl(var(--tc-pink))]">◎</span>
          <span className="truncate">
            {level === 1 ? "tag constellation" : level === 2 ? hub?.name : sub?.name}
          </span>
          <span className="ml-0.5 text-xs text-muted-foreground">×</span>
        </span>
        <span className="pb-2 text-sm text-muted-foreground" aria-hidden>
          +
        </span>
      </div>

      {/* ── 툴바 — 주소창이 브레드크럼 ──────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[hsl(var(--ring)/0.1)] bg-white/45 px-3.5 py-2.5 dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={goBack}
          disabled={level === 1}
          aria-label="뒤로"
          className="flex h-6 w-6 items-center justify-center rounded-md text-[15px] leading-none text-muted-foreground transition-colors hover:bg-[hsl(var(--ring)/0.1)] hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ‹
        </button>
        <button
          type="button"
          disabled
          aria-label="앞으로"
          className="flex h-6 w-6 items-center justify-center rounded-md text-[15px] leading-none text-muted-foreground opacity-30"
        >
          ›
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-[hsl(var(--ring)/0.14)] bg-white/70 px-3.5 py-1.5 font-mono text-[11px] text-muted-foreground dark:bg-white/[0.06]">
          <span className="text-[8.5px] opacity-60" aria-hidden>
            🔒
          </span>
          <span className="text-muted-foreground/60">trond.dev/tags</span>
          {level >= 2 && hub && (
            <>
              <span className="text-muted-foreground/40">/</span>
              {level === 2 ? (
                <span className="text-foreground">{hub.name}</span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    navigate(() => {
                      setSub(null);
                      setLevel(2);
                    })
                  }
                  className="text-[hsl(var(--ring))] hover:underline"
                >
                  {hub.name}
                </button>
              )}
            </>
          )}
          {level === 3 && sub && (
            <>
              <span className="text-muted-foreground/40">/</span>
              <span className="truncate text-foreground">{sub.name}</span>
            </>
          )}
        </div>

        <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground/70">
          {level === 1
            ? `${data.totalPosts} posts`
            : level === 2 && hub
              ? `${hub.count} posts · ${hub.subs.length} topics`
              : sub
                ? `${sub.posts.length} posts`
                : ""}
        </span>
      </div>

      {/* ── 뷰포트 ───────────────────────────────────────────────────── */}
      <div
        className="tc-view relative min-h-[432px] bg-white/15 px-4 py-2 dark:bg-white/[0.02]"
        data-phase={phase}
      >
        {level < 3 ? (
          <svg
            key={`${level}-${hub?.name ?? "root"}`}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className={cn("block h-[418px] w-full overflow-visible", level === 2 && "cursor-zoom-out")}
            onClick={() => level === 2 && goBack()}
            role="img"
            aria-label={level === 1 ? "태그 성좌" : `${hub?.name} 상세 태그`}
          >
            {level === 1 &&
              data.edges.map((edge) => {
                const a = byName.get(edge.a);
                const b = byName.get(edge.b);
                if (!a || !b) return null;
                return (
                  <line
                    key={`${edge.a}-${edge.b}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    strokeWidth={0.9 + edge.w * 0.22}
                    className={cn(
                      "tc-draw",
                      edge.w >= 5 ? "stroke-[hsl(var(--ring)/0.5)]" : "stroke-[hsl(var(--ring)/0.3)]",
                    )}
                  />
                );
              })}

            {level === 1 &&
              data.tags.map((tag, i) => {
                const r = R_MIN + (tag.count / maxCount) * R_RANGE;
                const labelX = tag.side === "start" ? tag.x + r + 7 : tag.x - r - 7;
                return (
                  <g
                    key={tag.name}
                    className="tc-star tc-pop cursor-pointer"
                    style={{ animationDelay: `${i * STAGGER_MS}ms` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(() => {
                        setHub(tag);
                        setLevel(2);
                      });
                    }}
                  >
                    <circle
                      cx={tag.x}
                      cy={tag.y}
                      r={r}
                      className={cn(
                        twinkleClass(i),
                        highlighted.has(tag.name)
                          ? "fill-[hsl(var(--tc-pink))]"
                          : "fill-[hsl(var(--ring))]",
                      )}
                    />
                    <text
                      x={labelX}
                      y={tag.y + 3.4}
                      textAnchor={tag.side}
                      className="fill-muted-foreground font-mono text-[10px]"
                    >
                      {tag.name} <tspan className="fill-muted-foreground/60">{tag.count}</tspan>
                    </text>
                  </g>
                );
              })}

            {level === 2 && hub && (
              <>
                {hub.subEdges.map((edge) => {
                  const a = subLayout.find((s) => s.sub.name === edge.a);
                  const b = subLayout.find((s) => s.sub.name === edge.b);
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`${edge.a}-${edge.b}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      strokeWidth={0.8 + edge.w * 0.22}
                      className="tc-draw stroke-[hsl(var(--ring)/0.24)]"
                    />
                  );
                })}
                {subLayout.map(({ sub: s, x, y }, i) => (
                  <line
                    key={`spoke-${s.name}`}
                    x1={280}
                    y1={205}
                    x2={x}
                    y2={y}
                    strokeWidth={0.7}
                    className="tc-draw stroke-[hsl(var(--ring)/0.15)]"
                    style={{ animationDelay: `${60 + i * STAGGER_MS}ms` }}
                  />
                ))}
                {subLayout.map(({ sub: s, x, y }, i) => {
                  const r = 3.2 + (s.count / subMax) * 4.2;
                  const right = x >= 280;
                  return (
                    <g
                      key={s.name}
                      className="tc-star tc-pop cursor-pointer"
                      style={{ animationDelay: `${80 + i * STAGGER_MS}ms` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(() => {
                          setSub(s);
                          setLevel(3);
                        });
                      }}
                    >
                      <circle cx={x} cy={y} r={r} className={cn(twinkleClass(i), "fill-[hsl(var(--ring))]")} />
                      <text
                        x={right ? x + r + 6 : x - r - 6}
                        y={y + 3.2}
                        textAnchor={right ? "start" : "end"}
                        className="fill-muted-foreground font-mono text-[10px]"
                      >
                        {s.name} <tspan className="fill-muted-foreground/60">{s.count}</tspan>
                      </text>
                    </g>
                  );
                })}
                <g className="tc-pop">
                  <circle cx={280} cy={205} r={13} className="fill-[hsl(var(--tc-pink))]" />
                  <text
                    x={280}
                    y={238}
                    textAnchor="middle"
                    className="fill-foreground font-mono text-[13px] font-bold"
                  >
                    {hub.name}
                  </text>
                </g>
              </>
            )}
          </svg>
        ) : (
          <div
            className="absolute inset-x-4 inset-y-2 flex flex-col"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("a")) goBack();
            }}
          >
            <div key={sub?.name} className="tc-scroll flex-1 overflow-y-auto pr-1.5">
              {sub?.posts.map((post, i) => (
                <Link
                  key={post.slug}
                  href={`/posts/${post.slug}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="tc-rise block rounded-xl border border-transparent p-3 transition-colors hover:border-white/90 hover:bg-white/60 dark:hover:border-white/10 dark:hover:bg-white/[0.06]"
                >
                  <div className="mb-1 flex gap-2.5 font-mono text-[10px]">
                    <span className="text-[hsl(var(--ring))]">{"// "}{post.category}</span>
                    <span className="text-muted-foreground/70">{formatDate(post.date)}</span>
                  </div>
                  <h4 className="mb-1 text-[14.5px] font-semibold leading-snug tracking-[-0.01em]">
                    {post.title}
                  </h4>
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[hsl(var(--tc-pink)/0.09)] px-2 py-0.5 font-mono text-[9.5px] text-[hsl(var(--tc-pink))]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 상태바 ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-[hsl(var(--ring)/0.1)] bg-white/40 px-4 py-1.5 dark:bg-white/[0.03]">
        {level === 1 ? (
          <span className="flex gap-3.5 font-mono text-[9px] text-muted-foreground/70">
            <span>
              <i className="mr-1 inline-block h-[7px] w-[7px] -translate-y-px rounded-full bg-[hsl(var(--tc-pink))] align-middle" />
              허브 태그
            </span>
            <span>
              <i className="mr-1 inline-block h-[7px] w-[7px] -translate-y-px rounded-full bg-[hsl(var(--ring))] align-middle" />
              크기 = 글 수
            </span>
            <span>─ 함께 등장</span>
          </span>
        ) : (
          <span className="font-mono text-[9px] text-muted-foreground/70">
            {level === 2 ? "상세 태그를 클릭하면 글 목록" : "글을 클릭하면 이동"}
          </span>
        )}
        {level > 1 && (
          <span className="rounded-full border border-[hsl(var(--ring)/0.22)] px-2.5 py-0.5 font-mono text-[9px] text-muted-foreground/70">
            ESC / 배경 클릭으로 뒤로
          </span>
        )}
      </div>
    </div>
  );
}
