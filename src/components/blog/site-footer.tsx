import Link from "next/link";

import { siteConfig } from "@/lib/blog/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          {new Date().getFullYear()} {siteConfig.author.name}. Writing for readable interfaces and durable notes.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href={siteConfig.author.github} className="transition-colors hover:text-foreground">
            GitHub
          </Link>
          <a href={`mailto:${siteConfig.author.email}`} className="transition-colors hover:text-foreground">
            Email
          </a>
        </div>
      </div>
    </footer>
  );
}
