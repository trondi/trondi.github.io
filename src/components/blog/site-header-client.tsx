"use client";

import Link from "next/link";
import { Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { HeaderSearch } from "@/components/blog/header-search";
import { SeasonSelector } from "@/components/blog/season-selector";
import { ThemeToggle } from "@/components/blog/theme-toggle";
import { SearchEntry } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type SiteHeaderClientProps = {
  title: string;
  intro: string;
  primaryNav: ReadonlyArray<{ label: string; href: string }>;
  categories: Array<{ name: string; slug: string; count: number; href: string }>;
  searchEntries: SearchEntry[];
};

export function SiteHeaderClient({
  title,
  intro,
  primaryNav,
  categories,
  searchEntries,
}: SiteHeaderClientProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ── Scroll hysteresis ──────────────────────────────────────────────────
  useEffect(() => {
    let raf: number | null = null;
    const COLLAPSE_AT = 40;
    const EXPAND_AT   = 10;

    const sync = () => {
      raf = null;
      const y = window.scrollY;
      setScrolled((prev) => {
        if (!prev && y > COLLAPSE_AT) return true;
        if (prev  && y < EXPAND_AT)   return false;
        return prev;
      });
    };

    const onScroll = () => { if (raf === null) raf = requestAnimationFrame(sync); };
    sync();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  // ── Context menu 외부 클릭 닫기 ───────────────────────────────────────
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border bg-background/88 backdrop-blur-md transition-[box-shadow] duration-300",
        scrolled && "shadow-[0_1px_0_0_hsl(var(--border))]",
      )}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className={cn("flex flex-col transition-[gap,padding] duration-300", scrolled ? "gap-0 py-2.5" : "gap-3 py-4")}>

          {/* ── Top row ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4">

            {/* Brand */}
            <div className="min-w-0">
              <Link href="/" className="inline-flex h-9 items-center gap-0 font-mono text-[13px] tracking-wide">
                <span className="text-muted-foreground">~&nbsp;</span>
                <span className="text-muted-foreground">/&nbsp;</span>
                <span className="font-bold text-[hsl(var(--ring))]">trond</span>
                <span className="text-border">&nbsp;/&nbsp;</span>
                <span className="text-foreground">archive</span>
              </Link>
              <p className={cn(
                "max-w-2xl font-mono text-[11px] leading-5 text-muted-foreground/70 transition-[max-height,opacity,margin] duration-300",
                scrolled ? "mt-0 max-h-0 overflow-hidden opacity-0" : "mt-1.5 max-h-20 opacity-100",
              )}>
                <span className="text-muted-foreground/40">{"// "}</span>{intro}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Search */}
              <HeaderSearch entries={searchEntries} />

              {/* Nav links — always visible */}
              <nav className="flex items-center gap-1">
                {primaryNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted-foreground transition-colors hover:text-[hsl(var(--ring))]"
                  >
                    {item.label.toLowerCase()}
                  </Link>
                ))}
              </nav>

              {/* Context menu — season + theme */}
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  aria-label="설정 메뉴"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded border border-border transition-colors",
                    menuOpen
                      ? "border-[hsl(var(--ring)/0.5)] bg-[hsl(var(--ring)/0.08)] text-[hsl(var(--ring))]"
                      : "text-muted-foreground hover:border-[hsl(var(--ring)/0.4)] hover:text-[hsl(var(--ring))]",
                  )}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>

                {/* Dropdown */}
                <div className={cn(
                  "absolute right-0 top-[calc(100%+0.6rem)] z-50 w-52 overflow-hidden rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur-xl transition-all duration-200 ease-out",
                  menuOpen
                    ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none -translate-y-1.5 scale-[0.97] opacity-0",
                )}>
                  <div className="p-2 space-y-1">
                    {/* 계절 */}
                    <p className="px-2 pb-1 pt-0.5 font-mono text-[9px] tracking-[0.12em] text-muted-foreground/50 uppercase">
                      계절 효과
                    </p>
                    <div onClick={() => setMenuOpen(false)}>
                      <SeasonSelector inMenu />
                    </div>

                    <div className="my-1 border-t border-border" />

                    {/* 테마 */}
                    <p className="px-2 pb-1 pt-0.5 font-mono text-[9px] tracking-[0.12em] text-muted-foreground/50 uppercase">
                      테마
                    </p>
                    <div className="px-1" onClick={() => setMenuOpen(false)}>
                      <ThemeToggle inMenu />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Category bar ─────────────────────────────────────────────── */}
          <div className={cn(
            "overflow-hidden border-t border-border transition-[max-height,opacity,padding] duration-300",
            scrolled ? "max-h-0 pt-0 opacity-0" : "max-h-24 pt-2.5 opacity-100",
          )}>
            <nav className="flex flex-wrap gap-x-1 gap-y-1 rounded-lg bg-secondary/30 px-3 py-2">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={category.href}
                  className="rounded-md px-2.5 py-1 font-mono text-[11px] tracking-wide text-muted-foreground transition-colors hover:bg-[hsl(var(--ring)/0.10)] hover:text-[hsl(var(--ring))]"
                >
                  {category.name}
                  <span className="ml-1.5 text-[10px] tabular-nums opacity-40">{category.count}</span>
                </Link>
              ))}
            </nav>
          </div>

        </div>
      </div>
    </header>
  );
}
