"use client";

import { useState } from "react";

const SERVER = "#3b82f6";
const CLIENT = "#f97316";

type Node = {
  label: string;
  kind: "server" | "client";
  note?: string;
  depth: number;
};

// 잘 나눈 트리: 상호작용 부분만 클라이언트로, 나머지는 서버
const goodTree: Node[] = [
  { label: "Page", kind: "server", note: "DB 조회", depth: 0 },
  { label: "ArticleLayout", kind: "server", depth: 1 },
  { label: "ArticleContent", kind: "server", note: "본문 렌더", depth: 2 },
  { label: "ArticleActions", kind: "client", note: "좋아요·공유 버튼만", depth: 2 },
];

// 잘못 나눈 트리: 페이지 전체가 클라이언트 → 아래 전부 클라이언트
const badTree: Node[] = [
  { label: "Page  'use client'", kind: "client", note: "서버에서 미리 조회 불가 → 화면 뜬 뒤 요청·로딩 필요", depth: 0 },
  { label: "ArticleLayout", kind: "client", depth: 1 },
  { label: "ArticleContent", kind: "client", note: "번들에 포함됨", depth: 2 },
  { label: "ArticleActions", kind: "client", depth: 2 },
];

function Tree({ nodes }: { nodes: Node[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {nodes.map((n, i) => {
        const color = n.kind === "server" ? SERVER : CLIENT;
        return (
          <div key={i} className="flex items-center" style={{ paddingLeft: n.depth * 22 }}>
            {n.depth > 0 && <span className="mr-1 text-border">└─</span>}
            <span
              className="rounded-md border px-2.5 py-1 text-xs font-semibold"
              style={{ borderColor: color + "80", background: color + "15", color }}
            >
              {n.label}
            </span>
            {n.note && <span className="ml-2 text-[11px] text-muted-foreground">← {n.note}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ServerClientBoundaryDiagram() {
  const [mode, setMode] = useState<"good" | "bad">("good");

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {/* toggle */}
      <div className="grid grid-cols-2 gap-px bg-border">
        <button
          onClick={() => setMode("good")}
          className="py-3 text-center text-xs font-bold transition-colors"
          style={{
            backgroundColor: mode === "good" ? "#10b98115" : "hsl(var(--background))",
            borderBottom: mode === "good" ? "2px solid #10b981" : "2px solid transparent",
            color: mode === "good" ? "#10b981" : "hsl(var(--muted-foreground))",
          }}
        >
          ✅ 경계를 말단으로
        </button>
        <button
          onClick={() => setMode("bad")}
          className="py-3 text-center text-xs font-bold transition-colors"
          style={{
            backgroundColor: mode === "bad" ? "#ef444415" : "hsl(var(--background))",
            borderBottom: mode === "bad" ? "2px solid #ef4444" : "2px solid transparent",
            color: mode === "bad" ? "#ef4444" : "hsl(var(--muted-foreground))",
          }}
        >
          ⚠️ 페이지 전체를 클라이언트로
        </button>
      </div>

      {/* legend */}
      <div className="flex items-center justify-center gap-4 border-b border-border py-2 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERVER }} />
          <span className="text-muted-foreground">서버 컴포넌트</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLIENT }} />
          <span className="text-muted-foreground">클라이언트 컴포넌트</span>
        </span>
      </div>

      <div className="p-4">
        <Tree nodes={mode === "good" ? goodTree : badTree} />
      </div>

      <div
        className="mx-4 mb-4 rounded-lg px-3 py-2 text-xs leading-5"
        style={{
          backgroundColor: mode === "good" ? "#10b98110" : "#ef444410",
          borderLeft: `3px solid ${mode === "good" ? "#10b981" : "#ef4444"}`,
          color: "hsl(var(--foreground) / 0.75)",
        }}
      >
        {mode === "good"
          ? "상호작용이 필요한 ArticleActions만 클라이언트 컴포넌트로 분리하면, 나머지는 서버에서 실행되고 클라이언트 번들에서 빠진다."
          : "'use client'가 트리 위쪽에 붙으면 그 아래 모든 컴포넌트가 클라이언트로 실행된다. 데이터를 서버에서 미리 못 가져오고(화면 뜬 뒤 요청·로딩 발생), 번들도 커진다."}
      </div>
    </div>
  );
}
