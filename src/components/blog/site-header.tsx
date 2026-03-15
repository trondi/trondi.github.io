import Link from "next/link";

import { siteConfig } from "@/lib/blog/config";
import { getCategories } from "@/lib/blog/posts";
import { slugify } from "@/lib/blog/utils";
import { ThemeToggle } from "@/components/blog/theme-toggle";

export function SiteHeader() {
  const categories = getCategories();

  return (
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-[#232326]/95">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-6 py-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <Link href="/" className="text-xl font-semibold tracking-tight text-slate-950 dark:text-stone-100">
                {siteConfig.title}
              </Link>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-stone-400">
                {siteConfig.intro}
              </p>
            </div>
            <div className="flex flex-col items-start gap-4 md:items-end">
              <ThemeToggle />
              <nav className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-stone-300">
                {siteConfig.primaryNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="transition-colors hover:text-slate-950 dark:hover:text-stone-100"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          <div className="border-t border-slate-200/80 pt-4 dark:border-stone-800">
            <nav className="flex flex-wrap gap-x-5 gap-y-3 rounded-2xl bg-slate-50/70 px-4 py-3 text-sm text-slate-500 dark:border dark:border-stone-700 dark:bg-[#2a2a2e] dark:text-stone-400">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/categories/${slugify(category.name)}`}
                  className="transition-colors hover:text-slate-950 dark:hover:text-stone-100"
                >
                  {category.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
