---
title: "Modal Config 패턴 비교 — 정적 Map vs Factory Map"
date: "2026-05-16"
summary: "Modal이 많은 도메인에서 Config을 어떻게 짤지 두 가지 패턴을 비교했다. 정적 Map과 Factory Map의 차이는 결국 Controller의 역할을 어디까지로 정의할 것인가의 문제였다."
category: "React / Next.js"
tags:
  - React
  - Modal
  - Redux
  - Architecture
  - Design Patterns
featured: false
---

# Modal이 많아질 때 — 결국 어떻게 정리했나

프로젝트를 진행하다 보면 어느 순간 한 화면에 modal이 손쓸 수 없을 만큼 쌓여있는 걸 마주하게 된다. 우리도 그랬다. Docker 컨테이너나 이미지처럼 CRUD가 많은 도메인을 만지다 보니 한 화면에서만 modal이 10개를 넘기는 게 보통이었다. Confirm, success, fail, form 입력, 결과 리스트… 사용자가 어떤 액션을 했느냐, 어디서 했느냐에 따라 그때그때 다른 modal이 떠야 했다.

처음엔 컴포넌트 옆에 `<Dialog>`를 그냥 두는 식으로 했는데 곧 한계가 보였다. API 응답에 따라 SUCCESS / FAIL modal로 자동 전이해야 했고, 리스트 페이지와 디테일 페이지에서 같은 모달을 재사용해야 했고, 어느 자식 컴포넌트에서든 modal을 띄울 수 있어야 했다. 결국 Redux로 `modalType`을 글로벌하게 관리하고, 한 곳에서 매핑해 렌더하는 구조로 갔다.

```
[어디서든] dispatch(setModalType({ type: 'RM', payload }))
       ↓
   Redux: { modalType: 'RM', payload }
       ↓
   ModalController (단일 mount 지점)
       ↓
   modalConfig[modalType]
       ↓
   선택된 entry 렌더
```

이러니까 어디서든 dispatch 한 줄로 modal을 열 수 있고, API 성공 시 `dispatch(SUCCESS)` 한 줄로 흐름을 이어붙일 수 있고, ESC나 backdrop 처리도 ModalController 한 곳에서 끝났다. 도메인의 modal이 config 한 파일에 모이니까 신규 팀원도 *"이 도메인에 어떤 modal이 있나"* 를 한 번에 본다.

이 구조가 React 생태계의 정석은 아니다. Modal이 3~5개인 단순한 SPA라면 Radix처럼 사용처 옆에 두는 게 더 깔끔할 거다. 다만 우리처럼 modal 다양성·서버 주도 전이·여러 화면 공유가 누적되는 도메인에선 중앙집중이 더 자연스러웠다.

## Controller에 다 몰면 1000줄이 보였다

중앙집중을 정하고 나니 한 번 더 갈림길이 있었다. ModalController에 다 몰 것인가, 나눌 것인가. Modal이 20개 가까이 되니 한 파일이 1000줄을 넘길 게 자명해서 셋으로 쪼갰다.

- **Controller** — Redux의 `modalType`을 읽고, Config에서 뽑은 UI를 렌더, 확인 클릭 시 Handler 트리거
- **Config** — `modalType`별 UI 정의 (title, content, className 같은 것들)
- **Handler** — `modalType`별 동작 (API 호출, 상태 전이)

여기까지가 우리 팀이 도달한 분리다. 표준 아키텍처 같은 건 아니고, 그냥 modal이 많아지니까 자연스럽게 갈라낸 거였다.

그런데 **Config 작성 방식**에서 한 번 더 갈라졌다. 도메인을 나눠 작업하면서 — 나는 Container, 동료는 Image — 같은 컨벤션을 따랐는데도 Config 모양이 전혀 달랐다.

내가 처음 Config을 짤 때 가장 신경 쓴 건 *"Controller가 modalType을 알게 두면 안 된다"* 였다. Controller는 단순히 Redux state를 읽어서 Config에 위임하는 router 역할만 해야 한다고 생각했다. modal별 데이터 가공이나 UI 분기는 모두 Config 안에 갇혀야 한다고 봤고, 그 결과 entry를 함수로 만들었다 — Factory Map 패턴이다.

