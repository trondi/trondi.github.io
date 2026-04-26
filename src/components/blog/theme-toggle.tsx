"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme-preference";

function applyTheme(nextTheme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", nextTheme === "dark");
}

export function ThemeToggle() {
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
