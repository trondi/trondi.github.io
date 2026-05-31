"use client";

import { useState } from "react";

type PageType = "HOST" | "CNTR" | "ALL";

const PAGE_SCENARIOS: Record<
  PageType,
  { label: string; color: string; steps: Step[] }
> = {
  HOST: {
    label: "HOST 페이지 (HostTable)",
    color: "text-orange-400",
    steps: [
      {
        id: "q1",
        question: "큐가 비어있나?",
        yes: { label: "NONE", color: "text-slate-400", end: true },
        no: "q2",
      },
      {
        id: "q2",
        question: "HOST 알람 + notiAct ∈ ['CRT', 'DEL'] ?",
        yes: { label: "FULL_REFRESH", color: "text-red-400", end: true, reason: "호스트 추가/삭제 → 행 수 변화" },
        no: "q3",
      },
      {
        id: "q3",
        question: "현재 페이지의 호스트/컨테이너와\n관련 있는 알람이 있나?",
        yes: "q4",
        no: { label: "NONE", color: "text-slate-400", end: true, reason: "현재 화면과 무관" },
      },
      {
        id: "q4",
        question: `관련 알람 수 ≥ threshold (기본 8개)?`,
        yes: { label: "FULL_REFRESH", color: "text-red-400", end: true, reason: "알람 폭발 → 전체 재조회가 효율적" },
        no: { label: "ROW_UPDATE", color: "text-emerald-400", end: true, reason: "변경된 행만 API 재조회 후 캐시 교체" },
      },
    ],
  },
  CNTR: {
    label: "CNTR 페이지 (CntrTable)",
    color: "text-sky-400",
    steps: [
      {
        id: "q1",
        question: "큐가 비어있나?",
        yes: { label: "NONE", color: "text-slate-400", end: true },
        no: "q2",
      },
      {
        id: "q2",
        question: "CNTR 알람 + notiAct ∈\n['create','destroy','CRT','RM','RMF'] ?",
        yes: { label: "FULL_REFRESH", color: "text-red-400", end: true, reason: "컨테이너 생성/삭제 → 행 수 변화" },
        no: "q3",
      },
      {
        id: "q3",
        question: "현재 페이지의 컨테이너와\n관련 있는 알람이 있나?",
        yes: "q4",
        no: { label: "NONE", color: "text-slate-400", end: true, reason: "현재 화면과 무관" },
      },
      {
        id: "q4",
        question: `관련 알람 수 ≥ threshold (기본 8개)?`,
        yes: { label: "FULL_REFRESH", color: "text-red-400", end: true, reason: "알람 폭발 → 전체 재조회가 효율적" },
        no: { label: "ROW_UPDATE", color: "text-emerald-400", end: true, reason: "변경된 컨테이너 행만 API 재조회 후 캐시 교체" },
      },
    ],
  },
  ALL: {
    label: "ALL (Header / NotiTable)",
    color: "text-slate-400",
    steps: [
      {
        id: "q1",
        question: "큐가 비어있나?",
        yes: { label: "NONE", color: "text-slate-400", end: true },
        no: "q2",
      },
      {
        id: "q2",
        question: `관련 알람 수 ≥ threshold (기본 8개)?`,
        yes: { label: "FULL_REFRESH*", color: "text-red-400", end: true, reason: "* ALL 타입은 refetch 없음, history 업데이트만" },
        no: { label: "ROW_UPDATE*", color: "text-emerald-400", end: true, reason: "* ALL 타입은 테이블 갱신 없음, history + hasUnread만 업데이트" },
      },
    ],
  },
};

type Leaf = { label: string; color: string; end: true; reason?: string };
type Step = {
  id: string;
  question: string;
  yes: Leaf | string;
  no: Leaf | string;
};

export function AlarmUpdateStrategyDiagram() {
  const [pageType, setPageType] = useState<PageType>("HOST");
  const scenario = PAGE_SCENARIOS[pageType];

  const renderLeaf = (leaf: Leaf) => (
    <div className="flex flex-col items-center gap-1">
      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getLeafBorder(leaf.color)} ${leaf.color}`}>
        {leaf.label}
      </span>
      {leaf.reason && (
        <span className="max-w-[140px] text-center text-[10px] text-muted-foreground">{leaf.reason}</span>
      )}
    </div>
  );

  const renderBranch = (target: Leaf | string, steps: Step[]) => {
    if (typeof target !== "string") return renderLeaf(target);
    const next = steps.find((s) => s.id === target);
    if (!next) return null;
    return renderStep(next, steps);
  };

  const renderStep = (step: Step, steps: Step[]): React.ReactNode => (
    <div className="flex flex-col items-center gap-2">
      {/* Diamond decision node */}
      <div className="max-w-[200px] rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-center">
        <div className="whitespace-pre-line text-[11px] font-semibold text-violet-300">{step.question}</div>
      </div>
      {/* YES / NO branches */}
      <div className="flex items-start gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] font-bold text-emerald-400">YES ↓</span>
          {renderBranch(step.yes, steps)}
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] font-bold text-red-400">NO ↓</span>
          {renderBranch(step.no, steps)}
        </div>
      </div>
    </div>
  );

  const rootStep = scenario.steps[0];

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        업데이트 전략 결정 플로우
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {(["HOST", "CNTR", "ALL"] as PageType[]).map((pt) => (
          <button
            key={pt}
            onClick={() => setPageType(pt)}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${
              pageType === pt
                ? `border-b-2 border-foreground ${PAGE_SCENARIOS[pt].color}`
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {pt}
          </button>
        ))}
      </div>

      <div className="p-5">
        <div className="mb-4 text-center text-xs text-muted-foreground">
          {scenario.label}
        </div>
        <div className="flex justify-center">
          {renderStep(rootStep, scenario.steps)}
        </div>

        {/* Legend */}
        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-4">
          <LegendItem
            label="FULL_REFRESH"
            color="text-red-400 border-red-500/30 bg-red-500/5"
            desc="refetch() 전체 재조회"
          />
          <LegendItem
            label="ROW_UPDATE"
            color="text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
            desc="setQueryData() 행 교체"
          />
          <LegendItem
            label="NONE"
            color="text-slate-400 border-slate-500/30 bg-slate-500/5"
            desc="업데이트 없음"
          />
        </div>
      </div>
    </div>
  );
}

function getLeafBorder(colorClass: string) {
  if (colorClass.includes("red")) return "border-red-500/40 bg-red-500/10";
  if (colorClass.includes("emerald")) return "border-emerald-500/40 bg-emerald-500/10";
  return "border-slate-500/40 bg-slate-500/10";
}

function LegendItem({
  label,
  color,
  desc,
}: {
  label: string;
  color: string;
  desc: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${color}`}>
      <div className="text-[11px] font-bold">{label}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{desc}</div>
    </div>
  );
}
