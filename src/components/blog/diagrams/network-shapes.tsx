"use client";

import { useState } from "react";

type Shape = {
  key: string;
  tab: string;
  name: string;
  nodes: { id: string; x: number; y: number }[];
  links: [string, string][];
  good: string;
  bad: string;
};

const C = { x: 110, y: 60 };

const SHAPES: Shape[] = [
  {
    key: "star",
    tab: "별",
    name: "별 모양 (성형)",
    nodes: [
      { id: "S", x: C.x, y: C.y },
      { id: "A", x: C.x, y: 14 },
      { id: "B", x: 24, y: C.y },
      { id: "C", x: 196, y: C.y },
      { id: "D", x: C.x, y: 106 },
    ],
    links: [["S", "A"], ["S", "B"], ["S", "C"], ["S", "D"]],
    good: "기기 하나가 고장 나도 나머지는 멀쩡하다.",
    bad: "가운데가 죽으면 전부 끊긴다. 집 공유기와 같다.",
  },
  {
    key: "bus",
    tab: "줄",
    name: "줄 모양 (버스형)",
    nodes: [
      { id: "A", x: 30, y: 26 },
      { id: "B", x: 84, y: 26 },
      { id: "C", x: 138, y: 26 },
      { id: "D", x: 192, y: 26 },
    ],
    links: [],
    good: "케이블이 적게 들어 가장 싸다.",
    bad: "모두 같은 길을 써서 한 번에 하나만 말할 수 있다.",
  },
  {
    key: "ring",
    tab: "고리",
    name: "고리 모양 (링형)",
    nodes: [
      { id: "A", x: 70, y: 22 },
      { id: "B", x: 150, y: 22 },
      { id: "C", x: 150, y: 98 },
      { id: "D", x: 70, y: 98 },
    ],
    links: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]],
    good: "순서대로 돌아서 부딪힐 일이 적다.",
    bad: "한 군데만 끊겨도 고리가 깨진다.",
  },
  {
    key: "mesh",
    tab: "그물",
    name: "그물 모양 (메시형)",
    nodes: [
      { id: "A", x: 70, y: 22 },
      { id: "B", x: 150, y: 22 },
      { id: "C", x: 150, y: 98 },
      { id: "D", x: 70, y: 98 },
    ],
    links: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"], ["A", "C"], ["B", "D"]],
    good: "길이 여러 개라 하나 끊겨도 돌아간다.",
    bad: "장비가 늘면 선이 폭발적으로 늘어난다.",
  },
];

export function NetworkShapesDiagram() {
  const [key, setKey] = useState("star");
  const shape = SHAPES.find((s) => s.key === key)!;
  const at = (id: string) => shape.nodes.find((n) => n.id === id)!;

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {SHAPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setKey(s.key)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              key === s.key
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.tab} 모양
          </button>
        ))}
      </div>

      <div className="flex justify-center px-4 py-4">
        <svg viewBox="0 0 220 120" className="h-auto w-full max-w-[320px] text-muted-foreground">
          {shape.key === "bus" && (
            <>
              <line x1="14" y1="70" x2="206" y2="70" stroke="currentColor" strokeWidth="3" />
              {shape.nodes.map((n) => (
                <line key={`s${n.id}`} x1={n.x} y1={n.y + 12} x2={n.x} y2="70" stroke="currentColor" strokeWidth="1.5" />
              ))}
            </>
          )}

          {shape.links.map(([a, b]) => (
            <line
              key={`${a}${b}`}
              x1={at(a).x}
              y1={at(a).y}
              x2={at(b).x}
              y2={at(b).y}
              stroke="currentColor"
              strokeWidth="1.5"
            />
          ))}

          {shape.nodes.map((n) => (
            <g key={n.id}>
              <circle
                cx={n.x}
                cy={n.y}
                r="13"
                className={n.id === "S" ? "fill-emerald-500/20 stroke-emerald-500/60" : "fill-background stroke-border"}
                strokeWidth="1.5"
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                className="fill-current text-[11px] font-medium"
              >
                {n.id}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="space-y-1 border-t border-border px-4 py-3 text-xs">
        <p className="font-medium text-foreground">{shape.name}</p>
        <p className="text-muted-foreground">좋은 점 — {shape.good}</p>
        <p className="text-muted-foreground">나쁜 점 — {shape.bad}</p>
      </div>
    </div>
  );
}
