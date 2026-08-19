---
title: "공유 화면이 다른 도메인을 직접 import하고 있었다 — 의존성 역전으로 역의존 끊기"
date: "2026-06-22"
summary: "docker와 k8s가 같이 쓰는 host 목록 화면. 그런데 공유 구현이 docker/host에 있으면서 k8s 도메인을 직접 import하고 있었다. docker가 k8s를 아는 역방향 의존 7건을, 계약(HostExtension)만 남기고 도메인 조각을 주입하는 방식으로 0건까지 끊은 기록."
category: "Project"
tags:
  - Refactoring
  - Dependency Injection
  - Architecture
  - React
  - Next.js
featured: false
---

# 공유 화면이 다른 도메인을 직접 import하고 있었다

운영 중인 모노레포에서 host(호스트/노드) 목록 화면은 **docker(`/host/list`)와 k8s(`/k8s/host/list`)가 같은 구현을 공유**한다. 화면 구성이 거의 같으니 공유 컴포넌트로 묶은 건데, 그 공유 구현을 `docker/host`에 두고 **경로로 `isK8s`를 판단해 런타임 분기**하는 방식으로 만들어져 있었다.

문제는 분기를 위해 셸이 k8s 도메인의 조각(pod 모달·로그·컬럼·expand 행)을 **직접 import**하고 있었다는 점이다. 즉 **docker 도메인이 k8s 도메인을 직접 아는 역방향 의존(reverse dependency)** 이 생겨 있었다.

결론부터 말하면, 셸은 도메인별 조각의 **계약(`HostExtension`)만** 정의하고 각 도메인 페이지가 자기 조각을 **주입**하도록 바꿔서 `docker/host → k8s` 직접 import를 **7건 → 0건**으로 없앴다.

> 이 글은 설계와 코드 중심이다. 같은 세션에서 진행한 폴더/존 재구조화의 삽질·교훈은 [폴더를 옮기는 데 사고가 났다 — 존 재구조화 세션](/posts/zone-restructure-session)에 따로 정리했다. 이 host 주입은 그 세션의 마지막 단계(P6)이기도 하다.

---

## "역의존"이 왜 문제인가

존(zone) 분리 규칙은 단순하다. **`docker`와 `k8s`는 서로 몰라야 한다.** 공통은 `shared`에 두고 양쪽이 `shared`를 가져다 쓴다. 한 도메인이 다른 도메인을 직접 import하면 그 순간 존이 얽힌다.

그런데 공유 구현이 `docker/host`에 있다 보니, k8s 조각을 셸이 직접 import하고 있었다.

```
docker/host  ──▶ @k8s/pod   (4건)
docker/host  ──▶ @k8s/host  (3건)
```

실제 결합 코드는 7건이었다.

```ts
// HostModalController.tsx
import podModalConfig from '@k8s/pod/util/podModalConfig';              // 런타임
import { usePodActionHandler } from '@k8s/pod/util/usePodActionHandler'; // 런타임
import { PodModalPayload } from '@k8s/pod/types/pod';                   // 타입
import PodLogModal from '@k8s/pod/components/PodLogModal';              // 런타임

// HostTable.tsx
import { K8sHostInfo } from '@k8s/host/types/host';                    // 타입
import { getK8sHostColumns } from '@k8s/host/constants/columns';       // 런타임
import PodExpandRow from '@k8s/host/components/HostExpandRow';         // 런타임

// list.d.ts
import { K8sHostInfo } from '@k8s/host/types/host';                    // 타입 (union)
```

이 중 **런타임 5건**(podModalConfig, usePodActionHandler, PodLogModal, getK8sHostColumns, PodExpandRow)이 진짜 문제다. 실제 k8s 코드가 docker 번들에 딸려 들어온다. 타입 2~3건은 빌드 시 지워지니 경미하다.

정리하면 두 가지가 걸린다.

1. **번들 오염** — docker만 떼어 빌드하거나 이해하려 해도 k8s/pod 코드가 함께 끌려온다.
2. **존 순수성 붕괴** — docker→k8s 방향 의존이 생기면 의존 그래프가 단방향이 아니게 되어, 이후 리팩토링이 점점 어려워진다.

### 사실은 양방향이었다

역의존은 한 방향만이 아니었다. k8s host **페이지**도 docker 셸을 가져다 쓰고 있다.

