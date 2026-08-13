---
title: "알림 점등 기준을 seq에서 '수신 시각'으로 바꾼 이유"
date: "2026-07-10"
summary: "SSE payload에 일련번호가 없는 알람이 발견됐다. 서버 필드 의존을 버리고 클라이언트 수신 시각으로 전환한 과정과, 옛 localStorage 값을 '판별 없이' 청소한 키 리네임 마이그레이션까지."
category: "Project"
tags:
  - SSE
  - Shared Worker
  - Real-time
  - localStorage
series: "알람 SSE 리워크"
seriesOrder: 1
---

# 알림 점등 기준을 seq에서 '수신 시각'으로 바꾼 이유

> SSE 알람 payload를 열어봤더니, 어떤 알람에는 `notiSeq`가 아예 없었다.

## 배경 - 점등은 어떻게 동작했나

헤더의 알림 종은 "내가 마지막으로 읽은 뒤로 새 알람이 왔는가?"를 표시한다.
SSE 연결을 SharedWorker가 독점하고 각 탭이 MessagePort로 붙는 전체 구조는
[실무에서 SSE + Shared Worker를 도입하며 마주친 것들](/posts/sse-shared-worker-in-practice)에 정리해뒀고,
이 글은 그중 읽음 판정 기준 하나만 파고든다.

기존 구현은 백엔드가 주는 **일련번호(seq)** 비교였다.

```js
// SharedWorker 안
const seq = channel === 'cmd' ? alarm.notiCmdSeq : alarm.notiSeq;
if (typeof seq === 'number' && !Number.isNaN(seq)) {
  channelState[channel].lastSeq = seq;
}

// 판정
hasUnread = lastSeq > lastRead; // 받은 번호 > 읽은 번호
```

단순하고 정확하다. seq는 유일하고 단조 증가하니까. 단, seq가 항상
온다는 전제에서다.

## 문제 - seq가 없는 알람 종류가 있다

알람에는 `notiSource`라는 필드가 있다. **알람의 종류**를 뜻한다 -
사용자 요청의 처리 결과(CMD), 시스템이 만드는 알림(BACK),
k8s에서 흘러오는 이벤트(EVNT) 세 종류다.

| 알람 종류 (notiSource) | 의미 | 시퀀스 필드 |
|---|---|---|
| CMD | 사용자 요청 처리 결과 | `notiCmdSeq` |
| BACK | 시스템 알림 | `notiSeq` |
| **EVNT** | **k8s 이벤트** | **없음** |

EVNT 알람의 실제 payload는 다음과 같다.

```json
{
  "notiSource": "EVNT",
  "notiType": "kube.pod",
  "notiAct": "delete",
  "notiTargetNm": "Pod/default/my-cypress-job-b2wl8"
}
```

EVNT에는 일련번호가 아예 없다. seq가 없으니 `lastSeq` 갱신 가드에 막혀
**EVNT 알람은 종을 켜지 못한다.** 모달 재조회 신호(refreshSignal)도 seq 합산
기반이라 **자동 갱신도 누락**됐다.

이걸 명세 문제로 볼 수도 있다 - 백엔드에 "EVNT에도 번호를 붙여달라"고
요청하면 된다. 하지만 요청을 보내고 기다리기 전에 먼저 물을 게 있었다.
**점등 판정에 서버가 매긴 번호가 애초에 필요한가?**

점등이 서버 필드에 의존하는 한, 그 필드의 유무나 형식이 바뀔 때마다 점등도
같이 흔들린다. 실제로 백엔드가 언젠가 seq를 **UUID로 바꿀 가능성**도 있었다 -
UUID는 대소 비교가 안 되므로 그때는 점등이 소리 없이 죽는다. 에러가 나는 것도
아니라서 발견도 늦어진다. 필드 하나를 추가받아도 의존 자체는 그대로 남는 것이다.

## 후보 검토

**1안. 서버 시각(notiWtDtti)으로 비교** - 목록 API에는 있지만 SSE payload에는 없었다.
백엔드에 "SSE에도 실어달라"는 요청이 선결이라 blocker가 생긴다.

**2안. timestamp + seq 보조 비교(복합키)** - 같은 초 동률까지 정확하지만,
저장 값이 2배가 되고 UUID가 오면 보조 로직을 또 걷어내야 한다. 목적(탈 seq)과 어긋남.

**3안. 프론트가 수신 시각을 직접 찍는다** - 종에 필요한 건 "발생 시각"이 아니라
**"받았다는 사실과 그 순서"** 뿐이다. 그건 클라이언트가 스스로 만들 수 있다.

## 결정 - worker가 Date.now() 도장을 찍는다

```js
// worker: SSE 수신 순간
const receivedAt = Date.now();
alarm.receivedAt = receivedAt;              // main 스레드에도 같은 값 전달
channelState[channel].lastSeq = receivedAt; // 가드 제거 - 모든 알람이 점등 반영
```

```js
// main(hook): localStorage latest 저장도 워커가 찍은 같은 값으로
const isCmdChannel = newAlarm.notiSource === NOTI_SOURCE_CMD;
const latestKey = isCmdChannel ? storageKeyLatestCmd : storageKeyLatest;
const receivedAt = newAlarm.receivedAt ?? Date.now(); // 워커 값 우선

const currentLatestNum = parseInt(localStorage.getItem(latestKey) ?? '0', 10);
if (receivedAt > currentLatestNum) {
  localStorage.setItem(latestKey, receivedAt.toString());
}
```

