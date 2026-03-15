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
      <div className="rounded-2xl border border-slate-200 bg-white/85 p-5 backdrop-blur dark:border-stone-700 dark:bg-[#232326]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">On this page</p>
        <nav className="mt-4 space-y-2">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "block text-sm text-slate-600 transition-colors hover:text-slate-950 dark:text-stone-300 dark:hover:text-stone-100",
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
