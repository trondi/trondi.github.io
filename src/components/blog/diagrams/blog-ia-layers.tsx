"use client";

import { useState } from "react";

const LAYERS = [
  {
    key: "taxonomy",
    tab: "1단계 · 카테고리",
    name: "택소노미 (Taxonomy)",
    solved: "직관적이다. 폴더처럼 머릿속에 들어온다.",
    unsolved: "글 하나가 한 곳에만 들어간다.",
  },
  {
    key: "topology",
    tab: "2단계 · 태그",
    name: "토폴로지 (Topology)",
    solved: "카테고리를 가로지르는 길이 생긴다.",
    unsolved: "이어졌다는 것만 알고, 어떻게 이어졌는지는 모른다.",
  },
  {
    key: "ontology",
    tab: "3단계 · 관계 이름표",
    name: "온톨로지 (Ontology)",
    solved: "\"먼저 읽을 글\", \"다음 단계\"를 구분할 수 있다.",
    unsolved: "사람이 직접 적어야 한다. (이 블로그는 아직 여기까지 안 옴)",
  },
] as const;

function Chip({ label, tone = "plain" }: { label: string; tone?: "plain" | "on" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${
        tone === "on"
          ? "border-emerald-500/40 bg-emerald-500/15"
          : "border-border bg-background/60 text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

export function BlogIaLayersDiagram() {
  const [key, setKey] = useState<(typeof LAYERS)[number]["key"]>("taxonomy");
  const cur = LAYERS.find((l) => l.key === key)!;

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {LAYERS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setKey(l.key)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              key === l.key
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.tab}
          </button>
        ))}
      </div>

      <div className="px-4 py-4">
        {key === "taxonomy" && (
          <div className="space-y-1.5 text-sm">
            <Chip label="Posts" />
            <div className="ml-3 flex flex-wrap gap-2 border-l border-border pl-4 pt-1.5">
              <Chip label="Frontend" tone="on" />
              <Chip label="Network" />
              <Chip label="TIL" />
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              SSE 프록시 글은 Network일까 Next.js일까 — 하나만 골라야 한다.
            </p>
          </div>
        )}

        {key === "topology" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip label="SSE 프록시 글" tone="on" />
              <span className="text-xs text-muted-foreground">──</span>
              <Chip label="#SSE" />
              <Chip label="#Next.js" />
              <Chip label="#Network" />
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              태그를 공유하는 글끼리 옆으로 이어진다. 다만 선에 이름이 없다.
            </p>
          </div>
        )}

        {key === "ontology" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip label="HTTP 기초" />
              <span className="text-[11px] text-muted-foreground">──먼저 읽을 글──▶</span>
              <Chip label="TCP/UDP/QUIC" tone="on" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip label="SSE 개념" />
              <span className="text-[11px] text-muted-foreground">──응용편──▶</span>
              <Chip label="SSE 실전" tone="on" />
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              선마다 이름이 붙으면 학습 순서가 데이터에서 저절로 나온다.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1 border-t border-border px-4 py-3 text-xs">
        <p className="font-medium text-foreground">{cur.name}</p>
        <p className="text-muted-foreground">푼 문제 — {cur.solved}</p>
        <p className="text-muted-foreground">못 푼 문제 — {cur.unsolved}</p>
      </div>
    </div>
  );
}
