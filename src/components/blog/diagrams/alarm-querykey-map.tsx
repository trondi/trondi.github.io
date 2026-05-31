"use client";

import { useState } from "react";

type Component = "HostTable" | "CntrTable" | "HostExpandRow";

const COMPONENTS: Record<
  Component,
  {
    label: string;
    pageType: string;
    pageTypeColor: string;
    queryKey: string;
    matchMode: "prefix" | "exact";
    matchTarget: string;
    updateTarget: string;
    updateDesc: string;
    alarmFilter: string;
    flow: FlowItem[];
  }
> = {
  HostTable: {
    label: "HostTable",
    pageType: "HOST",
    pageTypeColor: "text-orange-400 border-orange-500/40 bg-orange-500/10",
    queryKey: "없음 (기본값 사용)",
    matchMode: "prefix",
    matchTarget: "HOST_LIST",
    updateTarget: "[HOST_LIST, ...params]",
    updateDesc: "HOST_LIST로 시작하는 모든 쿼리 업데이트",
    alarmFilter: "HOST + CNTR 알람 수신\n→ 호스트 행 갱신",
    flow: [
      { label: "ALARM_PAGE_TYPE.HOST", color: "orange" },
      { label: "queryKeyPrefix = HOST_LIST", color: "violet" },
      { label: "key[0] === 'HOST_LIST' 쿼리 전체", color: "sky" },
      { label: "setQueryData → hostId 기준 행 교체", color: "emerald" },
      { label: "HostTable 리렌더", color: "default" },
    ],
  },
  CntrTable: {
    label: "CntrTable",
    pageType: "CNTR",
    pageTypeColor: "text-sky-400 border-sky-500/40 bg-sky-500/10",
    queryKey: "없음 (기본값 사용)",
    matchMode: "prefix",
    matchTarget: "CNTR_LIST",
    updateTarget: "[CNTR_LIST]",
    updateDesc: "CNTR_LIST로 시작하는 모든 쿼리 업데이트",
    alarmFilter: "CNTR 알람만 수신\n→ 컨테이너 행 갱신",
    flow: [
      { label: "ALARM_PAGE_TYPE.CNTR", color: "sky" },
      { label: "queryKeyPrefix = CNTR_LIST", color: "violet" },
      { label: "key[0] === 'CNTR_LIST' 쿼리 전체", color: "sky" },
      { label: "setQueryData → cntrId-hostId 기준 행 교체", color: "emerald" },
      { label: "CntrTable 리렌더 (캐시 직접 읽기)", color: "default" },
    ],
  },
  HostExpandRow: {
    label: "HostExpandRow",
    pageType: "HOST",
    pageTypeColor: "text-orange-400 border-orange-500/40 bg-orange-500/10",
    queryKey: "[CNTR_LIST, hostId]",
    matchMode: "exact",
    matchTarget: "[CNTR_LIST, hostId]",
    updateTarget: "[CNTR_LIST, hostId]",
    updateDesc: "정확히 일치하는 쿼리만 업데이트 (다른 호스트 expand row 미영향)",
    alarmFilter: "HOST + CNTR 알람 수신\n→ 이 호스트의 컨테이너 행만 갱신",
    flow: [
      { label: "ALARM_PAGE_TYPE.HOST", color: "orange" },
      { label: "queryKey = [CNTR_LIST, hostId] 전달", color: "violet" },
      { label: "getQueryData([CNTR_LIST, hostId]) exact 매칭", color: "sky" },
      { label: "setQueryData → cntrId-hostId 기준 행 교체", color: "emerald" },
      { label: "이 HostExpandRow만 리렌더", color: "default" },
    ],
  },
};

type FlowItem = { label: string; color: "orange" | "sky" | "violet" | "emerald" | "default" };

const flowColors: Record<FlowItem["color"], string> = {
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  violet: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  default: "border-border bg-secondary/30 text-foreground/70",
};

export function AlarmQuerykeyMapDiagram() {
  const [active, setActive] = useState<Component>("HostTable");
  const info = COMPONENTS[active];

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        컴포넌트별 queryKey → 캐시 업데이트 경로
      </div>

      {/* Component selector */}
      <div className="flex border-b border-border">
        {(Object.keys(COMPONENTS) as Component[]).map((comp) => (
          <button
            key={comp}
            onClick={() => setActive(comp)}
            className={`flex-1 py-3 text-xs font-semibold transition-colors ${
              active === comp
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {comp}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* Info grid */}
        <div className="mb-5 grid grid-cols-2 gap-3 text-[11px]">
          <InfoRow label="pageType">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${info.pageTypeColor}`}>
              {info.pageType}
            </span>
          </InfoRow>
          <InfoRow label="알람 필터">
            <span className="whitespace-pre-line text-muted-foreground">{info.alarmFilter}</span>
          </InfoRow>
          <InfoRow label="전달하는 queryKey">
            <code className="rounded bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
              {info.queryKey}
            </code>
          </InfoRow>
          <InfoRow label="매칭 방식">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                info.matchMode === "exact"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : "border-indigo-500/40 bg-indigo-500/10 text-indigo-400"
              }`}
            >
              {info.matchMode === "exact" ? "exact 매칭" : "prefix 매칭"}
            </span>
          </InfoRow>
          <InfoRow label="업데이트 대상 쿼리" wide>
            <code className="rounded bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
              {info.updateTarget}
            </code>
            <span className="ml-2 text-muted-foreground">{info.updateDesc}</span>
          </InfoRow>
        </div>

        {/* Flow steps */}
        <div className="space-y-1">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            실행 흐름
          </div>
          {info.flow.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              <div
                className={`flex-1 rounded-lg border px-3 py-1.5 text-[11px] font-medium ${flowColors[step.color]}`}
              >
                {step.label}
              </div>
            </div>
          ))}
        </div>

        {/* Comparison note for prefix vs exact */}
        {info.matchMode === "prefix" && active === "CntrTable" && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
            ⚠️ prefix 매칭이므로 <code className="text-amber-200">[CNTR_LIST, hostId]</code> 쿼리(HostExpandRow)도 함께 업데이트될 수 있습니다.
          </div>
        )}
        {info.matchMode === "exact" && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300">
            ✅ exact 매칭이므로 <code className="text-emerald-200">[CNTR_LIST, {"{다른 hostId}"}]</code> 쿼리는 영향받지 않습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}