```tsx
// (k8s)/k8s/host/list/page.tsx (Before)
import HostController from '@host/controllers/HostController'; // = docker/host
```

`k8s 페이지 → docker/host` 엣지도 존재했다. 이번 작업의 범위는 **`docker/host → k8s` 역의존 제거**까지다. `k8s 페이지 → docker/host` 엣지는 host 셸을 `shared/host`로 옮겨야 사라지며, 그건 후속 작업으로 남겼다.

---

## 설계 — 의존성 역전(주입)

핵심 아이디어는 이렇다. 공유 셸이 도메인 조각을 직접 고르는(import) 대신, 도메인별로 필요한 조각의 **계약(인터페이스)만** 정의하고 각 도메인 **페이지가 자기 조각을 채워 넣어(주입)** 준다. 아래 탭으로 Before/After 의존 구조를 비교할 수 있다.

```diagram
host-reverse-dependency
```

의존 방향이 **셸 ← 페이지**로 뒤집힌다(역전). 셸은 더 이상 도메인을 모른다.

### 왜 hook 2개로 분리했나

확장을 `useDockerHostExtension` / `useK8sHostExtension` **두 개로 분리한 이유는, 분리해야 역의존이 안 생기기 때문이다.**

각 확장은 자기 도메인 조각만 조립한다.

- `useK8sHostExtension` → `@k8s/*`만 import → k8s → k8s (정상 방향)
- `useDockerHostExtension` → `@cntr/*`(docker container)만 import → docker → docker (정상 방향)

만약 한 파일에 합쳤다면, 그 한 파일이 k8s·docker를 둘 다 import하게 된다. 합치는 순간 "한 곳이 양쪽 도메인을 안다"는 원래 문제가 그대로 재현된다. 도메인별로 쪼개야 각 파일이 자기 도메인만 알게 된다.

위치도 도메인 존에 맞춰 배치했다.

| 확장 | 파일 위치 | import 방향 |
|---|---|---|
| `useK8sHostExtension` | `k8s/host/` (k8s 존) | k8s → k8s |
| `useDockerHostExtension` | `docker/host/util/` (docker 존) | docker → docker |

각 확장이 자기 존 안에 있으므로, k8s 확장이 docker를, docker 확장이 k8s를 모른다.

### 왜 plain object가 아니라 hook인가

조각 안에 **React hook 호출**이 필요하기 때문이다.

| 확장 | 내부에서 호출하는 hook | 용도 |
|---|---|---|
| k8s | `usePodActionHandler()` | pod 액션 모달 핸들러 |
| docker | `useCntrModalHandler()` | 컨테이너 모달 핸들러 |
| docker | `useExcludeCntrConfig()` | cntr expand 제외 설정 |

React rules-of-hooks상 hook은 컴포넌트/커스텀 훅의 최상위에서만 호출할 수 있다. 조각 객체를 만들 때 이 hook들을 호출해야 하므로, 확장을 일반 함수/객체가 아니라 **커스텀 훅(`useXxxHostExtension`)** 으로 만들어 페이지 컴포넌트 최상위에서 호출한다.

```tsx
// 페이지(최상위)에서 hook 호출 → 결과(조각)를 셸에 내려줌
const ext = useDockerHostExtension(); // 내부에서 useCntrModalHandler 등 안전하게 호출
return <HostController ext={ext} />;
```

---

## 계약 — `HostExtension`

계약의 핵심 원칙은 **어느 도메인도 import하지 않는다**는 것이다.

```ts
export interface HostExtension {
  isK8s: boolean;                                  // SearchFilter 표시 분기용
  queryKey: QueryKeyValue;                         // HOST_LIST | K8S_HOST_LIST
  searchParamDefaults: Record<string, unknown>;    // { cntrStat } | { podStat }
  useAlarmRerender: boolean;                        // docker=true, k8s=false
  getColumns: (args: { dispatch: AppDispatch; router: ReturnType<typeof useRouter> }) => ColumnDef<HostBase>[];
  ExpandRow: ComponentType<{ row: HostBase }>;
  expandModalGroup: string;                         // CNTR | POD
  getExpandModalContent: (ctx: HostExpandModalCtx) => ReactNode | ModalContent | undefined;
  LogModal?: ComponentType;                         // pod 만 존재 (VIEW_LOG)
}
```

