"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Wraps Next.js navigation with the View Transitions API.
 *
 * The API is not supported in all browsers (notably Firefox < 126, Safari < 18).
 * We check for support before calling startViewTransition so older browsers
 * fall back to the default instant navigation.
 *
 * CSS transitions are defined in globals.css via ::view-transition-* selectors.
 */
export function ViewTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    // Scroll to top on navigation (with view transition already in progress)
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return <>{children}</>;
}

/**
 * Hook: wrap a router.push() call with startViewTransition if supported.
 */
export function useViewTransitionRouter() {
  const router = useRouter();

  const push = (href: string) => {
    if (
      typeof document !== "undefined" &&
      "startViewTransition" in document
    ) {
      (document as Document & { startViewTransition: (cb: () => void) => void })
        .startViewTransition(() => {
          router.push(href);
        });
    } else {
      router.push(href);
    }
  };

  return { push, router };
}
