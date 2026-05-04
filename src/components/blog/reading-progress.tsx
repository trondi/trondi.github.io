"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Reading progress indicator
 * - Renders only on post detail pages (/posts/[slug])
 * - Tracks document scroll progress (0–100%)
 * - Designed to live at the bottom edge of the sticky header
 */
export function ReadingProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);

  // Show only on post detail pages — but not on the index `/posts`
  const isPostPage = pathname?.startsWith("/posts/") && pathname !== "/posts";

  useEffect(() => {
    if (!isPostPage) return;

    // Lenis 등 부드러운 스크롤 라이브러리는 native scroll 이벤트를
    // 실시간으로 발화하지 않을 수 있으므로, 매 프레임 scrollY를
    // 직접 샘플링해 progress를 갱신한다.
    let raf = 0;
    let lastValue = -1;

    const tick = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const ratio = docHeight > 0 ? scrollTop / docHeight : 0;
      const next = Math.min(1, Math.max(0, ratio)) * 100;

      // 같은 값이면 setState 생략 (불필요 리렌더 방지)
      if (next !== lastValue) {
        lastValue = next;
        setProgress(next);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPostPage, pathname]);

  if (!isPostPage) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -bottom-[2px] h-[2px] overflow-hidden"
    >
      <div
        className="h-full bg-[hsl(var(--ring))] will-change-[width]"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
