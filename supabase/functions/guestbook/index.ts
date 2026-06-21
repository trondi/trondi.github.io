// ─────────────────────────────────────────────────────────────────────────────
// guestbook — 방명록 Edge Function (사이트 전체 단일 목록)
//
//   GET                          방명록 목록 (공개 컬럼만)
//   POST   { name, content, password? }   작성
//   DELETE { id, password }      비밀번호 검증 후 본인 삭제
//
// 배포: supabase functions deploy guestbook --no-verify-jwt
// 시크릿: IP_SALT, ALLOWED_ORIGIN, NOTIFY_WEBHOOK_URL (comments와 공유)
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

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string): Promise<string> {
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256,
  );
  const toHex = (buf: ArrayBuffer | Uint8Array) =>
    Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(bits)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const fromHex = (hex: string) =>
    new Uint8Array(hex.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? []);
  const salt = fromHex(parts[2]);
  const expected = parts[3];
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256,
  );
  const actual = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
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

  // ── GET: 목록 ──────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("slug") === "ping") return json(req, { ok: true });

    const { data, error } = await supabase
      .from("guestbook")
      .select("id, author_name, anon_id, content, created_at")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false });

    if (error) return json(req, { error: "db error" }, 500);
    return json(req, { entries: data });
  }

  // ── POST: 작성 ─────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    let body: { name?: string; content?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid json" }, 400);
    }
    const name = body.name?.trim();
    const content = body.content?.trim();
    const password = body.password ?? "";

    if (!name || !content) return json(req, { error: "missing fields" }, 400);
    if (name.length > 30) return json(req, { error: "name too long" }, 400);
    if (content.length > 500) return json(req, { error: "content too long" }, 400);

    const ip = getClientIp(req);
    const ipHash = ip ? await sha256Hex(ip + IP_SALT) : null;
    const anonId = ip ? (await sha256Hex(ip + IP_SALT)).slice(0, 6) : null;

    // 도배 차단: 같은 IP 60초 내 3개 초과 거부
    if (ipHash) {
      const { count } = await supabase
        .from("guestbook")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());
      if ((count ?? 0) >= 3) return json(req, { error: "rate limited" }, 429);
    }

    const { data, error } = await supabase
      .from("guestbook")
      .insert({
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

    // 새 방명록 알림 (fire-and-forget)
    const webhook = Deno.env.get("NOTIFY_WEBHOOK_URL");
    if (webhook) {
      const preview = content.length > 500 ? content.slice(0, 500) + "…" : content;
      const siteUrl = (Deno.env.get("SITE_URL") ?? ALLOWED_ORIGINS[0] ?? "").replace(/\/$/, "");
      const link = siteUrl ? `\n${siteUrl}/guestbook` : "";
      fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: `📖 **새 방명록**\n**${name}**: ${preview}${link}` }),
      }).catch(() => {});
    }

    return json(req, { entry: data }, 201);
  }

  // ── DELETE: 비밀번호 검증 후 삭제 ──────────────────────────────────────────
  if (req.method === "DELETE") {
    let body: { id?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid json" }, 400);
    }
    const id = body.id?.trim();
    const password = body.password ?? "";
    if (!id || !password) return json(req, { error: "missing fields" }, 400);

    const { data: row, error: findErr } = await supabase
      .from("guestbook")
      .select("id, password_hash")
      .eq("id", id)
      .maybeSingle();

    if (findErr) return json(req, { error: "db error" }, 500);
    if (!row) return json(req, { error: "not found" }, 404);
    if (!row.password_hash) return json(req, { error: "no password set" }, 403);

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) return json(req, { error: "wrong password" }, 403);

    const { error: delErr } = await supabase.from("guestbook").delete().eq("id", id);
    if (delErr) return json(req, { error: "db error" }, 500);
    return json(req, { ok: true });
  }

  return json(req, { error: "method not allowed" }, 405);
});
