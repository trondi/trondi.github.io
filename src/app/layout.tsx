import type { Metadata } from "next";

import { AmbientScene } from "@/components/blog/three/ambient-scene";
import { SiteFooter } from "@/components/blog/site-footer";
import { SiteHeader } from "@/components/blog/site-header";
import { siteConfig } from "@/lib/blog/config";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.title}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.title,
  keywords: ["frontend", "react", "next.js", "typescript", "blog"],
  authors: [{ name: siteConfig.author.name }],
  creator: siteConfig.author.name,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: siteConfig.siteUrl,
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.title,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-[rgb(var(--page))] font-sans text-slate-900 antialiased dark:text-zinc-200">
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),_transparent_38%),linear-gradient(180deg,#fcfcfd_0%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(113,113,122,0.12),_transparent_30%),linear-gradient(180deg,#111113_0%,#18181b_55%,#161618_100%)]">
          <AmbientScene />
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-6 pb-12 pt-4">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
