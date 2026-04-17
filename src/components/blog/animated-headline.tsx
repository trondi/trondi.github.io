"use client";

import { useEffect, useRef } from "react";

interface AnimatedHeadlineProps {
  lines: string[];      // each element = one visual line
  className?: string;
  delay?: number;       // base delay in ms before first char
}

/**
 * Splits each line into individual character spans and staggers them in.
 * Pure CSS animation — no runtime animation library required.
 */
export function AnimatedHeadline({
  lines,
  className = "",
  delay = 0,
}: AnimatedHeadlineProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = requestAnimationFrame(() => el.classList.add("headline-ready"));
    return () => cancelAnimationFrame(id);
  }, []);

  let charIndex = 0;

  return (
    <h1 ref={ref} className={`headline-split ${className}`} aria-label={lines.join(" ")}>
      {lines.map((line, li) => (
        <span key={li} className="block">
          {Array.from(line).map((char) => {
            const idx = charIndex++;
            return (
              <span
                key={idx}
                className="char"
                aria-hidden
                style={{ animationDelay: `${delay + idx * 26}ms` }}
              >
                {char === " " ? "\u00A0" : char}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
