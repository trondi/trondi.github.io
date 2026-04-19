"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
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

  useEffect(() => {
    // Hysteresis: collapse when scroll > 40px, expand only when back below 10px.
    // The dead-zone between 10–40 keeps the current state, eliminating
    // the rapid true↔false toggling that causes jitter near the threshold.
    let raf: number | null = null;
    const COLLAPSE_AT = 40;
    const EXPAND_AT   = 10;

    const sync = () => {
      raf = null;
      const y = window.scrollY;
      setScrolled((prev) => {
        if (!prev && y > COLLAPSE_AT) return true;
        if (prev  && y < EXPAND_AT)   return false;
        return prev; // no change inside the dead-zone
      });
    };

    const onScroll = () => {
      if (raf === null) raf = requestAnimationFrame(sync);
    };

    sync(); // initial state
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md transition-[box-shadow] duration-300",
        scrolled && "shadow-[0_1px_0_0_hsl(var(--border))]",
      )}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className={cn("flex flex-col transition-[gap,padding] duration-300", scrolled ? "gap-2 py-2.5" : "gap-4 py-4")}>

          <div className={cn(
            "flex justify-between gap-4",
            scrolled ? "items-center" : "flex-col md:flex-row md:items-start",
          )}>
            {/* Brand */}
            <div className="min-w-0">
              <Link
                href="/"
                className="inline-flex h-9 items-center text-xl font-semibold tracking-tight text-foreground"
              >
                {title}
              </Link>
              <p className={cn(
                "max-w-2xl text-sm leading-6 text-muted-foreground transition-[max-height,opacity,margin] duration-300",
                scrolled ? "mt-0 max-h-0 overflow-hidden opacity-0" : "mt-1.5 max-h-20 opacity-100",
              )}>
                {intro}
              </p>
            </div>

            {/* Controls */}
            <div className={cn(
              "flex gap-2 transition-all duration-300",
              scrolled ? "flex-row items-center" : "flex-col items-start md:items-end",
            )}>
              <div className="flex items-center gap-2">
                <HeaderSearch entries={searchEntries} />
                <SeasonSelector />
                <ThemeToggle />

                {scrolled && (
                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
                      onClick={() => setMenuOpen((v) => !v)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                    >
                      {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </button>

                    <div className={cn(
                      "absolute right-0 top-[calc(100%+0.75rem)] z-50 w-48 origin-top-right overflow-hidden rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur-xl transition-all duration-200 ease-out",
                      menuOpen
                        ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                        : "pointer-events-none -translate-y-1.5 scale-[0.97] opacity-0",
                    )}>
                      <nav className="p-1.5">
                        {primaryNav.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                            className="block rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </nav>
                    </div>
                  </div>
                )}
              </div>

              {!scrolled && (
                <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {primaryNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          </div>

          {/* Category bar */}
          <div className={cn(
            "overflow-hidden border-t border-border transition-[max-height,opacity,padding] duration-300",
            scrolled ? "max-h-0 pt-0 opacity-0" : "max-h-24 pt-3 opacity-100",
          )}>
            <nav className="flex flex-wrap gap-x-5 gap-y-2.5 rounded-xl bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={category.href}
                  className="transition-colors hover:text-foreground"
                >
                  {category.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
