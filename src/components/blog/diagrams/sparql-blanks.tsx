"use client";

import { useState } from "react";

const FACTS = [
  { rel: "소속팀", val: "토트넘" },
  { rel: "별명", val: "쏘니" },
  { rel: "등번호", val: "7" },
];

function Pill({
  children,
  tone = "known",
}: {
  children: React.ReactNode;
  tone?: "known" | "blank" | "filled";
}) {
  const tones = {
    known: "border-border bg-secondary/60 text-foreground",
    blank: "border-dashed border-border bg-background/50 text-muted-foreground",
    filled: "border-emerald-500/40 bg-emerald-500/15 text-foreground",
  };

  return (
    <span
      className={`inline-flex w-full items-center justify-center rounded-full border px-3 py-1.5 text-center text-sm ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SparqlBlanksDiagram() {
  const [answered, setAnswered] = useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-medium">“손흥민에 대해 아는 것을 전부 보여줘”</p>
        <button
          type="button"
          onClick={() => setAnswered((v) => !v)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {answered ? "질문 다시 보기" : "답 보기"}
        </button>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
          <span className="text-center">주어</span>
          <span className="text-center">술어 (관계)</span>
          <span className="text-center">목적어 (값)</span>
        </div>

        {answered ? (
          <div className="space-y-2">
            {FACTS.map((fact) => (
              <div key={fact.rel} className="grid grid-cols-3 gap-2">
                <Pill>손흥민</Pill>
                <Pill tone="filled">{fact.rel}</Pill>
                <Pill tone="filled">{fact.val}</Pill>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Pill>손흥민</Pill>
            <Pill tone="blank">무엇이든</Pill>
            <Pill tone="blank">무엇이든</Pill>
          </div>
        )}

        <p className="pt-1 text-xs text-muted-foreground">
          {answered
            ? "점선 칸이 채워졌다. 어떤 관계가 있는지 미리 몰라도 아는 것을 전부 꺼내온다."
            : "점선 칸은 아직 모르는 자리다. 컴퓨터가 그래프를 뒤져서 채워 준다."}
        </p>
      </div>
    </div>
  );
}
