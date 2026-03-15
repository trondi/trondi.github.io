"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { HeaderSearch } from "@/components/blog/header-search";
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
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 24);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDark(root.classList.contains("dark"));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur transition-all duration-300",
        isDark ? "border-stone-800 bg-[#232326]/95" : "border-slate-200/80 bg-white/90",
        scrolled &&
          (isDark
            ? "bg-[#232326]/98 shadow-[0_8px_30px_rgba(0,0,0,0.22)]"
            : "bg-white/95 shadow-[0_8px_30px_rgba(15,23,42,0.05)]"),
      )}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className={cn("flex flex-col transition-all duration-300", scrolled ? "gap-2 py-2.5" : "gap-4 py-4")}>
          <div className={cn("flex justify-between gap-4", scrolled ? "items-center" : "flex-col md:flex-row md:items-start")}>
            <div className="min-w-0">
              <Link href="/" className="inline-flex h-9 items-center text-xl font-semibold tracking-tight text-slate-950 dark:text-stone-100">
                {title}
              </Link>
              <p
                className={cn(
                  "max-w-2xl text-sm leading-6 text-slate-600 transition-all duration-300 dark:text-stone-400",
                  scrolled ? "mt-0 max-h-0 overflow-hidden opacity-0" : "mt-1.5 max-h-20 opacity-100",
                )}
              >
                {intro}
              </p>
            </div>

            <div
              className={cn(
                "flex gap-2 transition-all duration-300",
                scrolled ? "flex-row items-center" : "flex-col items-start md:items-end",
              )}
            >
              <div className="flex items-center gap-2">
                <HeaderSearch entries={searchEntries} />
                <ThemeToggle />
                {scrolled ? (
                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
                      onClick={() => setMenuOpen((value) => !value)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-950 dark:border-stone-700 dark:bg-[#313136] dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100"
                    >
                      {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </button>

                    <div
                      className={cn(
                        "absolute right-0 top-[calc(100%+0.75rem)] z-50 w-52 origin-top-right overflow-hidden rounded-[24px] border border-white/70 bg-white/82 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-2xl transition-all duration-200 ease-out dark:border-white/10 dark:bg-[#232326]/84",
                        menuOpen
                          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                          : "pointer-events-none -translate-y-2 scale-[0.98] opacity-0",
                      )}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] dark:bg-[linear-gradient(180deg,rgba(42,42,46,0.96),rgba(35,35,38,0.92))]" />
                      <nav className="relative p-2">
                        {primaryNav.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                            className="block rounded-2xl px-3 py-3 text-sm text-slate-700 transition-colors hover:bg-white/72 hover:text-slate-950 dark:text-stone-300 dark:hover:bg-[#313136] dark:hover:text-stone-100"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </nav>
                    </div>
                  </div>
                ) : null}
              </div>

              {!scrolled ? (
                <nav className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-stone-300">
                  {primaryNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="transition-colors hover:text-slate-950 dark:hover:text-stone-100"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              "overflow-hidden border-t border-slate-200/80 transition-all duration-300 dark:border-stone-800",
              scrolled ? "max-h-0 pt-0 opacity-0" : "max-h-24 pt-3 opacity-100",
            )}
          >
            <nav className="flex flex-wrap gap-x-5 gap-y-3 rounded-2xl bg-slate-50/70 px-4 py-3 text-sm text-slate-500 dark:border dark:border-stone-700 dark:bg-[#2a2a2e] dark:text-stone-400">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={category.href}
                  className="transition-colors hover:text-slate-950 dark:hover:text-stone-100"
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
