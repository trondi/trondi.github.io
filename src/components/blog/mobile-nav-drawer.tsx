"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SeasonSelector } from "@/components/blog/season-selector";
import { ThemeToggle } from "@/components/blog/theme-toggle";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
  primaryNav: ReadonlyArray<{ label: string; href: string }>;
  categories: Array<{ name: string; slug: string; count: number; href: string }>;
};

/**
 * MobileNavDrawer — 좁은 화면(md 미만) 전용 서랍 메뉴
 * - 헤더의 nav 링크 · 카테고리 바 · 설정(계절/테마)을 한곳에 모은다
 * - 헤더가 backdrop-filter를 쓰므로 fixed 요소가 헤더 기준으로 잡히지 않게 body로 portal
 */
export function MobileNavDrawer({ primaryNav, categories }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // 닫힌 패널은 포커스·보조기기에서 제외 (React 18은 inert prop을 지원하지 않아 직접 설정)
  useEffect(() => {
    panelRef.current?.toggleAttribute("inert", !open);
  }, [open, mounted]);

  // 페이지 이동 시 닫기
  useEffect(() => { setOpen(false); }, [pathname]);

  // 열린 동안 배경 스크롤 잠금 + Escape로 닫기 + 포커스 이동
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => closeRef.current?.focus());
    const trigger = triggerRef.current;

    return () => {
      body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
      trigger?.focus();
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const sectionLabel = "px-2 pb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50";
  const itemClass = (active: boolean) => cn(
    "flex items-center justify-between rounded-md px-3 py-2.5 font-mono text-[12px] tracking-wide transition-colors",
    active
      ? "bg-[hsl(var(--ring)/0.10)] text-[hsl(var(--ring))]"
      : "text-muted-foreground hover:bg-[hsl(var(--ring)/0.10)] hover:text-[hsl(var(--ring))]",
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="메뉴 열기"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-[hsl(var(--ring)/0.4)] hover:text-[hsl(var(--ring))] md:hidden"
      >
        <Menu className="h-3.5 w-3.5" />
      </button>

      {mounted && createPortal(
        <div
          className={cn("fixed inset-0 z-50 md:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
        >
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            className={cn(
              "absolute inset-0 bg-black/45 transition-opacity duration-300",
              open ? "opacity-100" : "opacity-0",
            )}
          />

          {/* Panel */}
          <aside
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="사이트 메뉴"
            ref={panelRef}
            className={cn(
              "absolute right-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out",
              open ? "translate-x-0" : "translate-x-full",
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <span className="font-mono text-[12px] tracking-wide">
                <span className="text-muted-foreground">~&nbsp;/&nbsp;</span>
                <span className="font-bold text-[hsl(var(--ring))]">trond</span>
                <span className="text-border">&nbsp;/&nbsp;</span>
                <span className="text-foreground">menu</span>
              </span>
              <button
                ref={closeRef}
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-[hsl(var(--ring)/0.4)] hover:text-[hsl(var(--ring))]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
              {/* 메뉴 */}
              <p className={sectionLabel}>메뉴</p>
              <nav>
                {primaryNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={itemClass(isActive(item.href))}
                  >
                    <span>
                      <span className="opacity-40">{"> "}</span>
                      {item.label.toLowerCase()}
                    </span>
                  </Link>
                ))}
              </nav>

              <div className="my-3 border-t border-border" />

              {/* 카테고리 */}
              <p className={sectionLabel}>카테고리</p>
              <nav>
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={category.href}
                    onClick={() => setOpen(false)}
                    className={itemClass(isActive(category.href))}
                  >
                    <span>{category.name}</span>
                    <span className="text-[10px] tabular-nums opacity-50">{category.count}</span>
                  </Link>
                ))}
              </nav>

              <div className="my-3 border-t border-border" />

              {/* 계절 · 테마 */}
              <p className={sectionLabel}>계절 효과</p>
              <div className="px-1 pb-3">
                <SeasonSelector inMenu />
              </div>
              <p className={sectionLabel}>테마</p>
              <div className="px-1">
                <ThemeToggle inMenu />
              </div>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
