---
title: "SharedWorker로 SSE 단일 연결 유지하기 - 디버깅 함정 모음"
date: "2026-07-12"
summary: "탭 10개를 열어도 서버 연결은 1개. SharedWorker + SSE 구조의 개발 루프에서 만난 함정들 - HMR 불가, 분리된 콘솔, 상태코드 은닉, 그리고 '모르면 건드리지 않는' 3값 판정."
category: "Project"
tags:
  - Shared Worker
  - SSE
  - Debugging
  - Real-time
series: "알람 SSE 리워크"
seriesOrder: 3
---

# SharedWorker로 SSE 단일 연결 유지하기 - 디버깅 함정 모음

> 탭을 10개 열어도 서버 연결은 1개여야 한다.

## 구조

알람은 SSE(Server-Sent Events)로 받는다. 탭마다 EventSource를 열면
탭 수만큼 서버 연결이 생기므로, **SharedWorker가 연결을 독점**하고
각 탭은 MessagePort로 워커에 붙는 구조를 썼다.

```
탭1 ─┐
탭2 ─┼─ MessagePort ─ SharedWorker ─ EventSource(SSE) ─ 서버
탭3 ─┘                    │
                          ├ channelState (noti/cmd 별 lastSeq·lastRead)
                          └ allAlarmQueue (이력, 새 탭 초기화용)
```

핵심은 두 줄로 요약된다. 탭은 같은 이름으로 워커를 열고, 워커는 SSE를 한 번만 연다.

```js
// 탭(client) - 같은 이름의 SharedWorker는 브라우저가 하나만 만들어준다
const worker = new SharedWorker(new URL('../worker.ts', import.meta.url), {
  name: 'PadionAlarmWorker',            // 이 이름이 "단일 연결"의 열쇠
});
worker.port.start();
worker.port.postMessage({ type: 'REGISTER', pageType, baseURL });
```

워커 쪽은 `onconnect`에서 포트를 배열에 모아두고, 알람이 오면 포트의 `pageType`에
맞는 탭에만 `postMessage`로 뿌린다. 연결 수가 실제로 얼마나 줄어드는지와
`onconnect`·fan-out 구현은 이미 다뤘으니 링크로 대신한다.

- [실무에서 SSE + Shared Worker를 도입하며 마주친 것들](/posts/sse-shared-worker-in-practice) - 연결 수 비교 다이어그램과 pageType 필터링 코드
- [Shared Worker - 여러 탭이 공유하는 워커](/posts/shared-worker) - `onconnect`/MessagePort 기본기와 Safari iOS 미지원 이슈

이 글이 다루려는 건 그 구조가 아니라, 구조를 굴리면서 개발 루프에서 시간을 태운
지점들이다. 상태 설계에서 하나만 미리 짚어두면, 안읽음 판정도 워커가 중앙에서
계산해 뿌린다. 탭마다 따로 계산하면 탭 간 상태가 어긋나기 때문인데, 이 원칙이
함정 5로 이어진다.

> 스코프가 둘 이상이면 여기서 또 하나가 걸린다. SharedWorker는 **최초 REGISTER의
> baseURL로 SSE가 1회 고정**되므로, docker/k8s처럼 연결 대상이 다르면 워커 이름을
> 분리해야 한다. 이건 [SharedWorker는 이름이 인스턴스다](/posts/sharedworker-scope-partitioning)에서 따로 정리했다.

## 함정 1 - SharedWorker는 HMR이 안 된다

worker.ts를 고치고 저장해도 **이미 떠 있는 SharedWorker는 그대로**다.
dev 서버가 코드를 새로 빌드해도, 워커 프로세스는 모든 탭이 닫힐 때까지 산다.

> 워커 코드를 수정하면 **localhost 탭을 전부 닫고** 다시 열어야 반영된다.

이걸 모르면 "고쳤는데 왜 안 바뀌지"로 시간을 태운다. 우리는 검증 체크리스트에
"탭 전체 재시작"을 명시해두고 시작했다.

## 함정 2 - 워커의 콘솔은 페이지 콘솔에 안 나온다

