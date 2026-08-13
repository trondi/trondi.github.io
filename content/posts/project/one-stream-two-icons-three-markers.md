---
title: "한 스트림, 두 아이콘 - 알림 채널 분리와 읽음 마커가 3개인 이유"
date: "2026-07-17"
summary: "아이콘은 2개인데 읽음 마커는 왜 3개일까. '점등은 겹치고 읽음은 독립'이라는 기획 규칙이 만든 마커 설계와, 그 비대칭이 낳은 유령 점등까지."
category: "Project"
tags:
  - Shared Worker
  - State Management
  - Real-time
  - UX
series: "알람 SSE 리워크"
seriesOrder: 8
---

# 한 스트림, 두 아이콘 - 알림 채널 분리와 읽음 마커가 3개인 이유

> 아이콘은 2개인데 읽음 마커는 왜 3개일까. 2개로 하면 서로의 점등을 꺼버리기 때문이다.

## 요구사항 - 하나의 스트림, 두 개의 아이콘

헤더에 알림 아이콘이 두 개 있다.

- **Noti 종** - 모든 알림 (시스템 이벤트 + 사용자 요청 처리 결과)
- **User Request 아이콘** - 사용자 요청(cmd) 알림만

그런데 SSE 연결은 스코프당 1개이고, 스트림 안에 두 종류의 이벤트가 섞여 온다.
구분 필드는 `notiSource` - `"CMD"`면 사용자 요청, 그 외(BACK/EVNT)는 일반 알림.

```js
const channelOf = (alarm) =>
  alarm.notiSource === 'CMD' ? CHANNEL.CMD : CHANNEL.NOTI;
```

여기까지는 평범하다. 문제는 **점등과 읽음 규칙**을 정의하면서 시작된다.

## 기획 규칙 - 점등은 겹치고, 읽음은 독립

확정된 기획은 다음 세 가지다.

1. **User Request 아이콘** = cmd 알림에만 점등.
2. **Noti 종** = 전체 알림(cmd 포함)에 점등. - cmd가 와도 종이 켜진다.
3. **읽음은 각자** - 각 아이콘의 모달을 열어야 "자기" 점등만 꺼진다. 종 모달을 열어도 User Request 아이콘은 켜져 있어야 하고, 반대도 마찬가지.

처음엔 "각 채널이 자기 아이콘만 점등"(완전 분리)으로 갔다가, "사용자 요청
결과도 알림은 알림이다"라는 판단으로 종이 전체를 포괄하는 쪽으로 확정됐다.
이 규칙 2+3의 조합에서 마커 설계가 복잡해진다.

## 왜 마커 2개로는 안 되는가

순진한 설계: 채널별로 `lastRead` 하나씩.

```
noti.lastRead  - 종이 마지막으로 읽은 noti 시점
cmd.lastRead   - 마지막으로 읽은 cmd 시점 (둘이 공유?)
```

종은 cmd에도 점등하므로 종의 판정은 `noti축 미읽음 OR cmd축 미읽음`이다.
그럼 종의 cmd축 판정에 어떤 마커를 쓸까? `cmd.lastRead`를 같이 쓴다고 가정해 보자.

- **종 모달을 열었을 때** cmd.lastRead를 갱신하면 → User Request 아이콘도 같이 꺼진다. 규칙 3 위반.
- 갱신하지 않으면 → 종 모달을 열었는데(cmd 알림까지 다 봤는데) cmd축이 미읽음으로 남아 **종이 다시 켜진다**. 규칙 2가 자기 발목을 잡는다.

어느 쪽이든 모순. **"cmd를 어디까지 읽었나"라는 질문이 사실 두 개**이기
때문이다 - User Request 아이콘 기준의 답과, 종 기준의 답이 다르다.

## 해법 - 종에게 자기만의 cmd 마커를 준다

```js
const channelState = {
  noti: { lastSeq: 0, lastRead: 0 },   // 종의 noti축
  cmd:  { lastSeq: 0, lastRead: 0 },   // User Request 아이콘의 기준
};
let bellCmdLastRead = 0;               // 종의 cmd축 - cmd.lastRead와 독립
```

판정은 이렇게 한다.

```js
const bellNotiPart = noti.lastSeq > noti.lastRead;
const bellCmdPart  = cmd.lastSeq  > bellCmdLastRead;   // 종 자신의 마커로
const hasUnread    = bellNotiPart || bellCmdPart;      // 종

const hasCmdUnread = cmd.lastSeq > cmd.lastRead;       // User Request 아이콘
```

읽음 처리는 이렇게 한다.

```js
// 종 모달을 열면 - 종의 두 마커만 갱신, cmd.lastRead는 건드리지 않음
noti.lastRead   = noti.lastSeq;
bellCmdLastRead = cmd.lastSeq;   // User Request 아이콘은 그대로 켜져 있음

// User Request 모달을 열면 - cmd.lastRead만 갱신, 종 마커는 그대로
cmd.lastRead = cmd.lastSeq;
```

말보다 직접 눌러보는 게 빠르다 - 알람을 수신시키고 모달을 열어보면
마커 3개가 각각 언제 움직이는지 보인다.

```diagram
alarm-read-markers
```