| 필드 | 역할 | docker | k8s |
|---|---|---|---|
| `isK8s` | 검색필터 등 표시 모드 | `false` | `true` |
| `queryKey` | 목록 쿼리/캐시 키 | `HOST_LIST` | `K8S_HOST_LIST` |
| `searchParamDefaults` | 초기 검색 파라미터 | `{ cntrStat }` | `{ podStat }` |
| `useAlarmRerender` | 알람 시 rerender 연결 여부 | `true` | `false`(noop) |
| `getColumns` | 테이블 컬럼 | `getHostColumns` | `getK8sHostColumns` |
| `ExpandRow` | expand 행 컴포넌트 | `CntrExpandRow` | `PodExpandRow` |
| `expandModalGroup` | 이 도메인이 담당하는 modalGroup | `CNTR` | `POD` |
| `getExpandModalContent` | expand 항목 모달 콘텐츠 | cntrModalConfig | podModalConfig |
| `LogModal` | 로그 모달(독립 컴포넌트) | `undefined` | `PodLogModal` |

여기서 중요한 결정이 하나 있다. **row 타입으로 도메인 구체 타입(`HostInfo`/`K8sHostInfo`)을 쓰지 않고 공통 베이스 `HostBase`를 쓴다.** (두 타입 모두 `HostBase`를 확장한다) 도메인별 구체 타입 cast는 각 확장 내부에서 처리한다. 덕분에 이 계약과 셸은 추후 `shared/host`로 그대로 옮길 수 있다.

---

## 두 확장 — 대칭 구조

k8s 확장은 `@k8s/*`만, docker 확장은 `@cntr/*`만 import한다. 발췌가 아니라 실제 파일 전체다. 먼저 k8s 확장.

```tsx
// k8s/host/useK8sHostExtension.tsx
import { useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import podModalConfig from '@k8s/pod/util/podModalConfig';
import { usePodActionHandler } from '@k8s/pod/util/usePodActionHandler';
import PodLogModal from '@k8s/pod/components/PodLogModal';
import { PodModalPayload } from '@k8s/pod/types/pod';
import { getK8sHostColumns } from '@k8s/host/constants/columns';
import PodExpandRow from '@k8s/host/components/HostExpandRow';
import { K8sHostInfo } from '@k8s/host/types/host';
import { COMMON_CONSTANT } from '@constants/common';
import { QUERY_KEY } from '@constants/querykey';
import { SELECT_TYPE_ALL } from '@constants/select';
import { ModalContent } from '@ctypes/modal';
import { HostBase } from '@host/types/host';
import { HostExtension } from '@host/types/hostExtension';

export const useK8sHostExtension = (): HostExtension => {
  const podActionHandler = usePodActionHandler(); // ← hook 호출(최상위)

  // 안정 참조 — 매 렌더 새 컴포넌트로 expand 행이 remount 되지 않도록 고정
  const ExpandRow = useCallback(
    ({ row }: { row: HostBase }) => <PodExpandRow hostInf={row as unknown as K8sHostInfo} />,
    [],
  );

  return {
    isK8s: true,
    queryKey: QUERY_KEY.K8S_HOST_LIST,
    searchParamDefaults: { podStat: SELECT_TYPE_ALL },
    useAlarmRerender: false,
    getColumns: ({ dispatch }) => getK8sHostColumns({ dispatch }) as unknown as ColumnDef<HostBase>[],
    ExpandRow,
    expandModalGroup: COMMON_CONSTANT.POD,
    getExpandModalContent: ({ modalType, modalKeyword, payload }) => {
      const podPayload = payload as PodModalPayload;
      const podConfig = podModalConfig({
        action: modalKeyword,
        errorCode: podPayload?.errorCode,
        resultMsg: podPayload?.resultMsg,
        payload: podPayload,
      })[modalType];
      if (!podConfig) return undefined;
      return { ...podConfig, handlers: podActionHandler[modalType as keyof typeof podActionHandler] } as ModalContent;
    },
    LogModal: PodLogModal,
  };
};
```

docker 확장도 같은 모양이되, 채우는 조각이 cntr 패턴(`cntrModalConfig(handlers)` 팩토리에 `props`를 넘김)이라는 점만 다르다.

