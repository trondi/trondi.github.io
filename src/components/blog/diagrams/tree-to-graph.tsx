"use client";

import { useState } from "react";

const POSTS = [
  { id: 1, title: "SSE 정리" },
  { id: 2, title: "토폴로지 정리" },
  { id: 3, title: "RDF 정리" },
];

function Box({
  children,
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "dup" | "one";
}) {
  const tones = {
    plain: "border-border bg-background/60",
    dup: "border-orange-500/40 bg-orange-500/10",
    one: "border-emerald-500/40 bg-emerald-500/15",
  };
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tones[tone]}`}>{children}</div>
  );
}

export function TreeToGraphDiagram() {
  const [normalized, setNormalized] = useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-medium">
          {normalized ? "정규화 후 — 작성자는 한 곳에만" : "받은 그대로 — 작성자가 글마다 복사된다"}
        </p>
        <button
          type="button"
          onClick={() => setNormalized((v) => !v)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {normalized ? "되돌리기" : "정규화 하기"}
        </button>
      </div>

      <div className="px-4 py-4">
        {!normalized ? (
          <div className="space-y-2">
            {POSTS.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2">
                <Box>글 {p.id} · {p.title}</Box>
                <span className="text-xs text-muted-foreground">안에</span>
                <Box tone="dup">작성자 Trond</Box>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              같은 사람이 <span className="text-foreground">세 벌</span> 복사됐다. 이름을 바꾸면 세 군데를 고쳐야 한다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {POSTS.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  <Box>글 {p.id} · {p.title}</Box>
                  <span className="text-xs text-muted-foreground">──작성자──▶</span>
                  <Box tone="plain">7번</Box>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">7번 =</span>
              <Box tone="one">작성자 Trond</Box>
            </div>
            <p className="text-xs text-muted-foreground">
              사람은 <span className="text-foreground">한 곳에만</span> 있고, 글은 번호로 가리킨다. 이름은 한 번만 고치면 된다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
