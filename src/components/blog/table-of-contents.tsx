import { TocItem } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type TableOfContentsProps = {
  items: TocItem[];
};

export function TableOfContents({ items }: TableOfContentsProps) {
  if (!items.length) {
    return null;
  }

  return (
    <aside className="sticky top-24 hidden xl:block">
      <div className="rounded-2xl border border-border bg-card/85 p-5 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">On this page</p>
        <nav className="mt-4 space-y-2">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "block text-sm text-muted-foreground transition-colors hover:text-foreground",
                item.level === 3 && "pl-4",
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
