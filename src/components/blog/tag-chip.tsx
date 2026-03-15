import Link from "next/link";

import { cn } from "@/lib/utils";

type TagChipProps = {
  label: string;
  href?: string;
  active?: boolean;
};

export function TagChip({ label, href, active = false }: TagChipProps) {
  const className = cn(
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active
      ? "border-slate-900 bg-slate-900 text-white dark:border-stone-300 dark:bg-stone-200 dark:text-stone-950"
      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-stone-700 dark:bg-[#313136] dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }

  return <span className={className}>{label}</span>;
}
