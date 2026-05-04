"use client";

import { useEffect, useState } from "react";

import { TocItem } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type TableOfContentsProps = {
  items: TocItem[];
};

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (!items.length) {
      return;
    }

    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!headings.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-18% 0px -68% 0px",
        threshold: [0, 1],
      },
    );

    headings.forEach((heading) => observer.observe(heading));

    return () => observer.disconnect();
  }, [items]);

  if (!items.length) {
    return null;
  }

  return (
    <aside className="sticky top-24 hidden xl:block">
      <div className="border-l border-border/80 pl-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--ring))]">
          On this page
        </p>
        <nav className="mt-4 space-y-1.5">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "block border-l border-transparent py-1 text-sm leading-5 text-muted-foreground/80 transition-colors hover:border-[hsl(var(--ring))] hover:text-foreground",
                activeId === item.id &&
                  "border-[hsl(var(--ring))] font-medium text-foreground",
                item.level === 3 ? "pl-4 text-[13px]" : "pl-2",
              )}
            >
              {item.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
