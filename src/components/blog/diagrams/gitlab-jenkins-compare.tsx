"use client";

import { useState } from "react";

type Dimension = {
  id: string;
  label: string;
  gitlab: { value: string; good: boolean; note?: string };
  jenkins: { value: string; good: boolean; note?: string };
};

const dimensions: Dimension[] = [
  {
    id: "config",
    label: "설정 언어",
    gitlab: { value: "YAML (.gitlab-ci.yml)", good: true, note: "선언형, IDE 자동완성, 읽기 쉬움" },
    jenkins: { value: "Groovy DSL (Jenkinsfile)", good: false, note: "복잡한 로직 가능, 러닝 커브 높음" },
  },
  {
    id: "ops",
    label: "운영 부담",
    gitlab: { value: "낮음 (GitLab.com 사용 시 거의 없음)", good: true, note: "GitLab이 인프라 관리" },
    jenkins: { value: "높음 (서버 설치·업데이트·플러그인 관리)", good: false, note: "직접 운영 필요" },
  },
  {
    id: "integration",
    label: "플랫폼 통합",
    gitlab: { value: "Git + CI + Registry + Environments 내장", good: true, note: "하나의 플랫폼으로 전체 파이프라인" },
    jenkins: { value: "CI 서버만, 나머지는 플러그인", good: false, note: "2,000개+ 플러그인 생태계" },
  },
  {
    id: "flexibility",
    label: "유연성",
    gitlab: { value: "내장 기능 범위 내", good: false, note: "복잡한 커스텀 로직은 제한적" },
    jenkins: { value: "거의 무제한 (Groovy)", good: true, note: "어떤 빌드 로직도 구현 가능" },
  },
  {
    id: "env",
    label: "환경 변수 관리",
    gitlab: { value: "Settings → CI/CD Variables (UI)", good: true, note: "마스킹, 환경별 분리 지원" },
    jenkins: { value: "Credentials Store + 플러그인", good: true, note: "다양한 자격증명 타입 지원" },
  },
  {
    id: "trigger",
    label: "트리거 설정",
    gitlab: { value: "코드(.yml)에서 rules: 선언", good: true, note: "GitOps 친화적" },
    jenkins: { value: "UI 또는 코드(triggers {})", good: false, note: "Webhook 설정 별도 필요" },
  },
  {
    id: "onprem",
    label: "온프레미스",
    gitlab: { value: "Self-hosted GitLab 가능", good: true, note: "SaaS or Self-hosted 선택" },
    jenkins: { value: "완전 온프레미스 제어", good: true, note: "인터넷 단절 환경에서도 동작" },
  },
  {
    id: "cost",
    label: "비용",
    gitlab: { value: "Free tier 있음, 대규모 시 유료", good: true, note: "runner 분 수에 따라 과금" },
    jenkins: { value: "오픈소스 무료 (서버 비용 별도)", good: true, note: "서버 운영 인건비 포함 시 비쌀 수 있음" },
  },
];

export function GitlabJenkinsCompareDiagram() {
  const [selected, setSelected] = useState<string | null>(null);

  const active = dimensions.find((d) => d.id === selected);

  const gitlabScore = dimensions.filter((d) => d.gitlab.good).length;
  const jenkinsScore = dimensions.filter((d) => d.jenkins.good).length;

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border">
        <div className="flex items-center gap-2 border-r border-border p-4">
          <span className="text-xl">🦊</span>
          <div>
            <p className="text-sm font-bold text-orange-400">GitLab CI/CD</p>
            <p className="text-[10px] text-muted-foreground">통합 플랫폼</p>
          </div>
        </div>
        <div className="px-3 text-center text-xs text-muted-foreground">vs</div>
        <div className="flex items-center gap-2 border-l border-border p-4">
          <span className="text-xl">🤖</span>
          <div>
            <p className="text-sm font-bold text-blue-400">Jenkins</p>
            <p className="text-[10px] text-muted-foreground">전용 CI 서버</p>
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-4 py-2">
        <div className="text-right text-lg font-black text-orange-400">{gitlabScore}</div>
        <div className="text-[10px] text-muted-foreground">/ {dimensions.length} 항목</div>
        <div className="text-lg font-black text-blue-400">{jenkinsScore}</div>
      </div>

      {/* Dimension rows */}
      <div className="divide-y divide-border">
        {dimensions.map((dim) => (
          <button
            key={dim.id}
            onClick={() => setSelected(selected === dim.id ? null : dim.id)}
            className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 text-left text-xs transition-colors hover:bg-secondary/30 ${
              selected === dim.id ? "bg-secondary/50" : ""
            }`}
          >
            <span className={`font-medium ${dim.gitlab.good ? "text-orange-400" : "text-foreground/50"}`}>
              {dim.gitlab.good ? "✅" : "⚠️"} {dim.gitlab.value}
            </span>
            <span className="whitespace-nowrap rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {dim.label}
            </span>
            <span className={`text-right font-medium ${dim.jenkins.good ? "text-blue-400" : "text-foreground/50"}`}>
              {dim.jenkins.value} {dim.jenkins.good ? "✅" : "⚠️"}
            </span>
          </button>
        ))}
      </div>

      {/* Detail panel */}
      {active && (
        <div className="border-t border-border bg-secondary/30 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{active.label}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
              <p className="mb-1 text-[10px] font-bold text-orange-400">GitLab</p>
              <p className="text-xs text-foreground/70">{active.gitlab.note}</p>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <p className="mb-1 text-[10px] font-bold text-blue-400">Jenkins</p>
              <p className="text-xs text-foreground/70">{active.jenkins.note}</p>
            </div>
          </div>
        </div>
      )}

      {!active && (
        <p className="py-3 text-center text-xs text-muted-foreground">항목을 클릭하면 상세 비교를 확인할 수 있습니다</p>
      )}
    </div>
  );
}
