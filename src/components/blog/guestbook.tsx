"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { formatDate } from "@/lib/blog/utils";

const COMMENTS_API = process.env.NEXT_PUBLIC_COMMENTS_API_URL;
const GUESTBOOK_API = COMMENTS_API?.replace(/\/comments$/, "/guestbook");

type Entry = {
  id: string;
  author_name: string;
  anon_id: string | null;
  content: string;
  created_at: string;
};

export function Guestbook() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!GUESTBOOK_API) return;
    try {
      const res = await fetch(GUESTBOOK_API);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries(data.entries ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!GUESTBOOK_API) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        방명록을 준비 중입니다.
      </p>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !name.trim() || !content.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(GUESTBOOK_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, password, content }),
      });
      if (res.status === 429) {
        setSubmitError("잠시 후 다시 시도해주세요. (도배 방지)");
        return;
      }
      if (!res.ok) {
        setSubmitError("등록에 실패했습니다.");
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

  const confirmDelete = async (id: string) => {
    if (deleteBusy || !deletePassword) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(GUESTBOOK_API, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, password: deletePassword }),
      });
      if (res.status === 403) {
        setDeleteError("비밀번호가 일치하지 않습니다.");
        return;
      }
      if (!res.ok) {
        setDeleteError("삭제에 실패했습니다.");
        return;
      }
      setDeletingId(null);
      setDeletePassword("");
      await load();
    } catch {
      setDeleteError("네트워크 오류가 발생했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      {/* ── 작성 폼 ──────────────────────────────────────────────────────── */}
      <form onSubmit={submit} className="space-y-3">
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
            placeholder="비밀번호 (선택 — 삭제 시 필요)"
            maxLength={50}
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[hsl(var(--ring))] focus:outline-none"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="방명록을 남겨주세요 (최대 500자)"
          maxLength={500}
          rows={3}
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
            {submitting ? "남기는 중..." : "방명록 남기기"}
          </button>
        </div>
        {submitError ? <p className="text-xs text-red-500">{submitError}</p> : null}
      </form>

      {/* ── 목록 ─────────────────────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="mb-6 flex items-center justify-between border-b border-border pb-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Entries
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {status === "ready" ? `${entries.length}개` : ""}
          </span>
        </div>

        {status === "error" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            방명록을 불러오지 못했습니다.
          </p>
        ) : entries.length > 0 ? (
          <ul className="space-y-4">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-2xl border border-border bg-card/70 p-5">
                <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {entry.author_name}
                    </span>
                    {entry.anon_id ? (
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        ({entry.anon_id})
                      </span>
                    ) : null}
                    <span aria-hidden>·</span>
                    <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      deletingId === entry.id ? setDeletingId(null) : setDeletingId(entry.id)
                    }
                    className="shrink-0 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
                  >
                    {deletingId === entry.id ? "취소" : "삭제"}
                  </button>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                  {entry.content}
                </p>

                {deletingId === entry.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="작성 시 입력한 비밀번호"
                      maxLength={50}
                      autoComplete="off"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmDelete(entry.id);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[hsl(var(--ring))] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => confirmDelete(entry.id)}
                      disabled={deleteBusy || !deletePassword}
                      className="shrink-0 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {deleteBusy ? "삭제 중..." : "삭제 확인"}
                    </button>
                    {deleteError ? (
                      <p className="w-full text-xs text-red-500">{deleteError}</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : status === "ready" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            아직 방명록이 없습니다. 첫 방명록을 남겨보세요.
          </p>
        ) : null}
      </div>
    </div>
  );
}