동료는 다르게 갔다. Entry를 plain object로 두고, Config 함수에 외부 상태를 한꺼번에 인자로 받는 정적 Map 방식이었다. 처음엔 둘 다 합리적인 선택처럼 보였다. 오히려 동료의 정적 Map이 더 단순하고 보일러플레이트도 적었다.

## 동료가 짠 방식 — 정적 Map

Image 도메인 쪽 Config은 entry가 plain object다. Config 함수에 외부 상태를 인자로 받고, 모든 modal type을 한꺼번에 평가한다.

```tsx
const resourceQuotaModalConfig = (
  payload: ResourceQuotaRemovePayload | undefined,
  failReason: string,
  errorCode: string,
) => ({
  [MODAL_TYPE.RM.type]: {
    title: 'Remove',
    description: <>해당 Resource Quota를 Remove 하시겠습니까?</>,
    content: <ModalTable data={payload ? [payload] : []} columns={RM_COLUMNS} />,
    className: 'w-[409px]',
  },
  [MODAL_TYPE.SUCCESS.type]: {
    title: 'Confirm',
    description: <>요청에 성공하였습니다.</>,
  },
  [MODAL_TYPE.FAIL.type]: {
    title: 'Fail',
    description: <>요청에 실패하였습니다.</>,
    content: errorCode ? <p>{errorCode}: {failReason}</p> : undefined,
  },
});
```

Controller에서는 단순히 lookup만 한다.

```tsx
const config = resourceQuotaModalConfig(payload, failReason, errorCode)[modalType];
```

확인 버튼을 누를 때의 동작은 별도의 ActionHandler hook에 뒀다.

```tsx
export const useResourceQuotaActionHandler = () => ({
  [MODAL_TYPE.RM.type]: async () => {
    const response = await removeResourceQuota({ /* ... */ });
    // SUCCESS / FAIL 전이
  },
});
```

처음 봤을 땐 깔끔하고 단순했다. Entry가 모두 같은 shape이라 타입도 단순했고, modal 3~4개 수준일 때는 군더더기가 거의 없었다. 솔직히 *"이거 그냥 이렇게 쓰면 되는 거 아닌가"* 싶을 정도였다.

## 내가 짠 방식 — Factory Map

내가 Container 도메인에서 쓴 방식은 entry가 plain object가 아니라 **factory 함수**다. Controller가 호출 시점에 modal type별 props를 넘기면, 그제야 결과 object가 만들어진다.

```tsx
export const cntrModalConfig: HostModalContentMapType = (handlers) => ({
  // 단순 Action (Remove)
  [MODAL_TYPE_KEY.RM]: ({ cntrInfo }: { cntrInfo?: Partial<CntrInfo>[] }) =>
    createCntrActionModal({
      title: MODAL_TYPE.RM.title,
      actionType: MODAL_TYPE_KEY.RM,
      cntrInfo,
      handler: ({ v }) => handlers?.handleOnRequest?.({ ccidList, v }),
    }),
  // Form 입력 포함 (Rename)
  [MODAL_TYPE_KEY.RNM]: ({
    cntrNmController,
    handlerOnRnmCntr,
    errorMsg,
  }: {
    cntrNmController: UseControllerReturn<{ cntrNm: string }, 'cntrNm'>;
    handlerOnRnmCntr: () => void;
    errorMsg: string;
  }) => ({
    title: MODAL_TYPE.RNM.title,
    content: (
      <ActionModalContent
        description={<>Container name을 수정하시겠습니까?</>}
        content={
          <ModalInput
            value={cntrNmController.field.value}
            onChange={cntrNmController.field.onChange}
            error={!!errorMsg}
          />
        }
      />
    ),
    handlers: () => handlerOnRnmCntr(),
  }),
  DEFAULT: (props) => ({
    title: '알 수 없는 modalType',
    content: <JsonView value={props} />,
  }),
});
```

Controller에서의 lookup도 한 단계 더 깊다.

```tsx
const entry = cntrModalConfig(handlers)[modalType] ?? cntrModalConfig(handlers).DEFAULT;
const config = entry(props);
```