이렇게 하면 규칙 세 개가 전부 성립한다. 마커 수를 세어보면 읽음 마커 3개(noti.lastRead, cmd.lastRead, bellCmdLastRead)에 수신 마커 2개(채널별 latest, 새로고침 복원용)를 더해 **localStorage 키 5개**가 된다.

```
padion_last_read_noti_ts         종의 noti축 읽음
padion_last_read_cmd_at_noti_ts  종의 cmd축 읽음 (독립 마커)
padion_last_read_cmd_ts          User Request 아이콘 읽음
padion_latest_noti_ts            noti 최신 수신 (복원용)
padion_latest_cmd_ts             cmd 최신 수신 (복원용)
```

### 곁가지 - 워커는 localStorage에 손이 안 닿는다

마커의 원본은 SharedWorker 메모리인데, 새로고침을 견디려면 localStorage에
영속해야 한다. 문제는 **워커에서 localStorage 접근이 불가**하다는 것이다.
그래서 저장/복원이 [메시지 왕복](/posts/sse-shared-worker-in-practice)이 되는데,
마커가 3개로 늘면서 그 왕복 프로토콜도 같이 복잡해졌다.

```js
// [저장] 워커 → 모든 탭: "이 값을 저장해줘"
connectedPorts.forEach(({ port }) => {
  port.postMessage({
    type: SAVE_LAST_READ,
    lastReadNotiSeq: noti.lastRead,
    lastReadCmdSeq: bellCmdLastRead,   // 종 읽음은 마커 2개를 함께
    channel,
  });
});

// [저장] 탭(hook): 채널에 맞는 키에 기록
if (event.data.channel === CHANNEL.CMD) {
  localStorage.setItem(storageKeyLastReadCmd, lastReadNotiSeq.toString());
} else {
  localStorage.setItem(storageKeyLastRead, lastReadNotiSeq.toString());
  localStorage.setItem(storageKeyLastReadCmdAtNoti, event.data.lastReadCmdSeq.toString());
}
```

```js
// [복원] 워커가 새 탭 등록 시 요청 → 탭이 저장값 회신 → 워커 상태 복원
port.postMessage({ type: REQUEST_LAST_READ });                    // 워커 → 탭

port.postMessage({                                                // 탭 → 워커
  type: INIT_LAST_READ,
  lastReadNotiSeq: readNum(storageKeyLastRead),
  lastReadCmdSeq: readNum(storageKeyLastReadCmd),
  lastReadCmdAtNotiSeq: readNum(storageKeyLastReadCmdAtNoti),     // 3개 전부
});
```

마커가 3개라는 사실이 이 왕복 프로토콜의 payload에도 그대로 드러난다.

일반화하면 이렇다. **N개의 뷰(아이콘)가 M개의 채널을 겹쳐 구독하면, 읽음 마커는
채널 수가 아니라 "뷰 × 구독 채널" 조합만큼** 필요하다. 우리는 종이 2채널,
User Request가 1채널을 구독하므로 2+1=3개.

## 이 설계의 부작용 - 마커 비대칭이 만든 "유령 점등"

이 구조에는 비대칭이 하나 숨어 있다. `bellCmdLastRead`는 **종 모달을 열어야만**
갱신된다. 어제 User Request 아이콘만 확인하고 퇴근했다고 하자.

- cmd.lastRead는 갱신됨 → User Request 아이콘 꺼짐
- bellCmdLastRead는 그대로 → **종 기준으로는 cmd축이 미읽음** → 다음날 새로고침 시 localStorage 복원으로 종이 점등

그런데 알림 모달의 기본 조회는 "오늘 날짜"라 어제 알람은 목록에 안 보인다.
결과: **점등은 됐는데 열어보면 빈 목록** - 유령처럼 보이는 오점등.
설계상으로는 "정당한 이월"인데 사용자 경험상으로는 버그처럼 느껴진다.

해결 방향은 정책 결정의 영역이다. 초기 복원 시 마커가 오늘 날짜가 아니면
소등하는 "당일 기준 소등"([마커를 timestamp로 바꾼 덕](/posts/alarm-unread-receivedat)에
날짜 판정이 가능해졌다 - seq 시절엔 값에서 날짜를 알 수 없어 불가능했던 정책),
또는 점등 상태로 모달을 열면 조회 범위를 lastRead 이후로 넓혀 점등의 근거를
보여주는 방법. 어느 쪽이든 "점등과 목록이 같은 이야기를 하게" 만드는 게 핵심이다.

## 배운 것

1. **읽음 상태는 채널의 속성이 아니라 (뷰, 채널) 쌍의 속성이다.** 아이콘이 채널을 겹쳐 구독하는 순간, 채널당 마커 하나라는 직관이 깨진다.
2. 마커를 추가할 때는 **갱신 경로의 비대칭**이 낳을 시나리오(우리의 익일 오점등)까지 따라가 봐야 한다. 판정 로직은 맞는데 UX가 틀릴 수 있다.
3. 상태 필드 하나(`bellCmdLastRead`)에 "왜 이게 따로 있는가"의 주석을 남기는 것 - 이 설계는 코드만 봐서는 절대 자명하지 않다.

