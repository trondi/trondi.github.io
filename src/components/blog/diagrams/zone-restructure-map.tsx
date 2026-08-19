"use client";

import { useState } from "react";

type Tab = "before" | "after";

// Before — app 직속에 도메인·공용·결합이 뒤섞임
const beforeItems = [
  { name: "docker", kind: "zone" },
  { name: "k8s", kind: "zone" },
  { name: "components", kind: "shared" },
  { name: "styles", kind: "shared" },
  { name: "store", kind: "shared" },
  { name: "hooks", kind: "shared" },
  { name: "util", kind: "shared" },
  { name: "types", kind: "shared" },
  { name: "constants", kind: "shared" },
  { name: "lib · schema · providers", kind: "shared" },
  { name: "selectbox (도메인 결합)", kind: "debt" },
  { name: "host (docker→k8s 역의존)", kind: "debt" },
];

const kindStyle: Record<string, string> = {
  zone: "border-sky-500/30 bg-sky-500/5 text-sky-300",
  shared: "border-border bg-background/40 text-foreground/70",
  debt: "border-rose-500/40 bg-rose-500/5 text-rose-300",
};

export function ZoneRestructureMapDiagram() {
  const [tab, setTab] = useState<Tab>("before");

  const tabs: { id: Tab; label: string }[] = [
    { id: "before", label: "Before (뒤섞임)" },
    { id: "after", label: "After (존 정리)" },
  ];

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
              tab === t.id
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "before" && (
          <div className="space-y-3">
            <div className="font-mono text-[11px] text-muted-foreground">src/app/</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {beforeItems.map((it) => (
                <div
                  key={it.name}
                  className={`rounded-lg border px-2.5 py-2 font-mono text-[10px] ${kindStyle[it.kind]}`}
                >
                  {it.name}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-muted-foreground">
              <span><span className="text-sky-300">■</span> 도메인 존</span>
              <span><span className="text-foreground/70">■</span> 공용(흩어짐)</span>
              <span><span className="text-rose-300">■</span> 결합/역의존(부채)</span>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] leading-5 text-foreground/70">
              ⚠️ 도메인 무관 공용이 app 직속에 흩어져 있고, 일부는 도메인을 import(결합)하거나 역의존을 품음.
            </div>
          </div>
        )}

        {tab === "after" && (
          <div className="space-y-3">
            <div className="font-mono text-[11px] text-muted-foreground">src/app/ — 직속 5개만</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {["(private) · api", "docker", "k8s", "shared", ""].filter(Boolean).map((n) => (
                <div
                  key={n}
                  className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-2.5 py-2 text-center font-mono text-[10px] text-sky-300"
                >
                  {n}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center py-0.5 text-[11px] text-muted-foreground">
              ↓ 공용은 전부 shared로 (alias + @/app 물리경로 둘 다 repoint)
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="font-mono text-[11px] text-emerald-300">app/shared/</div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  "components",
                  "styles",
                  "store",
                  "hooks",
                  "util · types",
                  "constants · lib",
                ].map((n) => (
                  <div
                    key={n}
                    className="rounded-lg border border-border bg-background/40 px-2.5 py-1.5 font-mono text-[10px] text-foreground/70"
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-5 text-foreground/70">
              💡 단일 도메인 결합 selectbox는 각 존으로 추출, 다중 도메인 결합(cluster · FlexSubModal)과
              host 역의존은 <strong>주입 리팩토링</strong>으로 처리(일부는 known-debt). 매 단계 검증은
              <code className="text-amber-400"> tsc 에러 59</code> 유지.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
