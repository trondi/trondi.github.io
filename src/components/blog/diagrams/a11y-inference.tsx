"use client";

import { useState } from "react";

export function A11yInferenceDiagram() {
  const [shown, setShown] = useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-medium">내가 적은 것 vs 브라우저가 채운 것</p>
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {shown ? "처음으로" : "브라우저가 채우기"}
        </button>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <p className="mb-1.5 text-[11px] text-muted-foreground">내가 적은 것</p>
          <code className="inline-block rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs">
            &lt;button&gt;
          </code>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            브라우저가 표준에서 끌어낸 것
          </p>
          {shown ? (
            <div className="flex flex-wrap gap-2">
              {["button 역할", "명령 종류", "\"버튼입니다\"", "클릭 가능", "포커스 가능"].map((x) => (
                <span
                  key={x}
                  className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs"
                >
                  {x}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="inline-flex w-20 items-center justify-center rounded-full border border-dashed border-border bg-background/50 px-3 py-1.5 text-xs text-muted-foreground"
                >
                  ?
                </span>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {shown
            ? "나는 \"버튼이다\"라고 어디에도 적지 않았다. 전부 표준에 적힌 규칙에서 나온 것이다."
            : "버튼이라고 적은 적이 없는데, 스크린 리더는 어떻게 알까?"}
        </p>
      </div>
    </div>
  );
}
