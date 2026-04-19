"use client";

import { useState } from "react";

export function SseSharedWorkerDiagram() {
  const [tab, setTab] = useState<"sse" | "shared">("sse");
  const [tabCount, setTabCount] = useState(3);

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {[
          { id: "sse" as const, label: "SSE 단독 (문제 상황)" },
          { id: "shared" as const, label: "Shared Worker + SSE (최적화)" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${
              tab === t.id
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab count control */}
      <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">열린 탭 수:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setTabCount(n)}
            className={`h-6 w-6 rounded text-xs font-semibold transition-colors ${
              tabCount === n
                ? "bg-foreground text-background"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "sse" && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {/* Tabs */}
              <div className="flex flex-col gap-2">
                {Array.from({ length: tabCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs">
                    <span>🌐</span>
                    <span className="text-foreground/70">탭 {i + 1}</span>
                    <span className="ml-1 text-orange-400 font-mono text-[10px]">EventSource</span>
                  </div>
                ))}
              </div>

              {/* Connections */}
              <div className="flex flex-col gap-2 text-orange-400 font-bold text-sm">
                {Array.from({ length: tabCount }).map((_, i) => (
                  <span key={i}>——→</span>
                ))}
              </div>

              {/* Server */}
              <div className="flex flex-col items-center gap-1 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                <span className="text-2xl">🖥️</span>
                <span className="text-xs font-semibold text-orange-400">서버</span>
                <span className="text-[11px] font-bold text-orange-400">
                  SSE × {tabCount}
                </span>
                <span className="text-[10px] text-muted-foreground">연결</span>
              </div>
            </div>

            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              ⚠️ 탭이 {tabCount}개 열리면 서버에 SSE 연결도 {tabCount}개가 생깁니다.
              탭이 많아질수록 서버 부하가 증가합니다.
            </div>
          </>
        )}

        {tab === "shared" && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {/* Tabs */}
              <div className="flex flex-col gap-2">
                {Array.from({ length: tabCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs">
                    <span>🌐</span>
                    <span className="text-foreground/70">탭 {i + 1}</span>
                    <span className="ml-1 text-indigo-400 font-mono text-[10px]">port.onmessage</span>
                  </div>
                ))}
              </div>

              {/* to Shared Worker */}
              <div className="flex flex-col gap-2 text-indigo-400 font-bold text-sm">
                {Array.from({ length: tabCount }).map((_, i) => (
                  <span key={i}>——→</span>
                ))}
              </div>

              {/* Shared Worker */}
              <div className="flex flex-col items-center gap-1 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
                <span className="text-xl">⚙️</span>
                <span className="text-xs font-semibold text-indigo-400">Shared</span>
                <span className="text-xs font-semibold text-indigo-400">Worker</span>
              </div>

              {/* to Server */}
              <div className="text-emerald-400 font-bold">——→</div>

              {/* Server */}
              <div className="flex flex-col items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <span className="text-2xl">🖥️</span>
                <span className="text-xs font-semibold text-emerald-400">서버</span>
                <span className="text-[11px] font-bold text-emerald-400">SSE × 1</span>
                <span className="text-[10px] text-muted-foreground">연결</span>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
              ✅ 탭이 {tabCount}개 열려도 Shared Worker가 SSE를 1개만 유지합니다.
              이벤트는 연결된 모든 탭에 <code className="text-emerald-300">postMessage</code>로 브로드캐스트합니다.
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-border bg-background/50 p-2 text-center">
                <div className="text-muted-foreground">SSE 단독</div>
                <div className="mt-1 text-lg font-bold text-red-400">{tabCount}개</div>
                <div className="text-muted-foreground">서버 연결</div>
              </div>
              <div className="rounded-lg border border-border bg-background/50 p-2 text-center">
                <div className="text-muted-foreground">Shared Worker</div>
                <div className="mt-1 text-lg font-bold text-emerald-400">1개</div>
                <div className="text-muted-foreground">서버 연결</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
