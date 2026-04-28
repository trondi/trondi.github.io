"use client";

import { useEffect, useRef } from "react";

/**
 * SmoothCursor — dot + lagging ring
 * - 도트: 마우스 위치에 즉시 따라붙음
 * - 링:  lerp로 부드럽게 뒤따라옴
 * - 인터랙티브 요소(a, button 등) 위에서 링이 커지고 채워져 클릭 가능 신호를 줌
 * - 터치 디바이스(pointer: coarse)에서 자동 비활성화
 */
export function SmoothCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const pos     = { x: -200, y: -200 };
    const ringPos = { x: -200, y: -200 };
    let clicking   = false;
    let hovering   = false;  // 인터랙티브 요소 위에 있는가
    let raf: number;

    const INTERACTIVE = "a, button, [role='button'], label, select, input, textarea, summary";

    const onMove  = (e: MouseEvent) => { pos.x = e.clientX; pos.y = e.clientY; };
    const onDown  = () => { clicking = true; };
    const onUp    = () => { clicking = false; };
    const onOver  = (e: MouseEvent) => {
      hovering = !!(e.target as Element)?.closest(INTERACTIVE);
    };

    window.addEventListener("mousemove",  onMove, { passive: true });
    window.addEventListener("mouseover",  onOver, { passive: true });
    window.addEventListener("mousedown",  onDown);
    window.addEventListener("mouseup",    onUp);

    function tick() {
      raf = requestAnimationFrame(tick);

      // Dot — 포인터 선단에 즉시
      dot!.style.transform = `translate(${pos.x - 3}px, ${pos.y - 3}px)`;
      // 인터랙티브 요소 위에서 도트 숨김 (링이 충분한 피드백 제공)
      dot!.style.opacity = hovering ? "0" : "1";

      // Ring — lerp
      ringPos.x += (pos.x - ringPos.x) * 0.11;
      ringPos.y += (pos.y - ringPos.y) * 0.11;

      // 상태별 ring 크기 계산
      const targetSize = clicking ? 20 : hovering ? 36 : 26;

      ring!.style.transform =
        `translate(${ringPos.x - targetSize / 2}px, ${ringPos.y - targetSize / 2}px)`;
      ring!.style.width  = `${targetSize}px`;
      ring!.style.height = `${targetSize}px`;
      // hovering 시 링을 살짝 채워 클릭 가능 신호 강화
      ring!.style.background = hovering
        ? "hsl(var(--ring) / 0.12)"
        : "transparent";
      ring!.style.opacity = clicking ? "0.9" : hovering ? "0.85" : "0.55";
    }

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove",  onMove);
      window.removeEventListener("mouseover",  onOver);
      window.removeEventListener("mousedown",  onDown);
      window.removeEventListener("mouseup",    onUp);
    };
  }, []);

  return (
    <>
      {/* Dot */}
      <div
        ref={dotRef}
        aria-hidden
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          width:         6,
          height:        6,
          borderRadius:  "50%",
          background:    "hsl(var(--ring))",
          pointerEvents: "none",
          zIndex:        99999,
          willChange:    "transform",
          transition:    "opacity 0.15s",
        }}
      />
      {/* Ring */}
      <div
        ref={ringRef}
        aria-hidden
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          width:         26,
          height:        26,
          borderRadius:  "50%",
          border:        "1.5px solid hsl(var(--ring))",
          pointerEvents: "none",
          zIndex:        99999,
          willChange:    "transform",
          transition:    "width 0.18s ease, height 0.18s ease, background 0.18s ease, opacity 0.18s ease",
        }}
      />
    </>
  );
}