워커 안에서 `console.log`를 찍어도 페이지 DevTools에는 안 보인다.
`chrome://inspect/#workers`에서 워커 전용 콘솔을 열어야 한다
([Firefox의 about:debugging 포함 자세한 설명](/posts/shared-worker)).

전용 콘솔을 여는 게 정석이지만, SSE 원본 payload처럼 페이지 동작과 나란히 놓고
봐야 하는 로그는 창을 오가는 게 더 번거롭다. 그럴 땐 포트로 릴레이해서
페이지 콘솔에 끌어온다.

```js
// worker
connectedPorts.forEach(({ port, pageType }) => {
  if (pageType === 'ALL') port.postMessage({ type: 'SSE_RAW_EVENT', raw: event.data });
});
// 페이지(hook)
if (type === 'SSE_RAW_EVENT') console.log('[Client] SSE 원본:', event.data.raw);
```

포트가 여러 개면 같은 로그가 포트 수만큼 찍히므로, ALL(헤더) 인스턴스에서만
찍어 탭당 1회로 제한하는 것도 요령이다.

## 함정 3 - EventSource는 HTTP 상태코드를 알려주지 않는다

백엔드가 401을 돌려줘도 EventSource의 `onerror`는 이유를 안 준다.
401인지, 502인지, 네트워크 단절인지 구분할 수 없다.

우리 해법은 연결 실패 에피소드당 1회, 같은 URL로 **진단용 fetch**를 쏴서
상태코드와 에러 메시지만 확보하는 것이다. 이 결과를 헤더의 연결 상태 툴팁에
"401 · Authentication required…"처럼 노출해서, 사용자는 개발자 도구 없이도
원인을 본다. 상세 구현과 SSE 인증 이슈의 전말은
[EventSource는 헤더를 못 보낸다](/posts/eventsource-no-headers)에서 다룬다.

## 함정 4 - 재연결은 내장에 맡기지 말 것

EventSource의 자동 재연결은 보통 SSE의 장점으로 소개된다.
[개념 글](/posts/server-sent-events)에서도 "별도 코드 없이 브라우저가 알아서
다시 붙는다"는 점을 polling 대비 우위로 적었고, 그건 사실이다.
다만 그 평가는 **끊김이 일시적일 때** 성립한다.

내장 auto-reconnect에는 백오프도 상한도 없다. 서버가 인증 오류로 즉시 끊는
상황처럼 실패가 지속되면, 편의 기능이 그대로 무한 재요청 루프가 된다.

`onerror`에서 항상 `close()` 하고 직접 지수 백오프 + 횟수 캡으로 재연결하면
모든 재연결이 한 경로로 통일된다. 이 무한 루프의 발견 과정(프록시가 401을
200으로 가리고 있었다)은
[프록시가 에러를 삼킬 때](/posts/proxy-swallows-errors)에서 자세히 다룬다.

## 함정 5 - 워커의 상태는 "판단 보류"가 필요하다

워커가 새로 시작되면(모든 탭 껐다 켬) 메모리 상태가 초기화돼
`lastSeq = 0`이다. 이때 "안읽음 아님(false)"으로 단정해 브로드캐스트하면
localStorage 기반으로 복원한 점등 상태를 덮어써 버린다.

```js
// 이벤트를 본 적 없는 축은 false가 아니라 undefined(보류)
const part = lastSeq > 0 ? lastSeq > lastRead : undefined;
// 수신 측: undefined면 기존 값 유지
if (unreadStatus !== undefined) setHasUnread(unreadStatus);
```

3값(true/false/undefined) 판정은 분기가 한 겹 늘어나지만, "모르면 건드리지
않는다"는 원칙이 탭 전환·새로고침 시나리오의 점멸 버그를 막아줬다.

## 배운 것

- SharedWorker + SSE는 연결 절약에 확실히 효과적이지만, **개발 루프(HMR 불가, 콘솔 분리)와 진단(상태코드 은닉)의 마찰**이 비용이다. 이런 함정은 팀 문서에 적어둬야 다음 사람이 같은 데서 시간을 안 태운다.
- 상태의 주인을 하나로(워커) 정하고, 모르는 상태는 undefined로 보류하는 설계가 다중 탭 동기화의 핵심이었다.

