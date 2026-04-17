"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Wraps the page with Lenis smooth scroll.
 * Duration / easing tuned for reading — not too springy.
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t: number) => 1 - Math.pow(1 - t, 4), // ease-out-quart
      smoothWheel: true,
    });

    let raf: number;
    function tick(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
