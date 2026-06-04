---
title: "CORS와 동일 출처 정책 — 왜 내 요청이 막히고, 프록시는 왜 통하나"
date: "2026-06-05"
summary: "프론트엔드 개발자가 가장 자주 부딪히는 CORS 에러의 정체. 동일 출처 정책이 무엇이고 왜 있는지, origin의 정의, CORS 헤더와 프리플라이트, 그리고 개발 서버 프록시가 왜 우회책이 되는지를 정리했다."
category: "Frontend"
tags:
  - Frontend
  - CORS
  - Security
  - Browser
  - HTTP
featured: false
---

# CORS와 동일 출처 정책

프론트엔드를 하다 보면 거의 반드시 만나는 에러가 있다. "has been blocked by CORS policy". 백엔드는 멀쩡히 응답하는데 브라우저가 막는다. "프론트에 왜 서버(프록시)가 필요한가"라는 질문의 답 하나가 바로 여기 있다.

---

## 동일 출처 정책(SOP)이 먼저다

CORS를 이해하려면 그 바탕인 **동일 출처 정책(Same-Origin Policy, SOP)**부터 봐야 한다. 브라우저의 기본 보안 규칙으로, **한 출처(origin)의 스크립트는 다른 출처의 리소스에 함부로 접근하지 못한다.**

여기서 **출처(origin)**는 세 가지가 모두 같아야 같은 출처다.

```text
https://example.com:443
  └─프로토콜─┘ └─호스트─┘ └포트┘

같은 출처:  https://example.com/a  vs  https://example.com/b   (경로만 다름 → OK)
다른 출처:  https://example.com    vs  http://example.com      (프로토콜 다름)
            https://example.com    vs  https://api.example.com (호스트 다름)
            https://example.com    vs  https://example.com:8080(포트 다름)
```

왜 막을까. 만약 이 정책이 없다면, 내가 악성 사이트에 접속한 순간 그 사이트의 스크립트가 내 은행 사이트에 로그인된 쿠키로 요청을 보내 잔액을 읽어갈 수 있다. SOP는 이런 교차 출처 데이터 탈취를 기본적으로 차단한다.

---

## CORS는 "허용해주는" 장치다

문제는, 정당하게 다른 출처의 API를 불러야 할 때도 많다는 것이다. 프론트는 `https://app.example.com`인데 API는 `https://api.example.com`인 경우가 흔하다. SOP만 있으면 이게 다 막힌다.

그래서 **CORS(Cross-Origin Resource Sharing)**가 있다. CORS는 막는 규칙이 아니라, **서버가 "이 출처는 내 리소스에 접근해도 돼"라고 허용을 표시하는 방법**이다. 핵심은 응답 헤더다.

```text
요청:  Origin: https://app.example.com
응답:  Access-Control-Allow-Origin: https://app.example.com
```

브라우저는 응답의 `Access-Control-Allow-Origin`을 보고, 요청한 출처가 허용 목록에 있으면 자바스크립트가 응답을 읽게 해준다. 없으면 응답은 도착했어도 **브라우저가 JS에 넘기길 거부**한다.

여기서 중요한 사실 두 가지.

- CORS를 결정하는 건 **서버**다. 헤더는 서버가 붙인다. 프론트가 코드로 끌 수 없다.
- 차단하는 건 **브라우저**다. 그래서 같은 요청도 서버끼리(curl, 서버 코드)는 잘 되는데 브라우저에서만 막힌다.

---

## 프리플라이트 — 본 요청 전의 사전 확인

GET 같은 단순 요청은 바로 보내지만, `PUT`/`DELETE`이거나 커스텀 헤더(`Authorization` 등)나 `application/json` 본문이 붙는 요청은, 브라우저가 본 요청 전에 **OPTIONS 요청을 먼저 보내** 허용 여부를 묻는다. 이를 **프리플라이트(preflight)**라고 한다.

```text
브라우저 → 서버:  OPTIONS /api/data
                  Access-Control-Request-Method: DELETE
서버 → 브라우저:  Access-Control-Allow-Origin: https://app.example.com
                  Access-Control-Allow-Methods: GET, POST, DELETE
                  Access-Control-Allow-Headers: Authorization
(허용이 확인되면) 브라우저 → 서버:  DELETE /api/data  ← 본 요청
```

쿠키를 함께 보내려면 요청에 `credentials`를 켜고, 서버는 `Access-Control-Allow-Credentials: true`를 응답해야 한다. 이때는 `Allow-Origin`에 와일드카드(`*`)를 쓸 수 없고 구체적인 출처를 명시해야 한다.

---

## 그래서 프록시가 통한다

개발 중에 CORS가 막히면 흔히 **개발 서버 프록시**로 우회한다. 그 원리는 SOP가 "브라우저에만" 적용된다는 점에 있다.

```text
[브라우저]  →  내 앱과 같은 출처의 서버(Next.js dev / 프록시)  →  [다른 출처 API]
            (같은 출처라 SOP 안 걸림)        (서버끼리는 SOP 없음)
```

브라우저는 자기 출처의 서버로만 요청하므로 SOP에 걸리지 않고, 그 요청을 받은 서버가 대신 API를 호출해 결과만 돌려준다. 서버 대 서버 통신에는 브라우저의 SOP가 적용되지 않기 때문에 자유롭다. 이것이 "프론트에 서버가 한 겹 필요한" 이유 중 하나다. (이 블로그의 [Next.js 프록시](/posts/nextjs-proxy-basics) 글들과 이어진다.)

---

## 정리

- **동일 출처 정책(SOP)**은 브라우저 기본 보안 규칙으로, 다른 출처 리소스 접근을 기본 차단한다. 출처 = 프로토콜 + 호스트 + 포트.
- **CORS**는 막는 게 아니라, 서버가 응답 헤더로 "이 출처는 허용"이라고 표시하는 장치다. 허용은 서버가, 차단은 브라우저가 한다.
- `PUT`/`DELETE`·커스텀 헤더·JSON 본문 등은 **프리플라이트(OPTIONS)**로 먼저 허용을 확인한다. 쿠키 동반 시엔 와일드카드를 못 쓴다.
- SOP는 브라우저에만 적용되므로, **같은 출처의 서버를 거쳐 호출하는 프록시**가 우회책이 된다.

CORS 에러는 "버그"가 아니라 브라우저가 보안 규칙을 지키고 있다는 신호다. 푸는 열쇠는 거의 항상 프론트가 아니라 서버(허용 헤더) 또는 프록시 쪽에 있다.

---

## 참고 문서

- [MDN — Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [MDN — Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [web.dev — Cross-Origin Resource Sharing](https://web.dev/articles/cross-origin-resource-sharing)