분명히 손해 보는 부분도 있었다. 함수 래핑이 한 겹 더 들어가니 보일러플레이트가 늘었고, entry마다 props 타입이 달라서 mapping 타입을 별도로 정의해야 했고, 호출도 `config(handlers)[modalType](props)` 처럼 3단계로 들어간다. 정적 Map과 비교하면 짧은 호흡에선 명백히 더 무거운 구조다.

그래도 이렇게 간 건 한 가지 직감 때문이었다 — *"Controller가 modalType별 분기를 갖기 시작하면 그 도메인은 더 못 자란다"*. 보일러플레이트는 지금의 비용이지만 Controller가 비대해지는 건 미래의 비용이라고 봤다. 그 직감이 맞는지는 시간이 지나봐야 알 일이었다.

## 시간이 지나면서 — 두 Controller가 다르게 자랐다

몇 달이 지나니까 두 도메인의 ModalController가 다르게 자라고 있는 게 보였다.

동료의 ImgModalController는 점점 두꺼워졌다. 이런 코드가 들어가기 시작했다.

```tsx
// ImgModalController 내부
const parsedTableData =
  (modalType === MODAL_TYPE.PUSH.type ||
    modalType === MODAL_TYPE.DELETE.type ||
    (modalType === MODAL_TYPE.RM.type && pathname === '/image/detail')) &&
  selectedList
    ? selectedList
    : rowSelectionList.flatMap(/* ... */);

const config = imgModalConfig(control, trigger, parsedTableData, /* ... */)[modalType];
```

Controller가 *"이 modalType에는 어떤 데이터 모양이 필요한가"* 를 알고 있었다. Modal type을 추가할 때마다 이 분기에 한 줄이 늘었고, Config 함수의 인자도 점점 길어졌다. 처음 9개로 시작했던 인자가 어느새 자라고 있었다. Modal이 늘어날수록 Controller가 비례해서 비대해진다는 게 명확히 보였다.

내가 짠 Container 도메인은 그렇지 않았다. 같은 가공이 필요해도 entry 안에서 끝났다.

```tsx
[MODAL_TYPE_KEY.RECREATE]: ({ cntrInfo }) => {
  const cntrInfoData = isArray(cntrInfo)
    ? cntrInfo?.map((item) => item?.cntrCcid)
    : [(cntrInfo as any)?.cntrCcid];
  return createCntrActionModal({ /* ... */ });
}
```

CntrModalController 본체는 `cntrModalConfig(handlers)[modalType](props)` 한 줄에 가까웠다. **단순한 router**였다. Modal이 20개를 넘었지만 Controller는 거의 자라지 않았다.

처음의 직감이 맞았다. 두 패턴을 가르는 핵심은 결국 **새 modal type을 추가했을 때 변경이 어디까지 번지는가** — 그게 곧 패턴의 가치였다.

| 변경 시나리오 | 정적 Map | Factory Map |
| --- | --- | --- |
| 새 modal type 추가 | Config + Controller(분기) + ActionHandler | Config 1곳 |
| modal별 데이터 가공 필요 | Controller에 분기 누적 | Entry 내부에서 처리 |
| modal별 callback 변형 | Config signature에 인자 추가 | Entry props로 직접 받음 |
| Controller 코드 사이즈 | modalType 수에 비례 증가 | 거의 일정 |

마지막 행이 핵심이다. **정적 Map은 Controller가 자라고, Factory Map은 자라지 않는다.**

## Controller가 얇은 게 왜 중요한가

Controller는 외부 시스템 — Redux, Router, API — 과의 접점이다. 여기에 도메인 로직이 쌓이면 외부 시스템 변경이 modal 로직까지 흔든다. 언젠가 Redux를 Zustand로 옮긴다면, 정적 Map 도메인은 Controller를 다 헤집어야 하지만 Factory Map 도메인은 ModalController만 살짝 손보면 끝이다.

디버깅 동선도 다르다. *"왜 이 modal이 이상하게 동작하지?"* 를 추적할 때

- 정적 Map — Controller(데이터 가공) → Config(UI) → ActionHandler(동작), 3파일 순회
- Factory Map — Config 내 해당 entry 한 곳

