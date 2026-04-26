"use client";

import { useEffect, useRef } from "react";

/**
 * SmoothCursor — dot + lagging ring
 * 기본 커서를 숨기고 amber accent 색상의 커스텀 커서를 렌더링한다.
 * 터치 디바이스(pointer: coarse)에서는 자동으로 비활성화된다.
 */
export function SmoothCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 터치 디바이스에서는 활성화하지 않음
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const pos     = { x: -200, y: -200 };
    const ringPos = { x: -200, y: -200 };
    let clicking  = false;
    let raf: number;

    const onMove  = (e: MouseEvent) => { pos.x = e.clientX; pos.y = e.clientY; };
    const onDown  = () => { clicking = true; };
    const onUp    = () => { clicking = false; };

    document.body.style.cursor = "none";
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup",   onUp);

    function tick() {
      raf = requestAnimationFrame(tick);

      // Dot — pointer tip에 즉시 따라붙음
      dot!.style.transform = `translate(${pos.x - 3}px, ${pos.y - 3}px)`;

      // Ring — lerp로 부드럽게 뒤따라옴
      ringPos.x += (pos.x - ringPos.x) * 0.11;
      ringPos.y += (pos.y - ringPos.y) * 0.11;
      const scale = clicking ? 0.7 : 1;
      ring!.style.transform =
        `translate(${ringPos.x - 13}px, ${ringPos.y - 13}px) scale(${scale})`;
    }

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  return (
    <>
      {/* Dot — 포인터 위치에 즉시 */}
      <div
        ref={dotRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "hsl(var(--ring))",
          pointerEvents: "none",
          zIndex: 99999,
          willChange: "transform",
        }}
      />
      {/* Ring — dot 뒤를 부드럽게 따라옴 */}
      <div
        ref={ringRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 26,
          height: 26,
          borderRadius: "50%",
          border: "1.5px solid hsl(var(--ring))",
          opacity: 0.55,
          pointerEvents: "none",
          zIndex: 99999,
          willChange: "transform",
          transition: "opacity 0.2s",
        }}
      />
    </>
  );
}
