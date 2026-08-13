---
title: "알림이 왔다 ≠ 화면에 그린다 - SSE payload의 두 가지 쓰임"
date: "2026-07-14"
summary: "payload는 알림 모달에겐 순수 트리거, Host/Container 테이블에겐 부분 업데이트의 조준 정보다. 화면에 그리는 데이터는 언제나 API pull - refreshSignal의 생산→전달→소비 설계까지."
category: "Project"
tags:
  - SSE
  - React Query
  - Architecture
  - Real-time
series: "알람 SSE 리워크"
seriesOrder: 5
---

# 알림이 왔다 ≠ 화면에 그린다 - SSE payload의 두 가지 쓰임

> "SSE에 notiSeq도 없는데 목록엔 왜 멀쩡히 나오지?"

## 의문에서 시작

SSE로 오는 알람 payload를 열어보니 없는 필드가 있는 종류도 있었다. 어떤 알람은 일련번호도, 발생 시각도 없었다. 그런데 알림 모달 목록에는 모든 알람이 시각·심각도·상태까지 빠짐없이 표시되고 있었다. 어떻게 가능했을까?

답부터 말하면, **모달은 SSE payload를 그리지 않는다.**

다만 이 답은 화면마다 다르다. 이 시스템에서 SSE 알람의 소비자는 둘이고, payload의 쓰임도 둘이다.

```
SSE 알람 도착
   │
   ├─→ 알림 모달 (Noti / User Request 목록)
   │     payload = 순수 트리거 - "새 게 왔다"만 쓰고, 목록은 API로 재조회
   │
   └─→ Host / Container 테이블
         payload = 조준 정보 - 어떤 행을 어떻게 갱신할지 결정
```

공통점은 하나다 - **화면에 그려지는 데이터는 어느 쪽도 payload가 아니다.** 둘 다 API에서 다시 가져온다(pull). 다른 건 payload를 얼마나 읽느냐다.

## 모달 - push는 초인종, 데이터는 pull

```
SSE 알람 도착
   │
   ├─→ (점등)   worker가 수신 사실만 기록 → 종 아이콘 on
   │
   └─→ (신호)   refreshSignal 값 변경
                     │
                     ▼
              모달이 열려 있으면 목록 API 재조회 (throttle)
                     │
                     ▼
              서버가 정렬·조인·코드명까지 채운 완전한 행을 반환 → 렌더링
```

모달 쪽에서 payload는 "새 게 왔다"는 **초인종**이다. 필드 내용은 (채널 구분 정도를 빼면) 읽지 않는다. 그래서 payload에 필드가 빠져 있어도 표시는 안 깨진다 - 깨질 수 있는 건 초인종(트리거·점등) 쪽뿐이다.

이 구조의 장점은 세 가지다.

1. **payload 스키마에 관대하다.** 백엔드가 push payload를 확장/축소해도 렌더링 코드는 영향받지 않는다. 조인 필드(코드 표시명 등)를 push에 실을 필요도 없다.
2. **정렬·페이징·필터가 공짜다.** 서버 목록 API가 이미 하고 있는 걸 그대로 쓴다. push된 행을 클라이언트에서 목록에 "끼워 넣기" 하려면 정렬 위치, 페이지 경계, 필터 일치 여부를 전부 클라이언트가 다시 계산해야 한다.
3. **일관성 걱정이 없다.** 화면은 항상 서버 상태의 스냅샷이다. push 유실이 있어도 다음 재조회가 복구한다.

비용은 재조회 트래픽인데, throttle로 창당 1회로 캡을 씌우면 감당된다.

## 테이블 - payload로 부분 업데이트를 조준한다

Host/Container 테이블은 다르다. 알람이 올 때마다 전체 목록을 다시 부르면 API 호출이 폭증하므로, **payload의 필드를 읽어 갱신 범위를 좁힌다.** 읽는 필드는 두 종류다.

- `notiType` / `notiHostId` / `notiTargetId`로 **어느 행**이 영향을 받았는지 가린다. 현재 화면에 보이는 행과 매칭해, 관련 없는 알람은 버린다.
- `notiAct`로 **어떻게** 갱신할지 정한다. start/stop처럼 기존 행이 바뀌는 액션이면 행 단위 갱신(ROW_UPDATE), create/destroy처럼 행이 생기거나 사라지는 액션이면 전체 재조회(FULL_REFRESH)다.

전략 분기와 캐시 패치의 구현은
[SSE 알람으로 테이블을 실시간 업데이트하는 법](/posts/sse-alarm-table-update)에 자세히 적어뒀다.
여기서 짚고 싶은 건 구현이 아니라 **payload를 대하는 태도**다.

여기서도 원칙은 지켜진다. **행에 그려지는 데이터 자체는 payload가 아니다.** ROW_UPDATE도 영향받은 행을 `getHostList`/`getCntrList` API로 다시 조회한 뒤 React Query 캐시를 갈아끼운다. payload가 주는 건 "몇 번 행을 다시 그려라"라는 **좌표와 액션**이지, 행의 내용이 아니다.

이 구분이 payload 스펙 협상의 기준이 된다. 표시용 필드(코드명, 조인 데이터)는 push에 실을 필요가 없지만, **타겟 식별자(hostId, targetId)와 액션(notiAct)은 반드시 실려야 한다.** 이게 빠지면 테이블은 조준을 못 해 전체 재조회로 후퇴할 수밖에 없다.

