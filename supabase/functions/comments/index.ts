// ─────────────────────────────────────────────────────────────────────────────
// comments — 익명 댓글 Edge Function
//
//   GET  ?slug=<post_slug>   해당 글의 댓글 목록 (공개 컬럼만)
//   POST { slug, name, content, password? }   댓글 작성
//
// 배포: supabase functions deploy comments --no-verify-jwt
//   (--no-verify-jwt: 로그인 없는 익명 사용자가 호출해야 하므로 JWT 검증 해제)
//
// 시크릿: supabase secrets set IP_SALT=<랜덤 문자열> ALLOWED_ORIGIN=<블로그 주소>
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 런타임이 자동 주입한다.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const IP_SALT = Deno.env.get("IP_SALT") ?? "";
// 콤마로 여러 도메인 허용 (예: "https://trondi.github.io,http://localhost:3000")
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// 요청 Origin이 허용 목록에 있으면 그 값을 그대로 echo back.
// 목록에 "*"가 있으면 전체 허용.
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

// ── 해시 유틸 (WebCrypto만 사용 — 외부 의존성 없음) ──────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 비밀번호 해시: PBKDF2-SHA256, 포맷 "pbkdf2$<iter>$<saltHex>$<hashHex>"
// 댓글 비밀번호 수준의 저가치 시크릿에는 충분한 강도.
async function hashPassword(password: string): Promise<string> {
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  const toHex = (buf: ArrayBuffer | Uint8Array) =>
    Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(bits)}`;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

// ── 핸들러 ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }

  const url = new URL(req.url);

  // ── GET: 댓글 목록 ─────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const slug = url.searchParams.get("slug");
    if (!slug) return json(req, { error: "slug required" }, 400);

    // keep-alive ping 전용 (DB 조회 없이 빠른 응답)
    if (slug === "ping") return json(req, { ok: true });

    const { data, error } = await supabase
      .from("comments")
      // 공개 컬럼만 — ip_hash, password_hash, user_agent 는 절대 포함 금지
      .select("id, author_name, anon_id, content, created_at")
      .eq("post_slug", slug)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true });

    if (error) return json(req, { error: "db error" }, 500);
    return json(req, { comments: data });
  }

  // ── POST: 댓글 작성 ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    let body: { slug?: string; name?: string; content?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid json" }, 400);
    }

    const slug = body.slug?.trim();
    const name = body.name?.trim();
    const content = body.content?.trim();
    const password = body.password ?? "";

    if (!slug || !name || !content) return json(req, { error: "missing fields" }, 400);
    if (name.length > 30) return json(req, { error: "name too long" }, 400);
    if (content.length > 1000) return json(req, { error: "content too long" }, 400);

    const ip = getClientIp(req);
    const ipHash = ip ? await sha256Hex(ip + IP_SALT) : null;
    // 같은 글 안에서만 유효한 공개 익명 ID — 글이 바뀌면 ID도 바뀐다
    const anonId = ip ? (await sha256Hex(ip + slug + IP_SALT)).slice(0, 6) : null;

    // 도배 차단: 같은 IP가 60초 안에 3개 이상 작성 시 거부
    if (ipHash) {
      const { count } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());
      if ((count ?? 0) >= 3) return json(req, { error: "rate limited" }, 429);
    }

    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_slug: slug,
        author_name: name,
        content,
        password_hash: password ? await hashPassword(password) : null,
        ip_hash: ipHash,
        anon_id: anonId,
        user_agent: req.headers.get("user-agent"),
      })
      .select("id, author_name, anon_id, content, created_at")
      .single();

    if (error) return json(req, { error: "db error" }, 500);
    return json(req, { comment: data }, 201);
  }

  return json(req, { error: "method not allowed" }, 405);
});
