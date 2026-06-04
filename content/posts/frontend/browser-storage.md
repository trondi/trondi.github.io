---
title: "브라우저 저장소 비교 — localStorage, sessionStorage, Cookie, IndexedDB"
date: "2026-06-05"
summary: "클라이언트에 데이터를 저장하는 네 가지 방법의 용량·수명·서버 전송·동기 여부를 비교하고, 무엇을 언제 써야 하는지와 민감 정보 저장의 위험을 정리했다."
category: "Frontend"
tags:
  - Browser
  - Web API
  - Storage
  - Cookie
  - Security
featured: false
---

# 브라우저 저장소 비교

[JavaScript는 어디서 실행되는가](/posts/js-engine-vs-runtime)에서 `localStorage`, `IndexedDB` 같은 것들이 엔진이 아니라 **브라우저가 제공하는 Web API**라고 정리했다. 이 글은 그 저장소들을 실제로 비교한다. 클라이언트에 데이터를 두는 방법은 하나가 아니고, 용량·수명·서버 전송 여부·동기 여부가 다 달라서 용도에 맞게 골라야 한다.

---

## 한눈에 비교

| | localStorage | sessionStorage | Cookie | IndexedDB |
|---|---|---|---|---|
| 용량 | 약 5~10MB | 약 5MB | 약 4KB | 대용량(수백 MB+) |
| 수명 | 영구(지울 때까지) | 탭 닫으면 삭제 | 만료일까지 | 영구 |
| 서버 전송 | 안 됨 | 안 됨 | **매 요청 자동 첨부** | 안 됨 |
| 접근 방식 | 동기 | 동기 | 동기(문자열) | **비동기** |
| 저장 형태 | 문자열만 | 문자열만 | 문자열만 | 객체·Blob 등 구조화 |
| 범위 | origin | origin + 탭 | 도메인/경로 | origin |

---

## localStorage / sessionStorage (Web Storage)

가장 간단한 키-값 저장소다. API가 거의 동일하고 수명만 다르다.

```js
localStorage.setItem("theme", "dark");
localStorage.getItem("theme");   // "dark"
localStorage.removeItem("theme");
```

특징과 주의점은 이렇다.

- **문자열만** 저장된다. 객체는 `JSON.stringify`로 직렬화해서 넣고 꺼낼 때 `JSON.parse` 한다.
- **동기 API**다. 큰 데이터를 자주 읽고 쓰면 메인 스레드를 막을 수 있다.
- `localStorage`는 명시적으로 지울 때까지 남고, `sessionStorage`는 **그 탭을 닫으면 사라진다**. (탭마다 별개)
- SSR 환경에서는 서버에 `localStorage`가 없으므로, 렌더 중이 아니라 `useEffect`나 이벤트 핸들러에서 접근해야 한다. (관련: [js-engine-vs-runtime](/posts/js-engine-vs-runtime)의 CSR vs SSR 절)

용도: 테마, 최근 본 항목, 접힘 상태 같은 **가벼운 UI 상태**.

---

## Cookie

쿠키는 다른 저장소와 결정적으로 다른 점이 있다. **같은 도메인 요청마다 자동으로 서버에 함께 전송된다.**

```text
서버 → 브라우저:  Set-Cookie: session=xyz; HttpOnly; Secure; SameSite=Lax
브라우저 → 서버:  (이후 모든 요청에) Cookie: session=xyz
```

그래서 쿠키는 "저장"보다 "서버와의 상태 공유" 도구에 가깝다. 주요 속성은 보안과 직결된다.

- **HttpOnly**: JS(`document.cookie`)에서 접근 불가. XSS로 토큰을 훔치기 어렵게 만든다.
- **Secure**: HTTPS에서만 전송.
- **SameSite**: 다른 사이트발 요청에 쿠키를 붙일지 제어. CSRF 방어.

용도: **인증 세션/토큰**. 특히 `HttpOnly` 쿠키는 JS로 읽을 수 없어 인증 정보를 두기에 가장 안전한 축이다. 단, 용량이 4KB로 작고 매 요청에 실리므로 큰 데이터엔 부적합하다. ([HTTP 기초](/posts/http-basics)의 무상태·쿠키 절과 이어진다.)

---

## IndexedDB

브라우저에 내장된 **비동기 트랜잭션 데이터베이스**다. 위 셋과 체급이 다르다.

- **대용량**: 수백 MB 이상도 가능하다.
- **비동기**: 메인 스레드를 막지 않는다.
- **구조화된 데이터**: 문자열뿐 아니라 객체, 배열, `Blob`, `ArrayBuffer`까지 그대로 저장한다.
- 인덱스와 트랜잭션을 지원한다.

원시 API는 이벤트 기반이라 다소 번거로워서, 실무에서는 `idb` 같은 얇은 래퍼를 많이 쓴다.

용도: **오프라인 데이터, 캐시, 큰 바이너리(이미지·파일), 대량 목록**. PWA의 오프라인 저장소가 대표적이다.

---

## 무엇을 언제 쓰나

| 상황 | 추천 |
|---|---|
| 인증 세션/토큰 | **HttpOnly 쿠키** (XSS에 강함) |
| 가벼운 UI 상태(테마 등) | localStorage |
| 탭 한정 임시 상태 | sessionStorage |
| 큰 데이터·오프라인·바이너리 | IndexedDB |

---

## 보안 — 클라이언트 저장은 "숨김"이 아니다

[browser-secret-decoding](/posts/browser-secret-decoding)에서 강조했듯, **클라이언트에 둔 데이터는 보호되지 않는다.**

- `localStorage`/`sessionStorage`/일반 쿠키는 JS로 다 읽힌다. XSS 취약점이 하나라도 있으면 거기 든 토큰은 탈취된다. 그래서 인증 토큰은 `HttpOnly` 쿠키가 권장된다.
- 어느 저장소든 사용자가 DevTools로 열어 보고 수정할 수 있다. **민감 정보(비밀번호, 키, 타인의 개인정보)를 클라이언트에 저장하면 안 된다.**
- 저장소는 보안 경계가 아니라 편의 도구다. 신뢰가 필요한 검증은 서버에서 한다.

---

## 정리

- 클라이언트 저장소는 **용량·수명·서버 전송·동기 여부**가 다르다. 그 차이로 용도가 갈린다.
- `localStorage`/`sessionStorage`는 문자열 전용 동기 키-값 저장소다. 가벼운 UI 상태에 적합하고, 수명만 다르다.
- **쿠키는 매 요청에 자동 전송**되어 서버와 상태를 공유한다. `HttpOnly`/`Secure`/`SameSite`로 인증을 비교적 안전하게 담는다.
- **IndexedDB**는 비동기 대용량 DB로, 구조화된 데이터와 바이너리, 오프라인에 쓴다.
- 어느 것도 보안 저장소가 아니다. 민감 정보는 클라이언트에 두지 않는다.

---

## 참고 문서

- [MDN — Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [MDN — Using cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [MDN — IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN — Client-side storage](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Client-side_web_APIs/Client-side_storage)