```tsx
// docker/host/util/useDockerHostExtension.tsx
import { useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useCntrModalHandler } from '@cntr/hook/useCntrModalHandler';
import { cntrModalConfig } from '@cntr/util/modal/cntrModalConfig';
import { useExcludeCntrConfig } from '@config/hooks';
import { getHostColumns } from '@host/constants/columns';
import CntrExpandRow from '@host/components/HostExpandRow';
import { COMMON_CONSTANT } from '@constants/common';
import { QUERY_KEY } from '@constants/querykey';
import { SELECT_TYPE_ALL } from '@constants/select';
import { ModalContent } from '@ctypes/modal';
import { HostBase, HostInfo } from '@host/types/host';
import { HostExtension } from '@host/types/hostExtension';

export const useDockerHostExtension = (): HostExtension => {
  const { getCntrHandlerByType } = useCntrModalHandler();             // ← hook
  const { DISABLED_CHECK, ENABLED_PARTIAL } = useExcludeCntrConfig(); // ← hook

  // 안정 참조 — DISABLED_CHECK/ENABLED_PARTIAL 가 바뀔 때만 재생성
  const ExpandRow = useCallback(
    ({ row }: { row: HostBase }) => (
      <CntrExpandRow hostInf={row as unknown as HostInfo} DISABLED_CHECK={DISABLED_CHECK} ENABLED_PARTIAL={ENABLED_PARTIAL} />
    ),
    [DISABLED_CHECK, ENABLED_PARTIAL],
  );

  return {
    isK8s: false,
    queryKey: QUERY_KEY.HOST_LIST,
    searchParamDefaults: { cntrStat: SELECT_TYPE_ALL },
    useAlarmRerender: true,
    getColumns: ({ dispatch, router }) => getHostColumns({ dispatch, router }) as unknown as ColumnDef<HostBase>[],
    ExpandRow,
    expandModalGroup: COMMON_CONSTANT.CNTR,
    getExpandModalContent: ({ modalType, props }) => {
      const handlers = getCntrHandlerByType(modalType);
      const contentFactory = cntrModalConfig(handlers)[modalType];
      if (!contentFactory) return undefined;
      return contentFactory(props) as ModalContent;
    },
    LogModal: undefined,
  };
};
```

두 확장은 정확히 대칭이다.

| | k8s | docker |
|---|---|---|
| 핸들러 hook | `usePodActionHandler()` | `useCntrModalHandler()` |
| 모달 설정 | `podModalConfig` (config+handlers) | `cntrModalConfig(handlers)` (factory(props)) |
| expand 행 | `PodExpandRow` | `CntrExpandRow` (+제외설정) |
| 컬럼 | `getK8sHostColumns` | `getHostColumns` |
| 로그 | `PodLogModal` | 없음 |
| `ExpandRow` deps | `[]` | `[DISABLED_CHECK, ENABLED_PARTIAL]` |

한 가지 짚어둘 점. host **자체** 모달(Add/Edit/Remove Host)은 도메인과 무관하므로 확장이 아니라 셸에 그대로 남는다. 확장은 "expand가 보여주는 것(컨테이너 vs Pod)과 그 모달"만 담당한다.

---

## 셸 변경 — 도메인 import 제거

셸은 `HostController` / `HostTable` / `HostModalController` 세 파일이다. 모두 `ext: HostExtension` prop을 받아 조각을 분배하고, 도메인 직접 import를 제거한다.

`HostController`에서는 `pathname`/`isK8s` 분기가 사라지고 데이터만 `ext`에서 가져온다.

```diff
- const HostController = () => {
-   const pathname = usePathname();
-   const isK8s = pathname?.startsWith('/k8s') ?? false;
+ const HostController = ({ ext }: { ext: HostExtension }) => {

    ...ext.searchParamDefaults,          // (isK8s ? { podStat } : { cntrStat }) 대체
    queryKey: ext.queryKey,              // (isK8s ? K8S_HOST_LIST : HOST_LIST) 대체
```

`HostTable`에서는 k8s/docker 컬럼·expand import가 전부 사라지고 `ext`로 통합된다.

