"use client";

import { useState } from "react";

function Box({
  label,
  sub,
  tone = "neutral",
}: {
  label: string;
  sub?: string;
  tone?: "neutral" | "worker" | "server" | "bad";
}) {
  const toneClass =
    tone === "worker"
      ? "border-indigo-500/40 bg-indigo-500/5 text-indigo-400"
      : tone === "server"
        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400"
        : tone === "bad"
          ? "border-red-500/40 bg-red-500/5 text-red-400"
          : "border-border bg-background/60 text-foreground/80";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${toneClass}`}>
      <div className="font-semibold">{label}</div>
      {sub && <div className="mt-0.5 font-mono text-[10px] opacity-80">{sub}</div>}
    </div>
  );
}

export function SharedworkerScopeDiagram() {
  const [tab, setTab] = useState<"bug" | "fixed">("bug");

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex border-b border-border">
        {[
          { id: "bug" as const, label: "이름 같음 - 스코프 오염" },
          { id: "fixed" as const, label: "이름 분리 - 스코프 격리" },
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

      <div className="p-5">
        {tab === "bug" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-2">
                <Box label="docker 탭 (먼저 열림)" sub="REGISTER baseURL=/api/proxy" />
                <Box label="k8s 탭 (나중에 열림)" sub="REGISTER baseURL=/api/proxy/k8s" tone="bad" />
              </div>
              <div className="flex flex-col gap-2 text-sm font-bold text-muted-foreground">
                <span>--→</span>
                <span>--→</span>
              </div>
              <Box
                label="PadionAlarmWorker (1개)"
                sub="setupSSE: 이미 연결됨 → no-op"
                tone="worker"
              />
              <div className="text-sm font-bold text-muted-foreground">--→</div>
              <Box label="SSE 1개" sub="/alarm/connect (docker)" tone="server" />
            </div>
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              같은 이름의 워커가 이미 있으므로 k8s 탭은 포트만 추가된다.
              k8s baseURL은 no-op 가드에 막혀 무시되고 - k8s 탭이
              docker 알람을 받는다. 에러도 없이.
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Box label="docker 탭들" sub="isK8s = false" />
                <div className="text-sm font-bold text-muted-foreground">--→</div>
                <Box label="PadionAlarmWorker" sub="name: 'PadionAlarmWorker'" tone="worker" />
                <div className="text-sm font-bold text-muted-foreground">--→</div>
                <Box label="SSE" sub="/alarm/connect" tone="server" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Box label="k8s 탭들" sub="isK8s = true" />
                <div className="text-sm font-bold text-muted-foreground">--→</div>
                <Box label="PadionAlarmWorker-k8s" sub="name: 'PadionAlarmWorker-k8s'" tone="worker" />
                <div className="text-sm font-bold text-muted-foreground">--→</div>
                <Box label="SSE" sub="/k8s/alarm/connect" tone="server" />
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
              브라우저는 SharedWorker를 (스크립트 URL + name)으로 식별한다.
              이름이 다르면 같은 worker.ts라도 별개 인스턴스 - 연결·이력·읽음
              마커가 스코프별로 격리되고, 전체 SSE 연결 수는 스코프 수와 같다.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
