"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

// comments URL에서 경로만 views로 바꿔 재사용
const COMMENTS_API = process.env.NEXT_PUBLIC_COMMENTS_API_URL;
const VIEWS_API = COMMENTS_API?.replace(/\/comments$/, "/views");

// 이 플래그가 켜진 브라우저는 조회수를 올리지 않는다 (운영자 본인용).
// 콘솔에서 localStorage.setItem("blog_no_count", "1") 로 켤 수 있다.
const NO_COUNT_KEY = "blog_no_count";

type ViewCountProps = {
  slug: string;
};

export function ViewCount({ slug }: ViewCountProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!VIEWS_API) return;
    let active = true;

    const run = async () => {
      // 본인 제외: 플래그가 켜져 있으면 기록(POST)을 건너뛰고 조회수만 읽는다
      const skipCount = window.localStorage.getItem(NO_COUNT_KEY) === "1";

      if (!skipCount) {
        try {
          await fetch(VIEWS_API, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slug }),
          });
        } catch {
          /* 기록 실패는 무시 */
        }
      }

      try {
        const res = await fetch(`${VIEWS_API}?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active) setCount(data.count ?? 0);
      } catch {
        /* 조회 실패 시 표시하지 않음 */
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [slug]);

  if (!VIEWS_API || count === null) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <Eye className="h-3.5 w-3.5" />
      <span className="tabular-nums">{count.toLocaleString()}</span>
    </span>
  );
}
