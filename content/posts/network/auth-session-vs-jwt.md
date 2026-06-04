---
title: "인증과 인가 — 세션-쿠키 방식과 JWT 토큰 방식"
date: "2026-06-05"
summary: "HTTP는 무상태인데 어떻게 로그인 상태를 유지하는가. 인증과 인가의 차이, 서버가 상태를 갖는 세션-쿠키 방식과 토큰에 정보를 담는 JWT 방식의 트레이드오프, 그리고 토큰을 어디에 둘지를 정리했다."
category: "Network"
tags:
  - Network
  - Authentication
  - JWT
  - Cookie
  - Security
featured: false
---

# 인증과 인가

[HTTP 기초](/posts/http-basics)에서 HTTP는 무상태(stateless)라 이전 요청을 기억하지 못한다고 했다. 그래서 로그인 후 "이 사람이 방금 로그인한 그 사람"임을 증명할 식별자를 매 요청에 함께 보낸다. 그 식별자를 무엇으로, 어디에 두느냐가 인증 설계의 핵심이다.

먼저 자주 섞이는 두 단어부터 구분한다.

- **인증(Authentication)**: "너 누구야?" — 신원 확인. 로그인.
- **인가(Authorization)**: "너 이거 해도 돼?" — 권한 확인. 접근 제어.

로그인은 인증이고, "관리자만 이 페이지 접근" 같은 건 인가다. [HTTP 상태 코드](/posts/http-basics)의 401(인증 안 됨)과 403(권한 없음)이 정확히 이 둘에 대응한다.

---

## 방식 1 — 세션-쿠키 (서버가 상태를 갖는다)

전통적인 방식이다. 서버가 로그인한 사용자의 상태를 직접 들고 있는다.

```text
1. 로그인 성공 → 서버가 세션 생성, 세션ID를 메모리/DB에 저장
2. 응답: Set-Cookie: sessionId=abc123; HttpOnly
3. 이후 요청마다 브라우저가 자동으로 Cookie: sessionId=abc123 전송
4. 서버는 sessionId로 저장소를 조회해 "누구인지" 확인
```

- **상태가 서버에 있다.** 세션ID는 그냥 사물함 열쇠 번호일 뿐, 내용은 서버가 가진다.
- 로그아웃이나 강제 만료가 쉽다. 서버에서 세션을 지우면 끝.
- 단점: 서버가 세션을 저장해야 하므로, 서버가 여러 대면 세션 저장소를 공유(예: Redis)해야 한다. 확장 시 부담.

---

## 방식 2 — JWT 토큰 (토큰 자체에 정보가 있다)

JWT(JSON Web Token)는 사용자 정보를 **토큰 안에 담아** 서버가 저장하지 않게 한다.

```text
JWT 구조:  헤더.페이로드.서명   (각각 base64url 인코딩)
  - 헤더:   알고리즘 정보
  - 페이로드: { "userId": 1, "role": "admin", "exp": ... }
  - 서명:   서버의 비밀키로 (헤더+페이로드)를 서명한 값
```

- 로그인 시 서버가 서명한 JWT를 발급한다. 이후 요청에 토큰을 함께 보낸다.
- 서버는 **서명만 검증**하면 된다. 저장소 조회 없이 토큰 안의 정보를 신뢰한다(서명이 맞으면 위조가 아님).
- 장점: 서버가 상태를 안 가져 확장에 유리(stateless).
- 단점: 발급된 토큰을 **중간에 무효화하기 어렵다.** 만료 전까지 유효하므로, 강제 로그아웃엔 별도 블랙리스트가 필요하다.

> 주의: JWT의 페이로드는 암호화가 아니라 **base64url 인코딩**이라 누구나 디코드해 읽을 수 있다. ([base64는 암호화가 아니다](/posts/browser-secret-decoding)) 비밀번호 같은 민감 정보를 넣으면 안 된다. 서명은 "위조 방지"일 뿐 "내용 숨김"이 아니다.

---

## 무엇을 언제 — 비교

| | 세션-쿠키 | JWT 토큰 |
|---|---|---|
| 상태 위치 | 서버 | 토큰(클라이언트) |
| 서버 확장 | 세션 저장소 공유 필요 | 유리(stateless) |
| 무효화 | 쉬움(서버에서 삭제) | 어려움(만료 전까지 유효) |
| 노출 위험 | 세션ID만 유출 | 토큰 내용까지 노출(인코딩일 뿐) |

정답은 없고 트레이드오프다. 전통적 웹 앱은 세션-쿠키가 단순하고 안전하며, 여러 서비스·마이크로서비스로 확장되는 경우 JWT가 유리한 면이 있다. 실무에선 짧은 수명의 액세스 토큰 + 갱신용 리프레시 토큰을 섞는 식으로 단점을 보완한다.

---

## 토큰을 어디에 두나 — 저장 위치의 보안

발급받은 세션ID나 토큰을 클라이언트 어디에 둘지가 보안을 가른다. ([브라우저 저장소 비교](/posts/browser-storage)와 이어진다.)

- **HttpOnly 쿠키**: JS로 접근 불가라 XSS로 탈취하기 어렵다. 대신 CSRF 방어(`SameSite`)가 필요하다. 일반적으로 권장된다.
- **localStorage**: JS로 쉽게 읽고 쓸 수 있어 편하지만, **XSS 취약점 하나면 토큰이 통째로 털린다.** 권장되지 않는다.

즉 "어디에 저장하느냐"는 XSS와 CSRF 중 무엇을 더 막을지의 문제이고, 대체로 `HttpOnly` 쿠키 + `SameSite`가 안전한 출발점이다.

---

## 정리

- **인증(누구냐)**과 **인가(권한 있냐)**는 다르다. 401과 403에 각각 대응한다.
- **세션-쿠키**는 서버가 상태를 갖는다. 무효화가 쉽지만 확장 시 세션 공유가 필요하다.
- **JWT**는 토큰 자체에 정보를 담아 서버를 stateless하게 한다. 확장에 유리하지만 무효화가 어렵고, 페이로드는 인코딩일 뿐이라 민감 정보를 넣으면 안 된다.
- 토큰 저장은 **HttpOnly 쿠키**가 기본적으로 안전하다. localStorage는 XSS에 취약하다.

인증은 결국 "무상태인 HTTP 위에서 어떻게 상태를 안전하게 이어붙일 것인가"의 문제다.

---

## 참고 문서

- [MDN — Authentication](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication)
- [MDN — HTTP authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication)
- [jwt.io — Introduction to JSON Web Tokens](https://jwt.io/introduction)
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
