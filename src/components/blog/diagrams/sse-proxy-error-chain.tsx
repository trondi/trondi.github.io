"use client";

import { useState } from "react";

function FlowBox({
  label,
  sub,
  tone = "neutral",
}: {
  label: string;
  sub?: string;
  tone?: "neutral" | "bad" | "good" | "warn";
}) {
  const toneClass =
    tone === "bad"
      ? "border-red-500/40 bg-red-500/5 text-red-400"
      : tone === "good"
        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400"
        : tone === "warn"
          ? "border-orange-500/40 bg-orange-500/5 text-orange-400"
          : "border-border bg-background/60 text-foreground/80";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${toneClass}`}>
      <div className="font-semibold">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] opacity-80">{sub}</div>}
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 pl-4 text-muted-foreground">
      <span className="text-sm">↓</span>
      {label && <span className="text-[11px]">{label}</span>}
    </div>
  );
}

export function SseProxyErrorChainDiagram() {
  const [tab, setTab] = useState<"before" | "after">("before");

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex border-b border-border">
        {[
          { id: "before" as const, label: "수정 전 - 무한 루프" },
          { id: "after" as const, label: "수정 후 - 5회 수렴" },
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

      <div className="flex flex-col gap-1.5 p-5">
        {tab === "before" ? (
          <>
            <FlowBox label="백엔드" sub='401 {"error":"Unauthorized"}' tone="warn" />
            <Arrow />
            <FlowBox
              label="프록시 (route.ts)"
              sub="상태코드 무시 - 무조건 200 + text/event-stream으로 포장"
              tone="bad"
            />
            <Arrow label="401 정보 증발" />
            <FlowBox
              label="브라우저 EventSource"
              sub="onopen 발화 (연결 성공으로 착각) → 스트림 즉시 종료"
            />
            <Arrow />
            <FlowBox
              label="내장 자동 재연결"
              sub="백오프 없음 · 상한 없음 - 짧은 간격으로 재시도"
              tone="bad"
            />
            <div className="flex items-center gap-2 pl-4 text-red-400">
              <span className="text-sm">↺</span>
              <span className="text-[11px]">다시 연결(200) → 무한 반복</span>
            </div>
            <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 font-mono text-[11px] text-red-400">
              [Client] SSE 재연결 성공
              <br />
              [Client] SSE 재연결 성공
              <br />
              [Client] SSE 재연결 성공 …
            </div>
          </>
        ) : (
          <>
            <FlowBox label="백엔드" sub='401 {"error":"Unauthorized"}' tone="warn" />
            <Arrow />
            <FlowBox
              label="프록시 (route.ts)"
              sub="non-200이면 상태코드·body 그대로 passthrough"
              tone="good"
            />
            <Arrow label="401이 브라우저까지 도착" />
            <FlowBox
              label="브라우저 EventSource"
              sub="연결 열리지 못함 → onerror"
            />
            <Arrow />
            <FlowBox
              label="워커 attemptReconnect"
              sub="onerror에서 항상 close() - 내장 재연결 차단, 지수 백오프 1s→2s→4s→8s→16s"
              tone="good"
            />
            <Arrow label="5회 소진" />
            <FlowBox
              label="DISCONNECTED 확정"
              sub="헤더 UI: Offline + 툴팁에 실패 원인(401 · 메시지) 표시"
              tone="neutral"
            />
          </>
        )}
      </div>
    </div>
  );
}
