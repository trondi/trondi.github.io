"use client";

import { useEffect, useRef, useState } from "react";
import { SEASON_CONFIG, getSeason } from "@/lib/season";
import type { Season } from "@/lib/season";
import { useSeasonalContext } from "@/components/blog/seasonal-context";
import { cn } from "@/lib/utils";

const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
const currentSeason = getSeason();

type SeasonSelectorProps = {
  inMenu?: boolean;
};

export function SeasonSelector({ inMenu }: SeasonSelectorProps) {
  const { activeSeason, setActiveSeason } = useSeasonalContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (inMenu) return; // parent menu handles this
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
  }, [inMenu]);

  const active = activeSeason ? SEASON_CONFIG[activeSeason] : null;

  // ── In-menu flat list ──────────────────────────────────────────────────
  if (inMenu) {
    return (
      <div className="flex gap-1">
        {SEASONS.map((s) => {
          const cfg = SEASON_CONFIG[s];
          const isActive = s === activeSeason;
          const isCurrent = s === currentSeason;
          return (
            <button
              key={s}
              type="button"
              title={cfg.label + (isCurrent ? " (현재)" : "")}
              onClick={() => setActiveSeason(isActive ? null : s)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors",
                isActive
                  ? "bg-[hsl(var(--ring)/0.15)] text-[hsl(var(--ring))] ring-1 ring-[hsl(var(--ring)/0.4)]"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {cfg.emoji}
            </button>
          );
        })}
        {activeSeason && (
          <button
            type="button"
            title="효과 끄기"
            onClick={() => setActiveSeason(null)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // ── Standalone dropdown ────────────────────────────────────────────────
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
            : "border-border bg-card text-muted-foreground hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground",
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
          "absolute right-0 top-[calc(100%+0.6rem)] z-50 min-w-[140px] overflow-hidden rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur-xl transition-all duration-200",
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
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
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
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary"
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