```diff
- const columns = (isK8s ? getK8sHostColumns({ dispatch }) : getHostColumns({ dispatch, router })) as ...;
+ const columns = ext.getColumns({ dispatch, router }) as ColumnDef<HostListRow>[];

- const getExpandComponent = (row) => isK8s ? <PodExpandRow .../> : <CntrExpandRow .../>;
+ const getExpandComponent = (row: HostListRow) => <ext.ExpandRow row={row} />;
```

`HostModalController`의 변화가 가장 크다. cntr 분기와 pod 분기를 `ext.getExpandModalContent` 하나로 합치고, host 자체 모달만 셸에 남긴다.

```diff
+   // expand 도메인 모달(cntr/pod) → 주입된 ext 로 위임
+   if (modalGrp === ext.expandModalGroup) {
+     return ext.getExpandModalContent({ modalType: modalTypeNm, modalKeyword, payload, props: enrichedProps });
+   }
+   // host 자체 모달
+   const contentFactory = hostModalConfig(getHandlerByType(modalTypeNm))[modalTypeNm];
```

타입 결합도 끊었다. `list.d.ts`의 union을 공통 베이스로 바꾼다.

```diff
- export type HostListRow = HostInfo | K8sHostInfo;   // k8s 타입 결합
+ export type HostListRow = HostBase;                 // 공통 베이스
```

마지막으로 페이지가 확장을 주입한다. 확장이 hook이라 페이지는 client 컴포넌트가 되어야 한다.

```tsx
// (private)/(docker)/host/list/page.tsx
'use client';
export default function HostListPage() {
  const ext = useDockerHostExtension();
  return <HostController ext={ext} />;
}
```

k8s 페이지도 동일하게 `useK8sHostExtension()`을 주입한다.

---

## 안정성 — 주입이 만든 remount 회귀

주입 방식에는 함정이 있다. **조각이 매 렌더 새로 만들어지면** 부작용이 생긴다. 이건 리뷰 과정에서 드러났는데, 사실 "ext를 useMemo deps에 넣은 거야?"라는 질문 한마디가 결정적인 단서였다. 두 곳을 안정화했다.

**① `ExpandRow`를 `useCallback`으로 고정.** `<ext.ExpandRow>`의 `ext.ExpandRow`가 매 렌더 새 함수면, React가 컴포넌트 타입이 바뀐 걸로 보고 expand 행을 언마운트/재마운트한다(깜빡임·재fetch). 원본은 `PodExpandRow`/`CntrExpandRow`를 고정 import해서 remount가 없었으니, 주입 방식이 만든 회귀다. 각 확장에서 `ExpandRow`를 `useCallback`으로 고정해 막았다(k8s `[]`, docker `[DISABLED_CHECK, ENABLED_PARTIAL]`).

**② `renderModal` deps를 `ext` → `ext.LogModal`로.** `ext`는 매 렌더 새 객체라 deps에 `ext`를 넣으면 `useMemo`가 매 렌더 재계산되어 의미가 없다. 실제 참조하는 `ext.LogModal`만 deps로 좁혔다. `LogModal`은 모듈 import(`PodLogModal`)거나 `undefined`라 안정 참조이므로 메모가 제대로 동작한다.

여기서 한 걸음 더 들어가면, docker `ExpandRow`의 deps인 `DISABLED_CHECK`/`ENABLED_PARTIAL`이 사실 매 렌더 새 배열이었다. root cause는 멀리 떨어진 공용 훅에 있었다.

```ts
// useExcludeCntrConfig (Before)
return {
  DISABLED_CHECK: config?.DISABLED_CHECK || [],  // ← || [] 가 매 렌더 "새 배열"
  ENABLED_PARTIAL: config?.ENABLED_PARTIAL || [],
  ...
};
```

`|| []`가 매 렌더 새 배열 참조를 만들어, 이 값을 deps로 쓰는 소비처의 메모를 전부 무력화하고 있었다. 반환값을 `useMemo`로 감싸 참조를 안정화했다.

```ts
// useExcludeCntrConfig (After)
return useMemo(
  () => ({
    DISABLED_CHECK: config?.DISABLED_CHECK || [],
    ENABLED_PARTIAL: config?.ENABLED_PARTIAL || [],
    isConfigLoading: isLoading,
    configError: error,
  }),
  [config, isLoading, error],
);
```

