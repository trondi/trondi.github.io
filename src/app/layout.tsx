import type { Metadata } from "next";

import { LenisProvider } from "@/components/blog/lenis-provider";
import { SeasonalOverlay } from "@/components/blog/seasonal-overlay";
import { SmoothCursor } from "@/components/blog/smooth-cursor";
import { SeasonalProvider } from "@/components/blog/seasonal-context";
import { SiteFooter } from "@/components/blog/site-footer";
import { SiteHeader } from "@/components/blog/site-header";
import { ViewTransitionProvider } from "@/components/blog/view-transition-provider";
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
      <body className="bg-[rgb(var(--page))] font-sans text-foreground antialiased">
        <SmoothCursor />
        <LenisProvider>
          <SeasonalProvider>
            <ViewTransitionProvider>
              <div className="min-h-screen">
                <SeasonalOverlay />
                <SiteHeader />
                <main className="mx-auto max-w-6xl px-6 pb-16 pt-4">{children}</main>
                <SiteFooter />
              </div>
            </ViewTransitionProvider>
          </SeasonalProvider>
        </LenisProvider>
      </body>
    </html>
  );
}
