"use client";

import { useEffect, useRef, useState } from "react";
import { SEASON_CONFIG, getSeason } from "@/lib/season";
import type { Season } from "@/lib/season";
import { useSeasonalContext } from "@/components/blog/seasonal-context";
import { cn } from "@/lib/utils";

const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
const currentSeason = getSeason();

export function SeasonSelector() {
  const { activeSeason, setActiveSeason } = useSeasonalContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const active = activeSeason ? SEASON_CONFIG[activeSeason] : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="계절 효과 선택"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
          activeSeason
            ? "border-foreground/25 bg-foreground text-background hover:border-foreground/40"
            : "border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:text-slate-950 dark:border-stone-700 dark:bg-[#313136] dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100",
        )}
      >
        <span className="text-sm leading-none">
          {active ? active.emoji : SEASON_CONFIG[currentSeason].emoji}
        </span>
        <span>{active ? active.label : "계절"}</span>
      </button>

      {/* Dropdown */}
      <div
        className={cn(
          "absolute right-0 top-[calc(100%+0.6rem)] z-50 min-w-[140px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_12px_36px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-200 dark:border-stone-700/80 dark:bg-[#232326]/95",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="p-1.5">
          {SEASONS.map((s) => {
            const cfg = SEASON_CONFIG[s];
            const isCurrent = s === currentSeason;
            const isActive = s === activeSeason;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setActiveSeason(isActive ? null : s);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-slate-700 hover:bg-slate-100 dark:text-stone-300 dark:hover:bg-stone-800",
                )}
              >
                <span className="text-base leading-none">{cfg.emoji}</span>
                <span className="flex-1">{cfg.label}</span>
                {isCurrent && !isActive && (
                  <span className="text-[10px] text-muted-foreground">현재</span>
                )}
              </button>
            );
          })}

          {activeSeason && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => { setActiveSeason(null); setOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-slate-100 dark:hover:bg-stone-800"
              >
                <span className="text-base leading-none">✕</span>
                <span>끄기</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
