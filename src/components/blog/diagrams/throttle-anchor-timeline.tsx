"use client";

import { useState } from "react";

const TOTAL = 13; // 타임라인 전체 길이 (초)
const THROTTLE = 5;
const LOADING = 1;

const pct = (sec: number) => `${(sec / TOTAL) * 100}%`;

function Bar({ segments }: { segments: { start: number; len: number; kind: "loading" | "rest" }[] }) {
  return (
    <div className="relative h-8 w-full overflow-hidden rounded-lg border border-border bg-background/60">
      {segments.map((s, i) => (
        <div
          key={i}
          className={`absolute top-0 h-full ${
            s.kind === "loading"
              ? "bg-orange-500/40 border-x border-orange-500/60"
              : "bg-emerald-500/15"
          }`}
          style={{ left: pct(s.start), width: pct(s.len) }}
        />
      ))}
      {/* 초 눈금 */}
      {Array.from({ length: TOTAL + 1 }).map((_, sec) => (
        <span
          key={sec}
          className="absolute bottom-0 top-0 border-l border-border/40"
          style={{ left: pct(sec) }}
        />
      ))}
    </div>
  );
}

export function ThrottleAnchorTimelineDiagram() {
  const [anchor, setAnchor] = useState<"start" | "complete">("start");

  // 시작 anchor: 재조회 시작 시각 기준 5초 창 → 0, 5, 10초에 시작
  const startSegments = [0, 5, 10].flatMap((t) => [
    { start: t, len: LOADING, kind: "loading" as const },
    { start: t + LOADING, len: THROTTLE - LOADING, kind: "rest" as const },
  ]);
  // 완료 anchor: 완료 시각 기준 5초 창 → 0, 6, 12초에 시작
  const completeSegments = [0, 6, 12].flatMap((t) => [
    { start: t, len: LOADING, kind: "loading" as const },
    { start: t + LOADING, len: THROTTLE, kind: "rest" as const },
  ]);

  const isStart = anchor === "start";

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {[
          { id: "start" as const, label: "시작 anchor (기존)" },
          { id: "complete" as const, label: "완료 anchor (변경 후)" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setAnchor(t.id)}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${
              anchor === t.id
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>throttle 5초 · 로딩 1초 가정</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-500/40 border border-orange-500/60" />
              로딩
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/15 border border-emerald-500/30" />
              휴식(창)
            </span>
          </span>
        </div>

        <Bar segments={isStart ? startSegments : completeSegments} />

        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          {Array.from({ length: TOTAL + 1 }).map((_, sec) => (
            <span key={sec}>{sec}</span>
          ))}
        </div>

        {isStart ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            창이 재조회를 던진 순간부터 흐른다. 로딩 1초가 창을 깎아먹어
            로딩 끝난 뒤 조용한 시간은 4초뿐 - 재조회 주기 5초.
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
            창이 로딩 완료 후부터 흐른다. 로딩이 끝나면 full 5초 휴식이
            보장된다 - 재조회 주기 6초 (throttle + 로딩시간).
          </div>
        )}
      </div>
    </div>
  );
}
