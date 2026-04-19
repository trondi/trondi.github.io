"use client";

import { useState } from "react";

type StageStatus = "success" | "running" | "pending" | "failed";

type Stage = {
  id: string;
  label: string;
  icon: string;
  color: string;
  duration: string;
  steps: string[];
  branch?: string; // only run on this branch
};

const stages: Stage[] = [
  {
    id: "checkout",
    label: "Checkout",
    icon: "📋",
    color: "#6366f1",
    duration: "3s",
    steps: ["checkout scm", "git log --oneline -5"],
  },
  {
    id: "install",
    label: "Install",
    icon: "📦",
    color: "#8b5cf6",
    duration: "28s",
    steps: ["npm ci", "캐시 적중 시 ~5s"],
  },
  {
    id: "test",
    label: "Test",
    icon: "🧪",
    color: "#f59e0b",
    duration: "45s",
    steps: ["npm test -- --coverage", "junit 결과 수집", "커버리지 리포트"],
  },
  {
    id: "build",
    label: "Build",
    icon: "🔨",
    color: "#10b981",
    duration: "60s",
    steps: ["npm run build", ".next/ 결과물 생성"],
  },
  {
    id: "docker",
    label: "Docker",
    icon: "🐳",
    color: "#3b82f6",
    duration: "90s",
    steps: ["docker build (멀티 스테이지)", "docker push :commit-sha", "docker push :latest"],
  },
  {
    id: "deploy",
    label: "Deploy",
    icon: "🚀",
    color: "#ec4899",
    duration: "15s",
    branch: "main",
    steps: ["ssh deploy@production", "docker pull :latest", "docker compose up -d"],
  },
];

const statusColors: Record<StageStatus, string> = {
  success: "#10b981",
  running: "#f59e0b",
  pending: "#64748b",
  failed: "#ef4444",
};

const statusLabel: Record<StageStatus, string> = {
  success: "성공",
  running: "실행 중",
  pending: "대기",
  failed: "실패",
};

export function JenkinsPipelineDiagram() {
  const [runStatus, setRunStatus] = useState<Record<string, StageStatus>>({});
  const [selected, setSelected] = useState<Stage | null>(null);
  const [branch, setBranch] = useState<"main" | "feature">("main");

  const runPipeline = () => {
    setRunStatus({});
    setSelected(null);
    let delay = 0;
    stages.forEach((stage, i) => {
      const skip = stage.branch && stage.branch !== branch;
      setTimeout(() => {
        setRunStatus((prev) => ({ ...prev, [stage.id]: skip ? "pending" : "running" }));
      }, delay);
      delay += 600;
      setTimeout(() => {
        setRunStatus((prev) => ({ ...prev, [stage.id]: skip ? "pending" : "success" }));
      }, delay);
      delay += 300;
    });
  };

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground">Branch:</span>
          {(["main", "feature"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBranch(b)}
              className={`rounded-md px-2 py-1 text-xs font-mono font-semibold transition-colors ${
                branch === b
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
        <button
          onClick={runPipeline}
          className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-500 transition-colors hover:bg-emerald-500/25"
        >
          ▶ Build Now
        </button>
      </div>

      {/* Pipeline stages */}
      <div className="overflow-x-auto p-5">
        <div className="flex min-w-max items-center gap-2">
          {stages.map((stage, i) => {
            const status = runStatus[stage.id];
            const skipped = stage.branch && stage.branch !== branch;
            const statusC = status ? statusColors[status] : stage.color;
            return (
              <>
                <button
                  key={stage.id}
                  onClick={() => setSelected(selected?.id === stage.id ? null : stage)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all hover:scale-[1.03] min-w-[80px]"
                  style={{
                    borderColor: selected?.id === stage.id ? statusC : statusC + "40",
                    backgroundColor: skipped ? "hsl(var(--secondary) / 0.3)" : statusC + "10",
                    opacity: skipped ? 0.4 : 1,
                  }}
                >
                  <span className="text-xl">{stage.icon}</span>
                  <span className="text-[11px] font-bold" style={{ color: statusC }}>
                    {stage.label}
                  </span>
                  {status && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                      style={{ backgroundColor: statusColors[status] }}
                    >
                      {statusLabel[status]}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{stage.duration}</span>
                  {stage.branch && (
                    <span className="text-[9px] text-muted-foreground font-mono">@{stage.branch}</span>
                  )}
                </button>
                {i < stages.length - 1 && (
                  <span key={`arrow-${i}`} className="text-border font-bold">→</span>
                )}
              </>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div
          className="border-t px-5 py-4"
          style={{ borderColor: selected.color + "30", backgroundColor: selected.color + "08" }}
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: selected.color }}>
            {selected.icon} {selected.label} — Steps
          </p>
          <div className="space-y-1">
            {selected.steps.map((step) => (
              <div key={step} className="flex items-center gap-2 rounded-md bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground/70">
                <span className="h-1 w-1 rounded-full bg-current opacity-50" />
                {step}
              </div>
            ))}
          </div>
          {selected.branch && branch !== selected.branch && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              ⏭️ <code className="text-amber-400">{branch}</code> 브랜치에서는 이 스테이지를 건너뜁니다 (<code className="text-amber-400">when {"{ branch 'main' }"}</code>).
            </p>
          )}
        </div>
      )}

      {Object.keys(runStatus).length === 0 && (
        <p className="pb-3 text-center text-xs text-muted-foreground">
          스테이지를 클릭해 상세 확인 · Build Now로 시뮬레이션
        </p>
      )}
    </div>
  );
}
