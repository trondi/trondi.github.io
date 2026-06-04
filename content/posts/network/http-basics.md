---
title: "HTTP 기초 — 메서드, 상태 코드, 헤더, 그리고 HTTP/1.1에서 3까지"
date: "2026-06-05"
summary: "DNS로 서버를 찾고 TLS로 터널을 만든 다음, 브라우저와 서버가 실제로 주고받는 약속이 HTTP다. 요청·응답 구조, 메서드와 상태 코드, 주요 헤더, 그리고 HTTP 버전의 변천을 정리했다."
category: "Network"
tags:
  - Network
  - HTTP
  - HTTP/2
  - HTTP/3
  - Web
featured: false
---

# HTTP 기초

[DNS](/posts/dns-ip-and-nat)로 서버의 IP를 찾고, [TLS](/posts/https-tls-handshake)로 안전한 터널을 만들었다. 이제 그 터널 위에서 브라우저와 서버가 실제로 대화한다. 그 대화의 규칙이 **HTTP(HyperText Transfer Protocol)**다.

HTTP는 의외로 단순하다. 브라우저가 "이거 주세요"라고 **요청(request)**하면 서버가 "여기 있어요"라고 **응답(response)**한다. 이 글은 그 요청·응답의 구조와, 메서드·상태 코드·헤더, 그리고 HTTP가 1.1에서 3까지 어떻게 진화했는지를 정리한다.

---

## HTTP는 요청-응답 프로토콜이다

HTTP의 기본 성격은 두 가지다.

- **요청-응답**: 항상 클라이언트가 먼저 요청하고, 서버가 응답한다. 서버가 먼저 말을 걸지 않는다. (그래서 실시간 알림엔 SSE나 WebSocket이 따로 필요하다.)
- **무상태(stateless)**: 각 요청은 독립적이다. 서버는 이전 요청을 기억하지 않는다. 로그인 상태 같은 걸 유지하려면 쿠키나 토큰을 매번 함께 보내야 한다.

---

## 요청과 응답의 구조

요청은 시작 줄(메서드 + 경로 + 버전), 헤더, 빈 줄, 본문으로 이뤄진다.

```text
POST /api/login HTTP/1.1        ← 메서드 + 경로 + 버전
Host: example.com               ┐
Content-Type: application/json  ├ 헤더
Authorization: Bearer abc...    ┘
                                ← 빈 줄
{ "id": "tom", "pw": "1234" }   ← 본문(body)
```

응답도 비슷한 모양이다. 시작 줄에 상태 코드가 온다.

```text
HTTP/1.1 200 OK                 ← 버전 + 상태 코드
Content-Type: application/json  ┐
Set-Cookie: session=xyz...      ├ 헤더
Cache-Control: no-store         ┘
                                ← 빈 줄
{ "ok": true }                  ← 본문
```

---

## 메서드 — 무엇을 할 것인가

메서드는 그 요청의 의도를 나타낸다. 자주 쓰는 것은 다섯 개다.

| 메서드 | 용도 | 안전 | 멱등 |
|---|---|---|---|
| GET | 조회 | O | O |
| POST | 생성·실행 | X | X |
| PUT | 전체 교체 | X | O |
| PATCH | 부분 수정 | X | X |
| DELETE | 삭제 | X | O |

- **안전(safe)**: 서버 상태를 바꾸지 않는다. GET이 대표적이다.
- **멱등(idempotent)**: 같은 요청을 여러 번 보내도 결과가 같다. PUT/DELETE는 멱등이지만 POST는 아니다. (결제 POST를 두 번 누르면 두 번 결제되는 이유다.)

이 구분은 재시도 정책과 직결된다. 멱등한 요청은 실패 시 안전하게 재시도할 수 있지만, POST는 그렇지 않다.

---

## 상태 코드 — 결과가 어땠나

응답의 세 자리 숫자는 결과를 분류한다. 앞자리로 큰 갈래를 잡는다.

| 범위 | 의미 | 예 |
|---|---|---|
| 2xx | 성공 | 200 OK, 201 Created, 204 No Content |
| 3xx | 리다이렉트 | 301 Moved Permanently, 304 Not Modified |
| 4xx | 클라이언트 잘못 | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 429 Too Many Requests |
| 5xx | 서버 잘못 | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable |

