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
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card text-muted-foreground hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground",
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
