"use client";

import { useState } from "react";

type Mode = "fork" | "cluster";

const deploySteps = [
  { icon: "📥", label: "git pull", color: "#6366f1", desc: "최신 코드 내려받기" },
  { icon: "📦", label: "npm ci", color: "#8b5cf6", desc: "의존성 설치 (lock 파일 기준)" },
  { icon: "🔨", label: "npm run build", color: "#f59e0b", desc: "프로덕션 빌드" },
  { icon: "♻️", label: "pm2 reload", color: "#10b981", desc: "무중단 순차 재시작" },
];

export function Pm2ConceptsDiagram() {
  const [mode, setMode] = useState<Mode>("cluster");
  const [instances, setInstances] = useState(4);
  const [reloading, setReloading] = useState<number | null>(null);
  const [reloadStep, setReloadStep] = useState(0);
  const [deployStep, setDeployStep] = useState(-1);

  const runReload = () => {
    setReloading(0);
    setReloadStep(0);
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      if (step >= instances) {
        clearInterval(interval);
        setTimeout(() => setReloading(null), 600);
      } else {
        setReloading(step);
      }
    }, 500);
  };

  const runDeploy = () => {
    setDeployStep(0);
    let step = 0;
    const next = () => {
      step += 1;
      if (step <= deploySteps.length) {
        setDeployStep(step);
        setTimeout(next, 700);
      } else {
        setTimeout(() => setDeployStep(-1), 800);
      }
    };
    setTimeout(next, 700);
  };

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Mode toggle */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground">exec_mode:</span>
          {(["fork", "cluster"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2 py-1 font-mono text-xs font-semibold transition-colors ${
                mode === m
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === "cluster" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">instances:</span>
            {[1, 2, 4, 8].map((n) => (
              <button
                key={n}
                onClick={() => setInstances(n)}
                className={`h-6 w-6 rounded text-xs font-semibold transition-colors ${
                  instances === n
                    ? "bg-emerald-500 text-white"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-5">
        {/* Process visualization */}
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            실행 중인 프로세스
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: mode === "fork" ? 1 : instances }).map((_, i) => {
              const isReloading = reloading !== null && i === reloading;
              const isDone = reloading !== null && i < reloading;
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all min-w-[72px]"
                  style={{
                    borderColor: isReloading
                      ? "#f59e0b"
                      : isDone
                      ? "#10b981"
                      : "#6366f1" + "60",
                    backgroundColor: isReloading
                      ? "#f59e0b10"
                      : isDone
                      ? "#10b98110"
                      : "#6366f108",
                  }}
                >
                  <span className="text-xl">{isReloading ? "⏳" : isDone ? "✅" : "⚙️"}</span>
                  <span
                    className="text-[10px] font-bold"
                    style={{
                      color: isReloading ? "#f59e0b" : isDone ? "#10b981" : "#6366f1",
                    }}
                  >
                    {mode === "fork" ? "app" : `app-${i}`}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {isReloading ? "재시작 중" : isDone ? "완료" : "실행 중"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reload vs Restart comparison */}
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <button
            onClick={mode === "cluster" ? runReload : undefined}
            disabled={mode === "fork"}
            className={`rounded-xl border px-4 py-3 text-left transition-all ${
              mode === "cluster"
                ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 cursor-pointer"
                : "border-border bg-secondary/30 opacity-40 cursor-not-allowed"
            }`}
          >
            <p className="text-xs font-bold text-emerald-500">pm2 reload ✅</p>
            <p className="mt-1 text-[11px] text-foreground/60">
              순차 재시작 — 항상 N-1개가 살아있어 다운타임 없음
            </p>
            {mode === "cluster" && (
              <p className="mt-1 text-[10px] text-emerald-400">클릭해서 시뮬레이션</p>
            )}
            {mode === "fork" && (
              <p className="mt-1 text-[10px] text-muted-foreground">클러스터 모드에서만 유효</p>
            )}
          </button>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-xs font-bold text-red-400">pm2 restart ⚠️</p>
            <p className="mt-1 text-[11px] text-foreground/60">
              전체 중지 후 재시작 — 짧은 다운타임 발생
            </p>
          </div>
        </div>

        {/* Deploy pipeline */}
        <div className="border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              배포 파이프라인
            </p>
            <button
              onClick={runDeploy}
              disabled={deployStep >= 0}
              className="rounded-lg bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-40"
            >
              ▶ 배포 시작
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {deploySteps.map((step, i) => {
              const active = deployStep === i + 1;
              const done = deployStep > i + 1 || deployStep === -1 && i < deploySteps.length;
              return (
                <>
                  <div
                    key={step.label}
                    className="flex flex-col items-center gap-1 rounded-xl border px-3 py-2 text-center transition-all min-w-[80px]"
                    style={{
                      borderColor: active ? step.color : deployStep > i + 1 ? "#10b981" : step.color + "30",
                      backgroundColor: active ? step.color + "15" : deployStep > i + 1 ? "#10b98108" : undefined,
                    }}
                  >
                    <span className="text-lg">{deployStep > i + 1 ? "✅" : step.icon}</span>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: active ? step.color : "hsl(var(--foreground) / 0.6)" }}>
                      {step.label}
                    </span>
                  </div>
                  {i < deploySteps.length - 1 && (
                    <span key={`arr-${i}`} className="text-border">→</span>
                  )}
                </>
              );
            })}
          </div>
          {deployStep > 0 && deployStep <= deploySteps.length && (
            <p className="mt-2 text-xs text-muted-foreground">
              {deploySteps[deployStep - 1]?.desc}…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
