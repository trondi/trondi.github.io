// ─────────────────────────────────────────────────────────────────────────────
// reactions — 글별 이모지 리액션 Edge Function (슬랙 스타일)
//
//   GET  ?slug=<post_slug>      이모지별 카운트 + 내가 누른 이모지 목록
//   POST { slug, emoji }        토글 (이미 눌렀으면 취소, 아니면 추가)
//
// 배포: supabase functions deploy reactions --no-verify-jwt
// 시크릿: IP_SALT, ALLOWED_ORIGIN (comments 함수와 공유)
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

// 피커 fallback / GET 응답용 추천 세트 (자주 쓰는 것 위주).
// 실제 허용 여부는 아래 isValidEmoji()로 판정한다.
const SUGGESTED_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥"];

// 임의 문자열/텍스트 도배는 막되, 유니코드 이모지는 모두 허용.
// - Emoji_Presentation: 기본적으로 이모지로 렌더되는 문자 (😀 등)
// - Extended_Pictographic: 그림문자 전반 (❤ 등 변형 포함)
// - 길이 16 이하로 제한해 ZWJ 조합 이모지(👨‍👩‍👧 등)는 허용하되 폭주 방지
const EMOJI_RE = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})(‍(\p{Emoji_Presentation}|\p{Extended_Pictographic})|️|\p{Emoji_Modifier})*$/u;

function isValidEmoji(value: string): boolean {
  return value.length > 0 && value.length <= 16 && EMOJI_RE.test(value);
}

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

// 카운트 + 내가 누른 목록을 함께 계산
async function summarize(slug: string, ipHash: string | null) {
  const { data, error } = await supabase
    .from("reactions")
    .select("emoji, ip_hash")
    .eq("post_slug", slug);

  if (error) return null;

  const counts: Record<string, number> = {};
  const mine: string[] = [];
  for (const row of data ?? []) {
    counts[row.emoji] = (counts[row.emoji] ?? 0) + 1;
    if (ipHash && row.ip_hash === ipHash) mine.push(row.emoji);
  }
  return { counts, mine };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }

  const url = new URL(req.url);

  // ── GET: 리액션 현황 ───────────────────────────────────────────────────────
  if (req.method === "GET") {
    const slug = url.searchParams.get("slug");
    if (!slug) return json(req, { error: "slug required" }, 400);
    if (slug === "ping") return json(req, { ok: true });

    const ip = getClientIp(req);
    const ipHash = ip ? await sha256Hex(ip + IP_SALT) : null;

    const result = await summarize(slug, ipHash);
    if (!result) return json(req, { error: "db error" }, 500);
    return json(req, { ...result, emojis: SUGGESTED_EMOJIS });
  }

  // ── POST: 리액션 토글 ──────────────────────────────────────────────────────
  if (req.method === "POST") {
    let body: { slug?: string; emoji?: string };
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid json" }, 400);
    }

    const slug = body.slug?.trim();
    const emoji = body.emoji?.trim();
    if (!slug || !emoji) return json(req, { error: "missing fields" }, 400);
    if (!isValidEmoji(emoji)) {
      return json(req, { error: "emoji not allowed" }, 400);
    }

    const ip = getClientIp(req);
    const ipHash = ip ? await sha256Hex(ip + IP_SALT) : null;
    if (!ipHash) return json(req, { error: "no ip" }, 400);

    // 이미 눌렀는지 확인 → 토글
    const { data: existing } = await supabase
      .from("reactions")
      .select("id")
      .eq("post_slug", slug)
      .eq("emoji", emoji)
      .eq("ip_hash", ipHash)
      .maybeSingle();

    if (existing) {
      await supabase.from("reactions").delete().eq("id", existing.id);
    } else {
      await supabase
        .from("reactions")
        .insert({ post_slug: slug, emoji, ip_hash: ipHash });
    }

    const result = await summarize(slug, ipHash);
    if (!result) return json(req, { error: "db error" }, 500);
    return json(req, { ...result, emojis: SUGGESTED_EMOJIS });
  }

  return json(req, { error: "method not allowed" }, 405);
});
