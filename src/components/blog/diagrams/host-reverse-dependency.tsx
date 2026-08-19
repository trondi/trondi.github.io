"use client";

import { useState } from "react";

type Tab = "before" | "after";

// Before — docker/host 셸이 k8s 도메인을 직접 import (역의존 7건)
const beforeEdges = [
  { from: "docker/host (셸)", to: "@k8s/pod", count: "4건", kind: "역의존" },
  { from: "docker/host (셸)", to: "@k8s/host", count: "3건", kind: "역의존" },
  { from: "k8s 페이지", to: "docker/host", count: "1건", kind: "잔여" },
];

export function HostReverseDependencyDiagram() {
  const [tab, setTab] = useState<Tab>("before");

  const tabs: { id: Tab; label: string }[] = [
    { id: "before", label: "Before (역의존 7)" },
    { id: "after", label: "After (역의존 0)" },
  ];

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
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
        {tab === "before" && (
          <div className="space-y-3">
            {/* 셸 */}
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-rose-400">
                공유 셸 (docker/host에 위치)
              </div>
              <div className="mt-1 font-mono text-[11px] text-foreground/70">
                HostController · HostTable · HostModalController
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                pathname으로 isK8s 분기 → 양쪽 도메인을 직접 앎
              </div>
            </div>

            {/* 역의존 엣지들 */}
            <div className="space-y-2">
              {beforeEdges.map((e) => (
                <div
                  key={`${e.from}-${e.to}`}
                  className="flex items-center gap-2 font-mono text-[11px]"
                >
                  <span className="text-foreground/70">{e.from}</span>
                  <span className={e.kind === "역의존" ? "text-rose-400" : "text-amber-400"}>
                    ──▶
                  </span>
                  <span className="text-foreground/70">{e.to}</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      e.kind === "역의존"
                        ? "bg-rose-500/15 text-rose-400"
                        : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {e.kind} {e.count}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] leading-5 text-foreground/70">
              ⚠️ 런타임 5건(podModalConfig · usePodActionHandler · PodLogModal · getK8sHostColumns ·
              PodExpandRow)이 docker 번들에 k8s 코드를 끌어옴. <strong>존 순수성 붕괴.</strong>
            </div>
          </div>
        )}

        {tab === "after" && (
          <div className="space-y-3">
            {/* 계약 */}
            <div className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400">
                HostExtension (계약 · 도메인 import 0)
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                row 타입은 공통 베이스 HostBase만 사용
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
              <span>▲ inject (docker 조각)</span>
              <span className="px-2">│</span>
              <span>inject (k8s 조각) ▲</span>
            </div>

            {/* 두 페이지 / 두 확장 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="font-mono text-[11px] text-foreground/80">docker 페이지</div>
                <div className="mt-1 font-mono text-[10px] text-emerald-400">
                  useDockerHostExtension
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">@cntr/* 만 import</div>
                <div className="mt-1 text-[10px] text-emerald-400">docker → docker ✓</div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="font-mono text-[11px] text-foreground/80">k8s 페이지</div>
                <div className="mt-1 font-mono text-[10px] text-emerald-400">
                  useK8sHostExtension
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">@k8s/* 만 import</div>
                <div className="mt-1 text-[10px] text-emerald-400">k8s → k8s ✓</div>
              </div>
            </div>

            <div className="flex items-center justify-center py-0.5 text-[11px] text-muted-foreground">
              ↓ ext 주입
            </div>

            {/* 셸 */}
            <div className="rounded-xl border border-border bg-background/50 p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                공유 셸
              </div>
              <div className="mt-1 font-mono text-[11px] text-foreground/70">
                HostController · HostTable · HostModalController
              </div>
              <div className="mt-1 text-[10px] text-emerald-400">어느 도메인도 모름 · k8s import 0</div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-5 text-foreground/70">
              💡 의존 방향이 <strong>셸 ← 페이지</strong>로 역전됐다. 잔여 엣지(k8s 페이지 → docker/host)는
              셸을 <code className="text-amber-400">shared/host</code>로 옮기면 사라짐(후속).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