## refreshSignal - boolean이 아니라 번호표

모달 쪽 트리거로 돌아오자. 신호를 `hasNewAlarm: boolean`으로 만들면 함정이 있다. true→true는 변경이 아니라서 이펙트가 안 돈다. 그래서 신호는 **단조 증가하는 값(번호표)** 으로 만든다. 생산→전달→소비 전체 흐름을 코드로 따라가 보자.

### 1. 생산 - Header가 워커 이력에서 신호를 파생

Header는 알람 훅에서 `history`(워커가 push한 알람 이력, 최신순 prepend라 `history[0]`이 항상 가장 최근 알람)를 받아 useMemo로 신호를 만든다.

```jsx
// Header.tsx
const { history, hasUnread, hasCmdUnread /* ... */ } = useAlarmHandler('ALL');

// User Request 모달용 - cmd 채널의 가장 최근 수신 시각
const latestCmdReceivedAt = useMemo(() => {
  const cmdAlarm = history.find((alarm) => alarm.notiSource === NOTI_SOURCE_CMD);
  return cmdAlarm?.receivedAt ?? 0;   // history가 최신순이라 find = 가장 최근 cmd
}, [history]);

// Noti 모달용 - 종류 무관, 가장 최근 수신 알람의 시각
const notiModalRefreshSignal = history[0]?.receivedAt ?? 0;
```

처음엔 payload의 seq 합산을 썼다.

```js
// v1 - payload 필드 의존 (seq 없는 EVNT 알람에서 구멍)
const refreshSignal = latestNotiSeq + latestCmdSeq;
```

seq가 없는 알람 종류(EVNT)가 발견되면서, 워커가 수신 순간 찍는 `receivedAt`으로 교체했다 ([전환 과정은 별도 글에서](/posts/alarm-unread-receivedat)). "어떤 알람이 오든 값이 바뀐다"는 신호의 유일한 요구사항을 외부(payload)가 아니라 클라이언트 자신이 보장하게 된 것.

### 2. 전달 - prop 하나

```jsx
<NotiModal isOpen={isNotiModalOpen} onClose={closeNotiModal}
           refreshSignal={notiModalRefreshSignal} />
<UserRequestModal isOpen={isUserReqModalOpen} onClose={closeUserReqModal}
                  refreshSignal={latestCmdReceivedAt} />
```

모달은 알람 시스템을 모른다 - 숫자 하나가 바뀌면 재조회할 뿐이다. "NotiModal은 모든 알람에, UserRequestModal은 cmd에만 반응"이라는 정책 차이가 모달이 아니라 **신호 파생부(Header)에서** 결정돼 있다는 점이 포인트다.

### 3. 소비 - 값이 아니라 "바뀜"만 쓴다

```js
// NotiModal.tsx
const { data, refetch /* ... */ } = usePaginatedQuery({
  searchParam: param,
  queryFn: (data) => getNotiList(data),
  enabled: isOpen,                 // 여는 시점의 조회는 useQuery가 담당
});

useThrottledRefetch({ signal: refreshSignal, enabled: isOpen, refetch });
```

```js
// useThrottledRefetch.ts - 신호 처리부 (요지)
const lastSignal = useRef<number | null>(null);

useEffect(() => {
  if (!enabled || signal === undefined) return;

  // 오픈/마운트 직후 "이미 있던 신호"는 재조회 사유가 아님 - 기준값만 잡고 스킵
  if (lastSignal.current === null) {
    lastSignal.current = signal;
    return;
  }
  if (signal === lastSignal.current) return;   // 같은 번호표 = 새 알람 없음
  lastSignal.current = signal;

  // 여기 도달 = 진짜 새 알람 → throttle 판단 후 refetch()
  /* ... elapsed 계산, 즉시 실행 또는 예약 ... */
}, [signal, enabled]);

useEffect(() => {
  if (!enabled) {
    // 모달 닫힘 - 예약 취소 + 신호 기준 리셋 (다시 열면 그 시점 신호가 새 기준)
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    lastSignal.current = null;
  }
}, [enabled]);
```

- 신호의 **값 자체는 한 번도 사용하지 않는다.** 직전 값과 다른가만 본다. 그래서 seq든 수신 시각이든 카운터든, 바뀌기만 하면 어떤 값이어도 된다.
- 오픈 직후 스킵(`lastSignal === null` 분기)이 없으면, 모달을 열 때마다 "열기 전 마지막 알람"의 신호로 즉시 한 번 더 재조회하는 중복이 생긴다 - 여는 시점의 조회는 이미 `useQuery(enabled)`가 하고 있는데.

## 배운 것

1. push 채널(SSE/WebSocket)을 설계할 때 payload의 역할을 **"그리기 / 조준하기 / 울리기"** 중 어디까지로 할지 먼저 정하면 스펙 협상이 가벼워진다. 우리 경우 그리기는 없음, 테이블은 조준(식별자+액션 필수), 모달은 울리기만.
2. 신호는 boolean이 아니라 단조 증가 값으로. 그리고 그 값의 출처가 외부(payload)라면 "항상 있는가?"를 의심할 것.
3. "표시가 되는데요?"라는 관찰과 "payload에 필드가 없는데요?"라는 관찰이 동시에 참일 수 있다 - 그리는 경로(pull)와 알리는 경로(push)가 분리돼 있기 때문. 아키텍처를 모르면 디버깅 질문 자체가 안 잡힌다.
