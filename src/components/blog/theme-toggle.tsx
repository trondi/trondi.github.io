"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "theme-preference";

function applyTheme(nextTheme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", nextTheme === "dark");
}

type ThemeToggleProps = {
  inMenu?: boolean;
};

export function ThemeToggle({ inMenu }: ThemeToggleProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as "light" | "dark" | null;
    const preferred =
      stored ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(preferred);
    applyTheme(preferred);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  if (inMenu) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="테마 전환"
        style={{ opacity: mounted ? 1 : 0 }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 font-mono text-[11px] tracking-[0.04em] transition-colors",
          "text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <span className="text-base leading-none">{theme === "dark" ? "☀" : "☾"}</span>
        <span>{theme === "dark" ? "라이트 모드" : "다크 모드"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="테마 전환"
      style={{ opacity: mounted ? 1 : 0 }}
      className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground bg-card border border-border rounded px-3 py-[5px] transition-colors hover:border-[hsl(var(--ring))] hover:text-[hsl(var(--ring))]"
    >
      {theme === "dark" ? "[ ☀ light ]" : "[ ☾ dark ]"}
    </button>
  );
}
