"use client";

import { useState } from "react";

const LENSES = [
  {
    key: "taxonomy",
    tab: "택소노미",
    en: "Taxonomy",
    analogy: "옷장 서랍처럼",
    take: "위아래로 나눈다. 한 항목은 한 곳에만 들어간다.",
  },
  {
    key: "topology",
    tab: "토폴로지",
    en: "Topology",
    analogy: "지하철 노선도처럼",
    take: "이어졌다는 것만 안다. 무슨 사이인지는 모른다.",
  },
  {
    key: "ontology",
    tab: "온톨로지",
    en: "Ontology",
    analogy: "가족관계도처럼",
    take: "선마다 이름표가 붙는다. 그래서 추론까지 된다.",
  },
] as const;

function Node({ children, soft }: { children: React.ReactNode; soft?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border px-3 py-1.5 text-sm ${
        soft
          ? "border-border bg-background/60 text-muted-foreground"
          : "border-border bg-secondary/70 text-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function Edge({ label }: { label?: string }) {
  return (
    <span className="flex min-w-[56px] flex-1 flex-col items-center">
      <span className="h-4 text-[11px] leading-4 text-muted-foreground">{label ?? ""}</span>
      <span className="flex w-full items-center">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[10px] leading-none text-muted-foreground">▶</span>
      </span>
    </span>
  );
}

export function StructureThreeLensesDiagram() {
  const [lens, setLens] = useState<(typeof LENSES)[number]["key"]>("taxonomy");
  const current = LENSES.find((l) => l.key === lens)!;

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {LENSES.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setLens(l.key)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              lens === l.key
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.tab}
          </button>
        ))}
      </div>

      <div className="px-4 py-5">
        <p className="mb-3 text-[11px] text-muted-foreground">{current.analogy}</p>

        {lens === "taxonomy" && (
          <div className="space-y-1.5 text-sm">
            <Node>옷</Node>
            <div className="ml-4 space-y-1.5 border-l border-border pl-4 pt-1.5">
              <Node>상의</Node>
              <div className="ml-4 flex flex-wrap gap-2 border-l border-border pl-4 pt-1.5">
                <Node soft>반팔</Node>
                <Node soft>긴팔</Node>
              </div>
              <div className="pt-1.5">
                <Node>하의</Node>
              </div>
            </div>
          </div>
        )}

        {lens === "topology" && (
          <div className="flex items-end">
            <Node>시청</Node>
            <Edge />
            <Node>을지로</Node>
            <Edge />
            <Node>동대문</Node>
          </div>
        )}

        {lens === "ontology" && (
          <div className="space-y-3">
            <div className="flex items-end">
              <Node>개</Node>
              <Edge label="~이다" />
              <Node>동물</Node>
            </div>
            <div className="flex items-end">
              <Node>개</Node>
              <Edge label="가진다" />
              <Node>주인</Node>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {current.tab}({current.en})
          </span>{" "}
          — {current.take}
        </p>
      </div>
    </div>
  );
}
