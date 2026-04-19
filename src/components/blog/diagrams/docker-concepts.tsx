"use client";

import { useState } from "react";

const vmLayers = [
  { label: "App A", color: "#6366f1" },
  { label: "App B", color: "#8b5cf6" },
  { label: "Guest OS", color: "#64748b" },
  { label: "Guest OS", color: "#64748b" },
  { label: "Hypervisor", color: "#475569" },
  { label: "Host OS", color: "#334155" },
  { label: "Hardware", color: "#1e293b" },
];

const containerLayers = [
  { label: "App A", color: "#6366f1" },
  { label: "App B", color: "#8b5cf6" },
  { label: "Container Runtime", color: "#10b981" },
  { label: "Host OS", color: "#334155" },
  { label: "Hardware", color: "#1e293b" },
];

const imageLayers = [
  { label: "COPY . /app   ← app layer", color: "#6366f1", size: "12 MB" },
  { label: "RUN npm ci    ← deps layer", color: "#8b5cf6", size: "180 MB" },
  { label: "node:20-alpine ← runtime layer", color: "#10b981", size: "53 MB" },
  { label: "alpine:3.19   ← base layer", color: "#64748b", size: "8 MB" },
];

const stageFlow = [
  {
    stage: "builder",
    icon: "🔨",
    color: "#f59e0b",
    label: "Build Stage",
    items: ["node:20-alpine", "npm ci", "npm run build", "→ .next/ 결과물"],
  },
  {
    stage: "runner",
    icon: "🚀",
    color: "#10b981",
    label: "Production Stage",
    items: ["node:20-alpine", "COPY --from=builder .next/", "COPY public/", "CMD node server.js"],
  },
];

type Tab = "vm-vs-container" | "image-layers" | "multi-stage";

export function DockerConceptsDiagram() {
  const [tab, setTab] = useState<Tab>("vm-vs-container");

  const tabs: { id: Tab; label: string }[] = [
    { id: "vm-vs-container", label: "VM vs Container" },
    { id: "image-layers", label: "이미지 레이어" },
    { id: "multi-stage", label: "멀티 스테이지 빌드" },
  ];

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
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

      {tab === "vm-vs-container" && (
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {/* VM */}
          <div>
            <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">Virtual Machine</p>
            <div className="flex flex-col-reverse gap-px overflow-hidden rounded-xl border border-border">
              {vmLayers.map((layer, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center py-2 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: layer.color, opacity: 0.75 + i * 0.04 }}
                >
                  {layer.label}
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">Guest OS 전체 포함 → 수 GB, 수십 초 기동</p>
          </div>

          {/* Container */}
          <div>
            <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">Container</p>
            <div className="flex flex-col-reverse gap-px overflow-hidden rounded-xl border border-border">
              {containerLayers.map((layer, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center py-2 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: layer.color, opacity: 0.75 + i * 0.05 }}
                >
                  {layer.label}
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">OS 커널 공유 → 수백 MB, 수백 ms 기동</p>
          </div>

          {/* 비교표 */}
          <div className="col-span-full grid grid-cols-3 gap-2 text-[11px]">
            {[
              { label: "기동 시간", vm: "수십 초", ct: "수백 ms" },
              { label: "이미지 크기", vm: "수 GB", ct: "수십~수백 MB" },
              { label: "격리 수준", vm: "강함 (OS 단위)", ct: "충분함 (프로세스)" },
            ].map((row) => (
              <div key={row.label} className="rounded-lg border border-border bg-background/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">{row.label}</p>
                <p className="mt-1 font-semibold text-red-400 line-through">{row.vm}</p>
                <p className="font-semibold text-emerald-400">{row.ct}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "image-layers" && (
        <div className="p-5">
          <p className="mb-4 text-xs text-muted-foreground">이미지는 레이어 스택 구조입니다. 변경된 레이어만 재빌드해 캐시를 활용합니다.</p>
          <div className="flex flex-col-reverse gap-px overflow-hidden rounded-xl border border-border">
            {imageLayers.map((layer, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 text-xs font-mono text-white"
                style={{ backgroundColor: layer.color + "cc" }}
              >
                <span>{layer.label}</span>
                <span className="opacity-70">{layer.size}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-foreground/70">
            💡 <strong>캐시 전략:</strong> 자주 바뀌는 레이어는 위에, 잘 안 바뀌는 레이어(의존성)는 아래에 두면 빌드가 빠릅니다.
            <br />
            <code className="text-amber-400">package.json</code>을 소스 코드보다 먼저 COPY 하는 이유입니다.
          </div>
        </div>
      )}

      {tab === "multi-stage" && (
        <div className="p-5">
          <p className="mb-4 text-xs text-muted-foreground">빌드 결과물만 최종 이미지에 담아 크기를 크게 줄입니다.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            {stageFlow.map((stage, i) => (
              <div key={stage.stage} className="flex-1">
                <div
                  className="h-full rounded-xl border p-4"
                  style={{ borderColor: stage.color + "50", backgroundColor: stage.color + "08" }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xl">{stage.icon}</span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: stage.color }}>
                        {stage.stage}
                      </p>
                      <p className="text-xs font-semibold text-foreground/80">{stage.label}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {stage.items.map((item) => (
                      <div key={item} className="rounded bg-background/50 px-2 py-1 font-mono text-[11px] text-foreground/70">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                {i === 0 && (
                  <div className="flex items-center justify-center py-2 text-xs text-muted-foreground sm:hidden">
                    ↓ .next/ 결과물만 복사
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 hidden items-center justify-center gap-3 text-xs text-muted-foreground sm:flex">
            <span className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-amber-400">builder: ~300 MB</span>
            <span>→ 결과물만 COPY →</span>
            <span className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-emerald-400">runner: ~60 MB</span>
          </div>
        </div>
      )}
    </div>
  );
}