`config`가 바뀔 때만 새 참조가 된다. 값은 동일하고 참조만 안정되므로 부작용은 0이다. 한 곳을 고쳐 host 확장 + 기존 `CntrTable`/`CntrTableTmp`의 메모 버그까지 동시에 수리됐다. (`updateConfig`가 항상 `config = {...newConfig}`로 새 ref를 재할당하므로, config가 실제로 바뀌면 `useMemo([config])`가 정확히 감지해 반영된다 — stale 위험 없음)

---

## 곁가지로 잡은 pre-existing 버그

리팩토링 도중 **선언 자체가 없는데 참조되던 QUERY_KEY**를 발견했다. `K8S_HOST_LIST` / `K8S_HOST_POD_LIST`가 `querykey.ts`에 없는데 4곳에서 쓰이고 있었다. `tsc`에선 TS2551, 런타임에선 `undefined` 키로 캐싱/무효화가 동작하던 상태(pod 액션 후 리패치가 제대로 안 될 수 있음)다.

이건 host 리팩토링이 만든 게 아니라 원래 `HostController`에 있던 줄이 이동만 된 것이다. 별도 커밋으로 선언 2줄을 추가해 TS2551 5건을 해소(baseline 59 → 54)하고 k8s host 캐싱/무효화를 정상화했다.

```diff
// constants/querykey.ts
  K8S_POD_LIST: 'K8S_POD_LIST',
+ K8S_HOST_LIST: 'K8S_HOST_LIST',
+ K8S_HOST_POD_LIST: 'K8S_HOST_POD_LIST',
  K8S_REVISION_LIST: 'K8S_REVISION_LIST',
```

커밋 순서에 주의가 필요했다. host 커밋의 `useK8sHostExtension`이 `K8S_HOST_LIST`를 참조하므로, querykey 픽스를 먼저 커밋해야 host 커밋이 그 자체로 에러 없는 상태가 된다.

```
1) ⚡ perf: useExcludeCntrConfig 반환 메모이제이션
2) 🐛 fix: 누락된 QUERY_KEY(K8S_HOST_LIST·K8S_HOST_POD_LIST) 선언 추가
3) ♻️ refactor: docker/host → k8s 역방향 의존 제거 (확장 주입)
```

---

## 검증과 남은 작업

정적으로는 `tsc --noEmit` 신규 에러 0, baseline 59 → querykey 픽스로 54다. 다만 이 코드베이스는 mock-first라 런타임 회귀는 직접 확인해야 한다 — docker `/host/list`의 컨테이너 expand·액션 모달·host Add/Edit/Remove·알람 갱신, k8s `/k8s/host/list`의 pod expand·액션 모달·**pod 로그 모달(VIEW_LOG)**, 그리고 querykey 픽스로 동작이 바뀐 pod 액션 후 목록 갱신.

남은 작업도 명확하다.

1. **host 셸 → `shared/host` 이동.** 이번엔 `docker/host → k8s`만 끊었다. `k8s 페이지 → docker/host` 잔여 엣지는 셸을 옮겨야 사라진다. 셸이 이미 도메인 무관이라 이동 준비는 끝난 상태다.
2. **cluster 역의존.** 분석 중 cluster도 같은 병인 걸 발견했는데, host와 달리 `docker/cluster ↔ k8s/cluster` 양방향(docker→k8s 4파일, k8s→docker 2파일)에 공유 컨트롤러 6개까지 훨씬 엉켜 있고 개발 중이다. 안정화 후 동일 주입 패턴으로 처리하는 게 안전하다.

---

## 메모

이 작업에서 가장 또렷하게 남은 건, **"공유"라고 다 같지 않다**는 점이다. 같은 역의존이라도 host는 한 방향 위주였고 cluster는 양방향에 개발 중이었다. 결합의 방향성·개수·개발 중 여부로 난이도를 가늠하고, 위험한 건 분리해서 미루는 판단이 결과적으로 옳았다.

그리고 **주입을 도입할 땐 "그게 매 렌더 새로 생기는가"를 반드시 점검해야 한다**는 것. 안정 참조(useCallback/useMemo)가 핵심인데, 불안정의 root cause는 의외로 멀리 떨어진 공용 훅에 있을 수 있다. 이번엔 그게 `useExcludeCntrConfig`의 `|| []` 한 줄이었다.

폴더를 옮기는 일 자체의 삽질은 [존 재구조화 세션 글](/posts/zone-restructure-session)에 따로 적었다.
