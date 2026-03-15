import Link from "next/link";

import { siteConfig } from "@/lib/blog/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-stone-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-slate-500 dark:text-stone-400 md:flex-row md:items-center md:justify-between">
        <p>
          {new Date().getFullYear()} {siteConfig.author.name}. Writing for readable interfaces and durable notes.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href={siteConfig.author.github} className="transition-colors hover:text-slate-950 dark:hover:text-stone-100">
            GitHub
          </Link>
          <a href={`mailto:${siteConfig.author.email}`} className="transition-colors hover:text-slate-950 dark:hover:text-stone-100">
            Email
          </a>
        </div>
      </div>
    </footer>
  );
}
