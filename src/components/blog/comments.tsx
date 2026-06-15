"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { formatDate } from "@/lib/blog/utils";

// Supabase Edge Function 엔드포인트.
// 정적 export 빌드 시점에 주입된다 — 미설정이면 댓글 섹션 자체를 렌더하지 않아
// Supabase 셋업 전에도 블로그 빌드/배포가 깨지지 않는다.
const COMMENTS_API = process.env.NEXT_PUBLIC_COMMENTS_API_URL;

type Comment = {
  id: string;
  author_name: string;
  anon_id: string | null;
  content: string;
  created_at: string;
};

type CommentsProps = {
  slug: string;
};

export function Comments({ slug }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!COMMENTS_API) return;
    try {
      const res = await fetch(`${COMMENTS_API}?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setComments(data.comments ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (!COMMENTS_API) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !name.trim() || !content.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(COMMENTS_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, name, password, content }),
      });
      if (res.status === 429) {
        setSubmitError("잠시 후 다시 시도해주세요. (도배 방지)");
        return;
      }
      if (!res.ok) {
        setSubmitError("댓글 등록에 실패했습니다.");
        return;
      }
      setContent("");
      setPassword("");
      await load();
    } catch {
      setSubmitError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-16 border-t border-border pt-10">
      <div className="mb-8 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Comments
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {status === "ready" ? `${comments.length}개` : ""}
        </span>
      </div>

      {/* ── 목록 ─────────────────────────────────────────────────────────── */}
      {status === "error" ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          댓글을 불러오지 못했습니다.
        </p>
      ) : comments.length > 0 ? (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-2xl border border-border bg-card/70 p-5"
            >
              <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="text-sm font-semibold text-foreground">
                  {comment.author_name}
                </span>
                {comment.anon_id ? (
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    ({comment.anon_id})
                  </span>
                ) : null}
                <span aria-hidden>·</span>
                <time dateTime={comment.created_at}>
                  {formatDate(comment.created_at)}
                </time>
              </div>
              <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                {comment.content}
              </p>
            </li>
          ))}
        </ul>
      ) : status === "ready" ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          아직 댓글이 없습니다. 첫 댓글을 남겨보세요.
        </p>
      ) : null}

      {/* ── 작성 폼 ──────────────────────────────────────────────────────── */}
      <form onSubmit={submit} className="mt-10 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            maxLength={30}
            required
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[hsl(var(--ring))] focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (선택)"
            maxLength={50}
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[hsl(var(--ring))] focus:outline-none"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="댓글을 입력하세요 (최대 1000자)"
          maxLength={1000}
          rows={4}
          required
          className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground/60 focus:border-[hsl(var(--ring))] focus:outline-none"
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            도배·스팸 방지를 위해 IP의 해시값이 저장됩니다.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "댓글 남기기"}
          </button>
        </div>
        {submitError ? (
          <p className="text-xs text-red-500">{submitError}</p>
        ) : null}
      </form>
    </section>
  );
}