자주 헷갈리는 것 두 가지. **401(Unauthorized)**은 사실 "인증 안 됨"(로그인 필요)이고, **403(Forbidden)**이 "권한 없음"이다. 그리고 `fetch`는 4xx, 5xx를 에러로 reject하지 않는다. 연결 자체가 실패할 때만 reject하고, HTTP 에러는 `res.ok === false`로 표현된다. (관련: [JavaScript 동기와 비동기](/posts/js-sync-async-basics)의 fetch 설명)

---

## 헤더 — 요청·응답에 붙는 메타데이터

헤더는 본문 외의 부가 정보를 담는다. 실무에서 자주 보는 것들만 추린다.

| 헤더 | 방향 | 역할 |
|---|---|---|
| `Content-Type` | 양쪽 | 본문 형식 (`application/json`, `text/html`) |
| `Authorization` | 요청 | 인증 토큰 (`Bearer ...`) |
| `Cookie` / `Set-Cookie` | 요청 / 응답 | 상태 유지 (다음 절) |
| `Cache-Control` | 양쪽 | 캐시 정책 (`no-store`, `max-age=3600`) |
| `Accept` | 요청 | 클라이언트가 원하는 형식 |
| `Location` | 응답 | 리다이렉트 대상 (3xx와 함께) |

---

## 무상태를 메우는 법 — 쿠키와 토큰

HTTP는 무상태라 "이 사람이 방금 로그인한 그 사람"이라는 걸 기억하지 못한다. 그래서 로그인 후 발급한 식별자를 매 요청에 함께 보낸다.

- **쿠키**: 서버가 `Set-Cookie`로 내려주면 브라우저가 저장했다가 같은 도메인 요청마다 `Cookie` 헤더로 자동 첨부한다. `HttpOnly`를 붙이면 JS에서 접근할 수 없어 XSS에 강하다.
- **토큰(JWT 등)**: 보통 `Authorization: Bearer ...` 헤더에 직접 실어 보낸다.

이 저장 방식의 차이는 [브라우저 저장소 비교](/posts/browser-storage)에서 더 다룬다.

---

## HTTP 버전의 변천 — 1.1, 2, 3

같은 HTTP라도 "어떻게 실어 나르냐"는 계속 진화했다.

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| 전송 | TCP | TCP | **QUIC (UDP 기반)** |
| 형식 | 텍스트 | 바이너리 프레임 | 바이너리 프레임 |
| 동시 요청 | 연결당 하나씩(HOL 블로킹) | 한 연결에 **멀티플렉싱** | 멀티플렉싱 + TCP HOL 해소 |
| 헤더 | 매번 반복 | 압축(HPACK) | 압축(QPACK) |

- **HTTP/1.1**: 연결을 재사용(keep-alive)하지만, 한 연결에서 요청을 하나씩 처리해 앞 요청이 밀리면 뒤가 막히는 **HOL(Head-of-Line) 블로킹**이 있다.
- **HTTP/2**: 한 TCP 연결에서 여러 요청을 동시에(멀티플렉싱) 처리하고 헤더를 압축한다. 다만 TCP 레벨의 HOL 블로킹은 남는다.
- **HTTP/3**: 전송을 TCP 대신 **QUIC(UDP 기반)**으로 바꿔 TCP HOL 블로킹까지 해소하고, 연결 수립도 더 빠르다.

---

## 정리

- HTTP는 **요청-응답·무상태** 프로토콜이다. 서버는 먼저 말을 걸지 않고, 이전 요청을 기억하지 않는다.
- 메서드는 의도를 나타내고, **안전/멱등** 성질이 재시도 정책을 좌우한다.
- 상태 코드는 2xx(성공)·3xx(리다이렉트)·4xx(클라 잘못)·5xx(서버 잘못)으로 갈린다. 401은 인증, 403은 권한.
- 무상태를 메우려고 **쿠키·토큰**을 매 요청에 함께 보낸다.
- HTTP는 1.1(keep-alive) → 2(멀티플렉싱·헤더 압축) → 3(QUIC)로, "같은 약속을 더 빠르게 실어 나르는" 방향으로 진화했다.

DNS로 찾고, TLS로 터널을 깔고, HTTP로 주고받는다. 이 세 글로 "주소창의 한 줄"이 서버에 닿아 응답을 받기까지의 경로가 완성된다.

---

## 참고 문서

- [MDN — An overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview)
- [MDN — HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [MDN — HTTP request methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
- [Cloudflare — HTTP/3 vs HTTP/2](https://www.cloudflare.com/learning/performance/http3-vs-http2/)
