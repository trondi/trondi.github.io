"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// reactions Edge Function 엔드포인트.
// comments URL의 마지막 경로만 reactions로 바꿔서 재사용한다.
const COMMENTS_API = process.env.NEXT_PUBLIC_COMMENTS_API_URL;
const REACTIONS_API = COMMENTS_API?.replace(/\/comments$/, "/reactions");

// 피커 fallback — 정상 동작 시엔 서버 응답의 emojis 목록을 사용한다.
const DEFAULT_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥"];

// 직접 입력창에서 이모지 토큰을 추출 (ZWJ 조합 이모지 포함)
const EMOJI_INPUT_RE =
  /(\p{Extended_Pictographic}(‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}️])*)/gu;

type ReactionsProps = {
  slug: string;
};

type Summary = {
  counts: Record<string, number>;
  mine: string[];
  emojis: string[];
};

export function Reactions({ slug }: ReactionsProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!REACTIONS_API) return;
    try {
      const res = await fetch(`${REACTIONS_API}?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error();
      setSummary(await res.json());
    } catch {
      // 조용히 실패 — 리액션은 부가 기능이라 페이지엔 영향 없음
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // 피커 바깥 클릭 시 닫기
  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      // 직접입력창에 포커스가 있으면(OS 이모지 패널 사용 중일 수 있음) 닫지 않는다
      if (document.activeElement === customInputRef.current) return;
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  if (!REACTIONS_API) return null;

  const toggle = async (emoji: string) => {
    if (pending) return;
    setPending(emoji);

    // 낙관적 업데이트 — 응답 기다리지 않고 UI 먼저 반영
    setSummary((prev) => {
      if (!prev) return prev;
      const reacted = prev.mine.includes(emoji);
      return {
        ...prev,
        counts: {
          ...prev.counts,
          [emoji]: (prev.counts[emoji] ?? 0) + (reacted ? -1 : 1),
        },
        mine: reacted
          ? prev.mine.filter((e) => e !== emoji)
          : [...prev.mine, emoji],
      };
    });

    try {
      const res = await fetch(REACTIONS_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, emoji }),
      });
      if (res.ok) {
        setSummary(await res.json()); // 서버 기준으로 동기화
      } else {
        await load(); // 실패 시 원복
      }
    } catch {
      await load();
    } finally {
      setPending(null);
    }
  };

  // 그리드에서 선택 → 토글 후 피커 닫기
  const pickFromPicker = (emoji: string) => {
    setPickerOpen(false);
    toggle(emoji);
  };

  // 직접입력창 처리 → 입력값에서 이모지를 추출해 모두 토글, 피커는 유지
  const handleCustomInput = (value: string) => {
    const matched = value.match(EMOJI_INPUT_RE);
    if (matched && matched.length > 0) {
      for (const emoji of matched) toggle(emoji);
      setCustomEmoji("");
    } else {
      setCustomEmoji(value);
    }
  };

  const allEmojis = summary?.emojis ?? DEFAULT_EMOJIS;
  // 카운트가 1 이상인 이모지를 모두 칩으로 노출 (추천 목록 밖의 커스텀 이모지 포함).
  // 카운트 내림차순 → 같으면 이모지 문자열 순으로 안정 정렬.
  const counts = summary?.counts ?? {};
  const activeEmojis = Object.keys(counts)
    .filter((e) => (counts[e] ?? 0) > 0)
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));

  return (
    <div className="mt-16 border-t border-border pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        이 글이 좋았다면
      </p>

      <div className="relative mt-5 flex flex-wrap items-center gap-2">
        {/* 반응이 달린 이모지 칩 */}
        {activeEmojis.map((emoji) => {
          const count = summary?.counts[emoji] ?? 0;
          const reacted = summary?.mine.includes(emoji) ?? false;
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => toggle(emoji)}
              disabled={pending === emoji}
              aria-pressed={reacted}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95",
                reacted
                  ? "border-[hsl(var(--ring))] bg-[hsl(var(--ring)/0.12)] text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground",
              )}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span className="tabular-nums text-xs font-medium">{count}</span>
            </button>
          );
        })}

        {/* + 버튼 (이모지 피커 열기) */}
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="이모지 추가"
            aria-expanded={pickerOpen}
            className={cn(
              "inline-flex h-[34px] items-center gap-1 rounded-full border px-3 text-sm transition-colors",
              pickerOpen
                ? "border-[hsl(var(--ring))] text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground",
            )}
          >
            <span className="text-base leading-none">🙂</span>
            <span className="text-xs leading-none">+</span>
          </button>

          {/* 피커 팝오버 */}
          {pickerOpen ? (
            <div className="absolute left-0 top-[calc(100%+8px)] z-10 w-[min(300px,80vw)] rounded-2xl border border-border bg-card p-3 shadow-lg">
              <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                자주 쓰는 이모지
              </p>
              <div className="grid grid-cols-5 gap-1">
                {allEmojis.map((emoji) => {
                  const reacted = summary?.mine.includes(emoji) ?? false;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => pickFromPicker(emoji)}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-lg text-lg transition-colors hover:bg-secondary/70",
                        reacted && "bg-[hsl(var(--ring)/0.14)]",
                      )}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>

              {/* OS 기본 이모지 키보드로 직접 입력 (모든 이모지 사용 가능) */}
              <div className="mt-2 border-t border-border pt-2">
                <input
                  ref={customInputRef}
                  type="text"
                  inputMode="text"
                  enterKeyHint="done"
                  placeholder="직접 입력 — 이모지 🙂 키보드 사용"
                  value={customEmoji}
                  onChange={(e) => handleCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCustomInput(customEmoji);
                    }
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[hsl(var(--ring))] focus:outline-none"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
