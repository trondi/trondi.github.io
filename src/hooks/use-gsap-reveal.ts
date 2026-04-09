"use client";

import { useEffect, useRef } from "react";
import { gsap, registerGsap, ScrollTrigger } from "@/lib/gsap";

interface RevealOptions {
  /** Stagger delay between children (seconds). Default: 0.08 */
  stagger?: number;
  /** Y offset to animate from (px). Default: 22 */
  y?: number;
  /** Duration (seconds). Default: 0.55 */
  duration?: number;
  /** ScrollTrigger start. Default: "top 88%" */
  start?: string;
  /** Animate children individually (true) or the root element (false). Default: true */
  children?: boolean;
}

/**
 * Attaches a GSAP ScrollTrigger fade+slide reveal to the returned ref.
 *
 * Usage:
 *   const ref = useGsapReveal<HTMLDivElement>();
 *   return <div ref={ref}>...</div>;
 */
export function useGsapReveal<T extends HTMLElement = HTMLDivElement>(
  options: RevealOptions = {},
) {
  const ref = useRef<T | null>(null);
  const {
    stagger = 0.08,
    y = 22,
    duration = 0.55,
    start = "top 88%",
    children: animateChildren = true,
  } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    registerGsap();

    const targets = animateChildren ? Array.from(el.children) : [el];
    if (targets.length === 0) return;

    gsap.set(targets, { opacity: 0, y });

    const trigger = ScrollTrigger.create({
      trigger: el,
      start,
      once: true,
      onEnter: () => {
        gsap.to(targets, {
          opacity: 1,
          y: 0,
          duration,
          stagger,
          ease: "power2.out",
        });
      },
    });

    return () => {
      trigger.kill();
    };
  }, [stagger, y, duration, start, animateChildren]);

  return ref;
}
