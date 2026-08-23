"use client";

import { useState } from "react";

const TRIPLES = [
  { s: "손흥민", p: "소속팀", o: "토트넘" },
  { s: "토트넘", p: "연고지", o: "런던" },
  { s: "런던", p: "국가", o: "영국" },
];

function Node({ label, dim }: { label: string; dim?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm ${
        dim
          ? "border-border bg-background/60 text-muted-foreground"
          : "border-border bg-secondary/70 text-foreground"
      }`}
    >
      {label}
    </span>
  );
}

export function TripleChainDiagram() {
  const [chained, setChained] = useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-medium">
          {chained ? "이어 붙이면 그물이 된다" : "사실 하나 = 세 조각짜리 한 줄"}
        </p>
        <button
          type="button"
          onClick={() => setChained((v) => !v)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {chained ? "한 줄씩 보기" : "이어 붙이기"}
        </button>
      </div>

      <div className="px-4 py-4">
        {!chained ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
              <span className="text-center">주어</span>
              <span className="text-center">술어</span>
              <span className="text-center">목적어</span>
            </div>
            {TRIPLES.map((t) => (
              <div key={t.p} className="grid grid-cols-3 gap-2 text-center">
                <Node label={t.s} />
                <Node label={t.p} dim />
                <Node label={t.o} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {TRIPLES.map((t, i) => (
              <div key={t.p} className="flex flex-wrap items-center gap-2">
                {i === 0 && <Node label={t.s} />}
                {i > 0 && <span className="w-[1px]" />}
                <span className="text-[11px] text-muted-foreground">──{t.p}──▶</span>
                <Node label={t.o} />
              </div>
            ))}
          </div>
        )}

        <p className="pt-3 text-xs text-muted-foreground">
          {chained
            ? "앞 줄의 목적어가 다음 줄의 주어가 되면서 저절로 이어진다. 이 그물이 지식 그래프다."
            : "한 줄이 사실 하나다. 새 사실은 칸이 아니라 줄을 추가해서 적는다."}
        </p>
      </div>
    </div>
  );
}