새로고침하면 워커 메모리가 초기화되므로, 초기 점등 복원도 같은 값으로 한다.
비교식은 seq 시절과 **완전히 동일** - 값의 의미만 바뀌었다.

```js
// 새로고침/새 탭 접속 시 localStorage 기준 복원 (Header에서만)
const readNum = (key) => parseInt(localStorage.getItem(key) ?? '0', 10);

// 종 = noti축 또는 종의 cmd축 중 하나라도 미읽음이면 점등
setHasUnread(
  readNum(storageKeyLatest) > readNum(storageKeyLastRead) ||
    readNum(storageKeyLatestCmd) > readNum(storageKeyLastReadCmdAtNoti),
);
setHasCmdUnread(readNum(storageKeyLatestCmd) > readNum(storageKeyLastReadCmd));
```

모달 재조회 신호(refreshSignal)도 같은 값으로 갈아탔다. seq 합산 시절엔
seq 없는 알람이 신호를 못 바꿔 재조회가 누락됐는데, 수신 시각은 모든 알람에서
바뀐다.

```js
// Header - 전: payload seq 합산 / 후: 가장 최근 수신 시각
const notiModalRefreshSignal = history[0]?.receivedAt ?? 0;
```

핵심 포인트는 세 가지다.

- **worker가 한 번만 찍고 양쪽이 공유한다.** worker와 main이 각자 `Date.now()`를 찍으면 같은 알람인데 몇 ms 어긋나 비교가 미묘하게 틀어진다.
- 비교·읽음·저장·탭 동기화 machinery는 **구조 그대로** 두고 값의 출처만 교체했다.
- payload에 뭐가 있든(없든) 무관하다. **EVNT도 점등**되고, UUID 전환도 무관해지고, 백엔드 대기도 사라졌다.

## 곁가지 - 옛 값은 어떻게 하나: 값 판별 대신 키 리네임

값의 의미가 seq에서 timestamp로 바뀌면 **기존 사용자의 localStorage에 남은 옛 값**이
문제가 된다. 옛 seq(수백~수천)와 새 timestamp(1.7조 대)를 같은 키에서 비교하면
판정이 엉망이 된다. 새 latest는 timestamp인데 lastRead는 옛 seq라 항상 미읽음이 되는 식이다.

처음엔 값을 보고 판별하는 마이그레이션을 짰다.

```js
// 1차 시도 - 값이 seq인지 timestamp인지 임계값으로 판별
const EPOCH_MIN = 1e12; // 2001-09-09 이후의 epoch ms - seq는 이보다 클 수 없다
if (stored < EPOCH_MIN) localStorage.removeItem(key); // 옛 seq 값 → 청소
```

동작은 한다. 하지만 `EPOCH_MIN`이라는 매직 넘버가 영구히 코드에 남고,
"이 값이 옛 포맷인가?"라는 질문 자체가 앞으로도 계속 따라다닌다.

그러다 방향을 바꿨다. **키 이름을 바꾸면 판별이 필요 없다.**

```
padion_last_read_noti_seq  →  padion_last_read_noti_ts
padion_latest_noti_seq     →  padion_latest_noti_ts
...
```

새 키는 **빈 상태에서 시작**하므로 옛 값과 충돌할 일이 원리적으로 없다.
판별 로직은 통째로 삭제하고, 옛 `_seq` 키는 조건 없이 `removeItem`만 한다.

```js
// 마이그레이션 전체 - 판별 없음, 무조건 삭제 (멱등)
OLD_SEQ_KEYS.forEach((key) => localStorage.removeItem(key));
```

이 코드는 매 로드마다 실행되지만 옛 값이 있을 때만 실질 동작하는 멱등 코드라
"1회 실행" 같은 보장 장치도 필요 없다.

접미사 선택도 소소한 결정이 있었다. `_at`을 쓰려 했는데 기존 키에
`_cmd_at_noti_`(종 아이콘의 cmd축 마커)라는 조각이 이미 있어 겹치면 헷갈린다.
그래서 `_ts`로 확정했다.

일반화하면 이렇다. **저장 값의 포맷이 바뀔 때는 값을 판별하지 말고
네임스페이스(키)를 바꿔라.** 판별 로직은 옛 포맷 지식을 코드에 박제하지만,
키 리네임은 옛 포맷을 "지울 대상"으로만 남긴다.

## 트레이드오프는 없었나

- **시계 의존**: 같은 기기 안에서 "받은 시각 vs 읽은 시각"을 비교하므로 절대 시각이 정확할 필요 없이 일관되기만 하면 된다. SharedWorker 하나가 찍으니 항상 일관된다.
- **같은 ms 동률**: 이론상 가능하지만 다음 알람이 오면 즉시 복구(self-healing)되는 일시적 누락이라 수용했다.

## 배운 것

1. **"점등(비교)"과 "표시(재조회)"는 별개 경로다.** 모달 목록은 어차피 서버 목록 API를 다시 조회해 그리고, SSE payload는 트리거일 뿐이다. 그래서 payload가 부실해도 표시는 안 깨지고, 깨지는 건 트리거·점등이었다. 문제를 정확히 그 층에서 풀어야 했다.
2. **서버 필드 의존을 클라이언트 자체 기준으로 바꾸면 blocker가 사라진다.** "백엔드에 필드 추가 요청 → 대기"가 예정이었는데, 요구사항을 다시 보니 ("뭐라도 오면 켜라") 서버 데이터가 필요 없는 문제였다.
3. **포맷 전환의 마이그레이션은 값 판별보다 키 리네임이 싸다.** 판별 임계값은 영구 부채가 되지만, 새 네임스페이스는 충돌 자체를 없앤다.

