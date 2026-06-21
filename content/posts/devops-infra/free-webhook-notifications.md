---
title: "새 댓글 알림을 무료로 — Discord·Slack·Telegram 웹훅 비교"
date: "2026-06-20"
summary: "서버에서 이벤트가 생길 때 폰으로 즉시 알림을 받고 싶다면 메신저 웹훅이 가장 가볍다. Discord·Slack·Telegram·이메일(Resend)의 무료 웹훅을 셋업 난이도와 코드까지 비교했다."
category: "DevOps · Infra"
tags:
  - Webhook
  - Discord
  - Slack
  - Notification
  - Serverless
featured: false
---

# 새 댓글 알림을 무료로 — 메신저 웹훅 비교

블로그에 댓글 기능을 붙이고 나니 다음 고민이 생겼다. **새 댓글이 달렸는지 어떻게 알지?** 매번 DB 대시보드를 열어볼 순 없다.

가장 가벼운 답은 **메신저 웹훅**이다. 서버에서 이벤트가 생긴 순간 메신저로 메시지 한 방을 쏘면, 폰으로 즉시 푸시 알림이 온다. 별도 인프라도, 비용도 없다.

---

## 공통 원리

어떤 메신저든 동작은 같다. 서버(여기선 Supabase Edge Function)에서 이벤트 직후 웹훅 URL로 POST 한 번.

```ts
// 댓글 INSERT 성공 직후
const webhook = Deno.env.get("NOTIFY_WEBHOOK_URL");
if (webhook) {
  fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: `💬 새 댓글: ${name}` }),
  }).catch(() => {});   // ← fire-and-forget
}
```

**중요한 한 가지 — `await`하지 않는다.** 알림 서버가 느리거나 죽어도 본 기능(댓글 작성 응답)이 지연/실패하면 안 된다. 알림은 "있으면 좋은" 부가 기능이므로 실패를 무시한다.

---

## 비교 한눈에

| | 셋업 시간 | 시크릿 개수 | 본문 필드 | 비고 |
|---|---|---|---|---|
| **Discord** | 2분 | 1개 | `content` | 가장 간단 👑 |
| **Slack** | 5분 | 1개 | `text` | 앱 생성 단계 필요 |
| **Telegram** | 7분 | 2개 | `chat_id`+`text` | chat_id 확보 단계 |
| **이메일(Resend)** | 10분 | 1개 | (메일 필드) | 푸시보다 느림 |

모두 무료 티어로 개인 블로그엔 차고 넘친다.

---

## 1. Discord — 가장 쉬움

채널 설정에서 URL만 받으면 끝. 앱 심사도 없다.

```
채널 우클릭 → 채널 편집 → 연동 → 웹후크 → 새 웹후크 → URL 복사
```

```ts
body: JSON.stringify({
  content: `💬 **새 댓글** \`${slug}\`\n**${name}**: ${preview}`,
})
```

> Discord는 본문 필드가 **`content`**이고 마크다운을 지원한다. 링크를 넣으면 자동으로 클릭 가능해진다.

## 2. Slack — 업무용으로 쓴다면

```
api.slack.com/apps → Create App → Incoming Webhooks 활성화 → URL 복사
```

```ts
body: JSON.stringify({ text: `💬 새 댓글\n*${name}*: ${preview}` })
```

> 본문 필드가 **`text`**. 앱을 만드는 단계가 있어 Discord보다 약간 번거롭다.

## 3. Telegram — 봇 토큰 + chat_id

```
@BotFather에게 /newbot → 봇 토큰 발급
봇과 대화 시작 → api.telegram.org/bot<토큰>/getUpdates 에서 chat_id 확인
```

```ts
fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, text: `💬 새 댓글: ${name}` }),
});
```

> URL에 토큰, 본문에 `chat_id`가 필요해 **시크릿이 2개**다.

## 4. 이메일 (Resend) — 메신저를 안 쓴다면

무료 티어 월 3,000통. 메신저 대신 메일로 받고 싶을 때.

```ts
fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({
    from: "onboarding@resend.dev",
    to: "me@example.com",
    subject: "새 댓글",
    text: `${name}: ${content}`,
  }),
});
```

> 메일은 푸시보다 확인이 늦고 스팸함에 갈 수 있다. 즉시성은 메신저가 낫다.

---

## 운영 팁

- **웹훅 URL은 시크릿으로만 관리.** 그 URL을 아는 사람은 누구나 채널에 메시지를 보낼 수 있다(보내기 전용이라 읽기·제어는 불가). 코드/깃엔 절대 두지 말고, 유출되면 재발급해 무효화한다.
- **본문 길이 제한.** 댓글이 길면 잘라서 보낸다(`content.slice(0, 500)`). 메신저마다 길이 한도가 있다.
- **글로 가는 링크 포함.** slug로 전체 URL을 만들어 붙이면 알림에서 바로 해당 글로 이동할 수 있다.

---

## 정리

- 서버 이벤트 알림은 **메신저 웹훅**이 가장 가볍고 무료다.
- **Discord**가 셋업 가장 쉬움(2분, URL 하나). Slack·Telegram도 무료지만 단계가 더 있다.
- 알림 호출은 **fire-and-forget** — 본 기능을 막지 않게 `await`하지 않는다.
- URL은 시크릿으로만, 본문은 잘라서, 링크는 포함.

> 이 블로그의 댓글·방명록 알림이 Discord 웹훅으로 동작한다. 전체 구조는 [정적 블로그에 동적 기능 더하기](/posts/static-blog-dynamic-features) 참고.