매번 몇 초씩 차이가 누적된다.

## 그래도 정적 Map이 잘못된 선택은 아니다

여기까지 보면 Factory Map이 답처럼 보이지만, 정적 Map이 잘못된 선택이었다는 건 아니다. Modal이 적고 entry 간 차이가 거의 없을 땐 정적 Map의 단순함이 분명한 이득이다. 동료가 정적 Map을 골랐던 것도 시작 시점엔 합리적 판단이었다 — modal이 늘어나기 전엔 그 단순함이 더 값나갔다.

Factory Map의 비용도 정직하게 짚자.

**보일러플레이트가 늘어난다.** 단순 confirm modal에도 함수 래핑이 한 겹 더 들어간다.

```tsx
// 정적
[RM]: { title: 'Remove', description: <>...</> }
// Factory
[RM]: () => ({ title: 'Remove', description: <>...</> })
```

**타입이 까다롭다.** 정적 Map은 모든 entry가 같은 shape이라 타입이 단순한데, Factory Map은 entry마다 props 타입이 달라서 별도 mapping 타입을 정의해야 한다.

```tsx
type CntrModalContentMapType = (handlers: Handlers) => {
  [K in keyof CntrModalProps]: (props: CntrModalProps[K]) => ModalContent;
};
```

자동완성과 타입 안전성을 다 챙기려면 한 번은 짚고 가야 할 장벽이 있다.

**호출이 한 단계 깊어진다.** `config[modalType]` vs `config(handlers)[modalType](props)`. Controller 코드가 미세하게 더 복잡해진다.

그리고 handler 위치도 취향이 갈린다. 정적 Map에선 동작이 ActionHandler hook 한 곳에 모이니 *"이 도메인의 동작을 다 보고 싶다"* 할 때 편하다. Factory Map에선 UI와 동작이 entry 안에 함께 있어서 *"이 modal 하나만 보고 싶다"* 할 때 편하다. 어느 쪽이 맞느냐는 팀의 디버깅 패턴에 따라 다르다.

## 그래서 어떻게 선택할까

지금 시점에서 내가 도달한 결론은 이렇다.

Modal이 3~4개 수준이고 모두 confirm 류라면 정적 Map. 함수 래핑이나 mapping 타입 같은 보일러플레이트를 감당할 가치가 없다. 단순함의 이득이 더 크다.

Modal이 5개를 넘어가고 entry별 props가 다양해진다면 Factory Map. 처음 짤 때는 과해 보이지만, modal이 누적될수록 Controller를 router 상태로 유지하는 가치가 점점 커진다.

판단이 안 설 때는 정적 Map으로 시작해도 된다. 다만 **Controller에 `if (modalType === X || modalType === Y) ...` 같은 분기가 등장하기 시작하면** 그게 신호다. Config의 책임이 Controller로 새고 있는 거고, 그때부터는 정적 Map으로 더 못 버틴다. 도메인 단위로 한 번에 Factory Map으로 갈아끼우면 된다.

거꾸로 — Factory Map으로 시작했다가 *"너무 과해서 정적으로 돌아간다"* 는 경우는 거의 못 봤다. 한 번 entry별 props 변형이 들어오면 그건 보통 사라지지 않으니까.

---

처음엔 두 패턴이 단순히 *"같은 일을 다르게 표현한 것"* 정도로 보였다. 시간이 지나면서 알게 된 건, 이게 **Controller의 역할을 어디까지로 정의할 것인가**의 문제라는 점이었다. 정적 Map은 Controller가 약간의 도메인 지식을 흡수한다. Factory Map은 Controller를 router로 유지하고 모든 변경을 Config에 가둔다.

Modal이 적은 도메인에선 전자가 가볍고 깔끔하다. Modal이 많아질수록, 그리고 1년 뒤에 더 늘어날 게 보일수록, 후자의 가치가 커진다. 처음 Factory Map을 선택할 땐 직감에 가까웠지만, 결국 Container 도메인이 modal 20개를 넘기는 동안에도 Controller가 거의 자라지 않은 걸 보면서 그 직감을 *"왜 그게 맞았는지"* 로 정리할 수 있게 됐다.
