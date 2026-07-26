---
title: "EventSource는 헤더를 못 보낸다 - SSE 인증의 선택지들"
date: "2026-07-16"
summary: "백엔드 스펙엔 'JWT 헤더 필수', 브라우저 API엔 헤더 옵션이 없다. SSE 인증의 3가지 선택지와 협의 과정, 그리고 상태코드가 안 보이는 EventSource의 사각지대를 진단용 fetch로 메꾼 트릭."
category: "Project"
tags:
  - SSE
  - EventSource
  - Authentication
  - Web API
series: "알람 SSE 리워크"
seriesOrder: 7
---

# EventSource는 헤더를 못 보낸다 - SSE 인증의 선택지들

> 백엔드 스펙 문서에 이렇게 적혀 있었다: `X-AUTH: JWT 헤더 필수`. 문제는, EventSource로는 그걸 보낼 방법이 없다는 것.

## 발단 - 스펙 문서와 브라우저 API의 충돌

알람 SSE 연동 스펙 문서를 받았는데 연결 요구사항에 **JWT를 커스텀 헤더
(X-AUTH)로 보내라**고 명시돼 있었다. 프론트에서 SSE를 받는 표준 API는
EventSource인데, 이 API의 생성자는 이렇게 생겼다.

```js
new EventSource(url, { withCredentials: true });
```

끝이다. **URL과 쿠키 포함 여부, 두 가지만 조절할 수 있다.**
커스텀 헤더는 스펙상 불가능하다. `Authorization`도, `X-AUTH`도 못 보낸다.

즉 백엔드 요구사항이 클라이언트 API 스펙과 정면충돌하는 상황.
실제로 [앞선 글](/posts/proxy-swallows-errors)의
401("Authentication required for SSE connection")의
근본 원인이 이거였을 가능성이 크다 - SSE 전용 인증 필터가 헤더 토큰만 보고,
세션 쿠키는 안 보고 있었던 것.

확실히 하기 위해 Postman에서 실험했다. **유효한 세션 쿠키(JSESSIONID)를 붙여도
`/alarm/connect`만 401이 나오고, 같은 쿠키로 다른 목록 조회 API는 정상 동작했다.**
프론트 코드의 문제가 아니라 백엔드 인증 필터의 정책 문제로 확정된 것이다.
프론트에서 헤더를 넣어 해결할 방법은 원천적으로 없으므로 협의 대상이 된다.

## 선택지 - 협의 테이블에 올린 3안

SSE 인증에 쓸 수 있는 카드는 사실 정해져 있다. 각 방식의 원리와 트레이드오프는
[Server-Sent Events - HTTP 위의 단방향 스트림](/posts/server-sent-events)의
"CORS와 인증" 절에 정리해뒀으므로, 여기서는 이 프로젝트에서 무엇을 왜 골랐는지만 적는다.

| 안 | 프론트 변경 | 우리 판단 |
|---|---|---|
| ① 백엔드가 세션 쿠키 인증도 인정 | 없음 (`withCredentials: true` 그대로) | **채택** |
| ② 쿼리 파라미터로 토큰 전달 | 적음 | 토큰이 로그·히스토리에 남아 제외 |
| ③ fetch 기반 SSE로 교체 | 큼 (파싱·재연결 직접 구현) | 오버엔지니어링으로 판단해 보류 |

①을 고른 이유는 비용이 아니라 **정합성**이었다. 이 앱의 다른 API는 전부 세션 쿠키로
인증한다. SSE 엔드포인트 하나만 토큰 체계를 따로 두면 인증 방식이 두 갈래가 되고,
만료·갱신 시나리오도 두 벌로 관리해야 한다. 백엔드 입장에서도 SSE 엔드포인트의
인증 필터에 쿠키 경로를 열어주는 쪽이 변경 범위가 작았다.

③은 헤더를 자유롭게 쓸 수 있고 상태코드까지 직접 볼 수 있어 기술적으로는 가장 강하다.
다만 SSE 파싱과 재연결을 직접 구현한다는 건 사실상 EventSource를 다시 만드는 일이라,
"헤더를 보내야 한다"는 요구 하나 때문에 치를 비용은 아니라고 봤다. 이 판단은 요구가
헤더 필수로 굳어졌다면 뒤집혔을 것이다.

협의 결과 백엔드가 인증 필터를 조정해 401이 해소됐고, 프론트는 코드 수정 없이
실이벤트 수신을 시작했다.

## 곁가지 - 상태코드가 안 보이는 문제는 남는다

①로 해결해도 EventSource의 다른 약점은 남는다: **연결이 실패해도 왜
실패했는지(HTTP 상태코드)를 알려주지 않는다.** `onerror`의 인자는 사실상
빈 이벤트다. 401인지, 502인지, 네트워크 단절인지 구분이 불가하다.

그래서 진단용 트릭을 하나 넣었다 - 연결 실패 에피소드당 1회,
**같은 URL로 일반 fetch를 쏴서 상태코드만 확보**한다.

```js
const probeConnectionError = async (baseURL) => {
  const res = await fetch(`${baseURL}/alarm/connect`, {
    credentials: 'include',
    headers: { accept: 'text/event-stream' },
  });
  if (res.ok) { res.body?.cancel(); return null; }  // 일시 장애 - 스트림 즉시 폐기
  let message = res.statusText;
  try {
    const body = await res.json();
    message = body?.message || body?.error || message;
  } catch { /* JSON 아니면 statusText 유지 */ }
  return { status: res.status, message };
};
```

이 결과를 연결 상태와 함께 브로드캐스트해서, 헤더의 연결 상태 툴팁에
`401 · Authentication required for SSE connection`처럼 띄운다.
개발자 도구를 열지 않아도 화면에서 원인이 보인다.

(참고: ③ fetch 기반 SSE로 갔다면 이 진단 fetch는 필요 없다 -
본 연결이 상태코드를 이미 안다. probe는 "EventSource를 유지하는 대가"다.)

## 배운 것

1. **클라이언트 API의 제약은 협상 카드다.** "EventSource는 헤더를 못 보낸다"는 사실 하나가 백엔드 인증 설계를 바꿨다. 스펙 문서에 적혔다고 구현 가능한 게 아니다 - 브라우저 API 제약은 초기에 공유될수록 싸다.
2. **원인 격리는 조합 실험으로.** "같은 쿠키, 다른 엔드포인트" Postman 실험 하나로 프론트/백엔드 중 어느 쪽 문제인지 확정했다. 코드를 뒤지기 전에 변인을 하나만 바꾸는 실험이 빠르다.
3. 표준 API의 편의(EventSource)와 제어력(fetch 스트림)은 트레이드오프다. 편의를 택했다면 그 사각지대(상태코드)를 메꾸는 보조 장치도 같이 준비해야 한다.

