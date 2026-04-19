"use client";

import { useState } from "react";

type Strategy = {
  id: string;
  label: string;
  color: string;
  tagline: string;
  when: string;
  ttfb: string;
  seo: boolean;
  server: boolean;
  freshness: string;
  flow: string[];
  note: string;
  noteOk: boolean;
};

const strategies: Strategy[] = [
  {
    id: "csr",
    label: "CSR",
    color: "#f97316",
    tagline: "브라우저가 모든 걸 처리",
    when: "브라우저에서 JS 실행 후",
    ttfb: "⚡ 빠름",
    seo: false,
    server: false,
    freshness: "실시간",
    flow: ["브라우저 요청", "→", "빈 HTML 반환", "→", "JS 번들 실행", "→", "API fetch", "→", "화면 완성"],
    note: "JS 실행 전 사용자는 빈 화면을 봅니다.",
    noteOk: false,
  },
  {
    id: "ssg",
    label: "SSG",
    color: "#8b5cf6",
    tagline: "빌드 때 다 만들어 놓음",
    when: "빌드 타임 (1회)",
    ttfb: "⚡⚡ 최고",
    seo: true,
    server: false,
    freshness: "빌드 시 고정",
    flow: ["next build", "→", "API/DB fetch", "→", "HTML 생성", "→", "CDN 배포", "↓", "사용자 요청", "→", "CDN 즉시 응답"],
    note: "서버 연산 없음. 콘텐츠가 바뀌면 재빌드 필요.",
    noteOk: true,
  },
  {
    id: "isr",
    label: "ISR",
    color: "#10b981",
    tagline: "SSG + 주기적 자동 갱신",
    when: "빌드 타임 + 백그라운드 갱신",
    ttfb: "⚡ 빠름",
    seo: true,
    server: true,
    freshness: "설정 주기마다",
    flow: ["요청 → CDN 캐시 즉시 응답", "↕", "revalidate 초과 시: 백그라운드 재생성"],
    note: "Stale-While-Revalidate — 오래된 캐시를 먼저 주고, 뒤에서 조용히 갱신.",
    noteOk: true,
  },
  {
    id: "ssr",
    label: "SSR",
    color: "#3b82f6",
    tagline: "요청마다 서버에서 렌더",
    when: "요청마다 서버에서",
    ttfb: "🐢 느림",
    seo: true,
    server: true,
    freshness: "항상 최신",
    flow: ["브라우저 요청", "→", "서버 수신", "→", "DB/API query", "→", "HTML 생성", "→", "완성 HTML 전송"],
    note: "DB 처리 시간 전체가 TTFB에 포함됩니다. 서버 부하 주의.",
    noteOk: false,
  },
];

export function RenderingStrategiesDiagram() {
  const [selected, setSelected] = useState<string | null>(null);

  const active = strategies.find((s) => s.id === selected);

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Strategy selector */}
      <div className="grid grid-cols-4 gap-px bg-border">
        {strategies.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(selected === s.id ? null : s.id)}
            className="flex flex-col items-center gap-1 py-4 text-center transition-colors"
            style={{
              backgroundColor: selected === s.id ? s.color + "15" : "hsl(var(--background))",
              borderBottom: selected === s.id ? `2px solid ${s.color}` : "2px solid transparent",
            }}
          >
            <span className="text-base font-black" style={{ color: s.color }}>{s.label}</span>
            <span className="text-[10px] text-muted-foreground leading-4 px-1">{s.tagline}</span>
          </button>
        ))}
      </div>

      {/* Summary table */}
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border text-center text-[10px]">
        {strategies.map((s) => (
          <div key={s.id} className="space-y-1 px-2 py-2">
            <div className="text-muted-foreground">HTML 생성</div>
            <div className="font-semibold text-foreground/80 leading-4">{s.when}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border text-center text-[10px]">
        {strategies.map((s) => (
          <div key={s.id} className="space-y-0.5 px-2 py-2">
            <div className="text-muted-foreground">TTFB</div>
            <div className="font-semibold">{s.ttfb}</div>
            <div>SEO {s.seo ? "✅" : "❌"}</div>
            <div>서버 {s.server ? "필요" : "불필요"}</div>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {active && (
        <div className="p-4" style={{ borderTop: `2px solid ${active.color}30` }}>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: active.color }}>
            {active.label} — 데이터 흐름
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            {active.flow.map((step, i) => (
              <span
                key={i}
                className={
                  step === "→" || step === "↓" || step === "↕"
                    ? "text-border font-bold"
                    : "rounded-md border border-border bg-background/60 px-2 py-0.5 font-medium text-foreground/70"
                }
              >
                {step}
              </span>
            ))}
          </div>
          <div
            className="rounded-lg px-3 py-2 text-xs leading-5"
            style={{
              backgroundColor: active.color + "10",
              borderLeft: `3px solid ${active.color}`,
              color: "hsl(var(--foreground) / 0.7)",
            }}
          >
            {active.noteOk ? "✅" : "⚠️"} {active.note}
          </div>
        </div>
      )}

      {!active && (
        <p className="py-3 text-center text-xs text-muted-foreground">전략 탭을 클릭하면 흐름도와 특성을 확인할 수 있습니다</p>
      )}
    </div>
  );
}
