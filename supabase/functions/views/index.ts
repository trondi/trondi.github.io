// ─────────────────────────────────────────────────────────────────────────────
// views — 글별 조회수 Edge Function
//
//   GET  ?slug=<post_slug>   현재 조회수 반환
//   POST { slug }            조회 기록 (중복/봇 방지 후 카운트)
//
// 배포: supabase functions deploy views --no-verify-jwt
// 시크릿: IP_SALT, ALLOWED_ORIGIN (comments 함수와 공유)
//
// 본인(운영자) 제외는 클라이언트가 localStorage 플래그로 POST를 생략하는 방식.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const IP_SALT = Deno.env.get("IP_SALT") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// 같은 사람의 재조회를 무시하는 시간 창 (분)
const DEDUP_WINDOW_MIN = 30;

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeadersFor(req) },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }

  const url = new URL(req.url);

  // ── GET: 조회수 반환 ───────────────────────────────────────────────────────
  if (req.method === "GET") {
    const slug = url.searchParams.get("slug");
    if (!slug) return json(req, { error: "slug required" }, 400);
    if (slug === "ping") return json(req, { ok: true });

    const { data, error } = await supabase
      .from("post_views")
      .select("view_count")
      .eq("post_slug", slug)
      .maybeSingle();

    if (error) return json(req, { error: "db error" }, 500);
    return json(req, { count: data?.view_count ?? 0 });
  }

  // ── POST: 조회 기록 ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    let body: { slug?: string };
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid json" }, 400);
    }
    const slug = body.slug?.trim();
    if (!slug) return json(req, { error: "slug required" }, 400);

    // 봇/크롤러는 카운트하지 않음
    const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
    if (/bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit/i.test(ua)) {
      return json(req, { ok: true, skipped: "bot" });
    }

    const ip = getClientIp(req);
    const ipHash = ip ? await sha256Hex(ip + IP_SALT) : null;

    // 중복 방지: 같은 IP가 30분 내 같은 글을 또 보면 카운트하지 않음
    if (ipHash) {
      const since = new Date(Date.now() - DEDUP_WINDOW_MIN * 60_000).toISOString();
      const { data: recent } = await supabase
        .from("post_view_events")
        .select("id")
        .eq("post_slug", slug)
        .eq("ip_hash", ipHash)
        .gte("viewed_at", since)
        .limit(1)
        .maybeSingle();
      if (recent) return json(req, { ok: true, skipped: "duplicate" });
    }

    const { error } = await supabase
      .from("post_view_events")
      .insert({ post_slug: slug, ip_hash: ipHash });

    if (error) return json(req, { error: "db error" }, 500);
    return json(req, { ok: true });
  }

  return json(req, { error: "method not allowed" }, 405);
});
