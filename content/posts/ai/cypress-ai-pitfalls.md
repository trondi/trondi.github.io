---
title: "AI에게 Cypress E2E를 맡겼더니 — 실전 검증 함정 6가지"
date: "2026-06-10"
summary: "AI 코딩 에이전트가 짜는 Cypress 테스트는 눈으로 보면 멀쩡하고 리뷰도 통과하는데, 실행하면 깨진다. UI가 '실제로' 어떻게 렌더되는지를 모델이 알 수 없기 때문이다. 반복해서 같은 곳에서 넘어지길래 스킬 룰로 박아둔 6가지 함정을 정리했다."
category: "AI"
tags:
  - AI
  - Cypress
  - E2E
  - Testing
  - Claude Code
featured: false
---

# AI에게 Cypress E2E를 맡겼더니 — 실전 검증 함정 6가지

"기능 다 만들었으니 Cypress 테스트도 추가해줘."

AI 코딩 에이전트에게 이 작업을 맡기면, 결과물은 놀랄 만큼 그럴듯하다. `describe` 블록 구조도 맞고, selector도 상수로 잘 뽑고, 시나리오도 꼼꼼하다. **코드 리뷰를 눈으로 하면 통과한다.** 그런데 실행하면 깨진다.

이유는 단순하다. 에이전트는 *자기가 상상한 DOM*을 기준으로 단언(assertion)을 쓴다. 하지만 테스트가 통과하려면 *실제로 렌더되는 DOM*과 맞아야 한다. 그 둘 사이의 간극 — 셀이 20자에서 잘린다거나, 섹션이 viewport 밖에 있다거나 — 은 코드를 아무리 잘 읽어도 알 수 없다. 직접 띄워봐야 안다.

우리 팀은 같은 에이전트가 같은 함정에 반복해서 빠지길래, 아예 스킬 룰북에 "검증 함정" 섹션을 만들어 박아뒀다. 이 글은 그중 실전에서 가장 자주 마주친 6가지다. Cypress + React(컴포넌트 기반 UI) 조합이면 어디서든 만날 수 있는 패턴이라, 사람이 직접 짤 때도 똑같이 유용하다.

## 1. 잘리는 셀 텍스트 (truncate)

테이블이나 모달의 셀이 일정 길이를 넘으면 `...`으로 잘리는 경우가 많다. 우리 모달 테이블은 20자에서 자른다. 에이전트는 이걸 모르고 **원본 문자열 그대로 매칭**한다.

```ts
// ❌ AI가 자연스럽게 쓰는 코드 — 긴 이름은 매칭 실패
cy.getByCy(MODAL.TABLE_CELL).should("contain.text", "resource-quota-test-nm-001");
```

화면에는 `resource-quota-test...`로 렌더되니 raw text 매칭이 실패한다. 셀의 truncate 규칙과 똑같이 잘라서 단언해야 한다.

```ts
// ✅ 셀과 동일한 규칙으로 미리 자른다
const truncateForCell = (text: string, size = 20) =>
  text.length > size ? text.slice(0, size) + "..." : text;

cy.getByCy(MODAL.TABLE_CELL).should("contain.text", truncateForCell(name));
```

## 2. viewport 밖의 섹션은 `be.visible`로 못 잡는다

세로로 긴 Detail 페이지처럼 카드 섹션이 여러 개 쌓인 화면. 에이전트는 모든 섹션에 `should('be.visible')`를 건다. 그런데 네 번째 이후 섹션은 viewport 밖에 있고, 부모가 `overflow: auto`라 Cypress의 가시성 판정에서 막힌다.

```ts
// ❌ viewport 밖 섹션은 be.visible 실패
cy.getByCy(USAGE_SECTION_COMPUTE).should("be.visible");
```

"페이지가 로드됐는가"는 `exist`로 확인하고, 섹션 내용을 검증할 땐 먼저 `scrollIntoView`로 끌어온 다음 본다.

```ts
// ✅ 로드 검증은 exist
cy.getByCy(USAGE_SECTION_COMPUTE).should("exist");

// ✅ 내용 검증 전엔 scrollIntoView
cy.getByCy(USAGE_SECTION_COMPUTE).scrollIntoView();
cy.getByCy(USAGE_SECTION_COMPUTE).within(() => {
  // ...
});
```

## 3. 한 `it` 안에 두 시나리오를 넣으면 상태가 샌다

에이전트는 효율을 위해 Cancel 사이클과 Confirm 사이클을 한 `it` 안에 이어서 넣곤 한다. 보기엔 합리적이다. 하지만 첫 사이클이 남긴 **portal 잔여물이나 Redux state**가 두 번째 사이클에 영향을 줘서, 두 번째 Confirm 클릭의 API 호출이 아예 발생하지 않는다 (`cy.wait('@removeRq')`에서 멈춘다).

```ts
// ❌ 한 it 안에서 두 시나리오 연속 — 잔여 state로 두 번째 실패
it("Cancel / API 에러", () => {
  // (1) Cancel ...
  // (2) Confirm → Remove API 호출이 발생하지 않음
});
```

시나리오마다 `it`을 쪼갠다. 각 `it`이 fresh `visit`으로 시작하니 상태가 깨끗하다.

```ts
// ✅ 시나리오별 it 분리
it("Cancel: 모달이 닫힌다", () => {
  /* ... */
});
it("API 실패: Fail 모달이 뜬다", () => {
  /* ... */
});
```

이건 "테스트는 서로 독립이어야 한다"는 원칙의 구체적 사례인데, 에이전트는 토큰을 아끼려고 자꾸 한 블록에 몰아넣는다. 명시적으로 막아둘 가치가 있다.

## 4. 본문의 별도 `<p>`는 전용 data-cy로 안 잡힌다

모달 description에 `data-cy`를 달아뒀다고, 그 안의 모든 텍스트가 잡히는 건 아니다. 우리 경우 `DESCRIPTION` data-cy는 **첫 번째 `<p>`만** 잡는다. content 영역에 따로 들어간 `<p>`(예: "Contact the Manager")는 그 selector로 안 잡힌다.

```ts
// ❌ DESCRIPTION 안에 'Contact the Manager'가 없어 실패
cy.getByCy(MODAL.DESCRIPTION).should("contain.text", "Contact the Manager");

// ✅ 본문 텍스트는 cy.contains로
cy.contains("Contact the Manager").should("be.visible");
```

selector가 DOM의 어느 노드에 붙어 있는지는 컴포넌트 구현 디테일이다. 에이전트는 "description data-cy가 있으니 description 텍스트는 다 여기서 잡히겠지"라고 합리적으로 추론하지만, 실제 마크업은 그렇지 않다.

## 5. mock fixture 경로 함정 — `public/data/`를 복제하지 마라

로딩/빈 상태/에러 시나리오를 mock으로 테스트할 때, 에이전트는 `cy.intercept`의 `fixture` 옵션을 쓰려 한다. 그런데 `fixture` 옵션은 `cypress/fixtures/` 기준이라, 프로젝트가 이미 갖고 있는 `public/data/<domain>/*.json`을 직접 가져오지 못한다. 여기서 에이전트가 하기 쉬운 최악의 선택은 **fixture를 `cypress/fixtures/`로 복제**하는 것이다. (소스 오브 트루스가 둘로 갈린다.)

```ts
// ❌ fixture 경로가 cypress/fixtures 기준이라 못 찾음 → 복제 유혹
cy.intercept("GET", "/data/xxx/list.json", {
  fixture: "public/data/xxx/list.empty.json",
});
```

복제하지 말고 `cy.readFile`로 기존 json을 읽어 body에 주입한다.

```ts
// ✅ public/data의 json을 그대로 사용
cy.readFile("public/data/xxx/list.empty.json").then((body) => {
  cy.intercept("GET", "/data/xxx/list.json", { body }).as("list");
});

// ✅ 로딩 시나리오는 delay 옵션으로
cy.intercept("GET", "/data/xxx/list.json", { delay: 2000, body }).as("list");
```

## 6. hover tooltip은 컬럼을 건드리면 사라진다

결과 표의 `resultCode` 컬럼은 테이블 컴포넌트가 **자동으로 hover tooltip을 붙여준다.** 그런데 에이전트가 "표시를 다듬어야지" 하고 컬럼에 커스텀 `cell` 함수를 추가하면, 그 자동 tooltip이 비활성화된다. 테스트는 통과시키려고 엉뚱한 방향(에러 메시지를 본문에 직접 노출)으로 코드를 바꿔버리기도 한다.

```ts
// ✅ 컬럼 정의는 최소한으로 — 그래야 자동 tooltip이 유지된다
{ accessorKey: "resultCode", header: "Result Status" }
```

검증은 셀의 표시 텍스트(`'SUCC'` / `'FAIL'`) 매칭 + hover 시 tooltip 노출로 한다. tooltip 내용을 본문에 끌어내리는 식으로 우회하지 않는다.

## 정리: 이 함정들의 공통점

여섯 개를 다시 보면 패턴이 하나다. **전부 "코드만 봐선 알 수 없고, 실제 렌더 결과를 봐야 아는 것"이다.**

- 셀이 20자에서 잘린다 → 컴포넌트 구현 디테일
- 섹션이 viewport 밖이다 → 레이아웃 런타임 동작
- 한 `it`에 상태가 샌다 → 프레임워크 + Redux의 실제 동작
- data-cy가 첫 `<p>`만 잡는다 → 마크업 구조
- fixture 경로 규칙 → 빌드/프로젝트 설정
- 컬럼 커스텀이 tooltip을 죽인다 → 테이블 컴포넌트 내부 동작

에이전트는 *그럴듯하게 추론*하지만, 추론으로는 이 간극을 못 메운다. 그래서 이건 "AI가 똑똑해지면 사라질 규칙"이 아니라, **우리 코드베이스가 실제로 어떻게 동작하는지에 대한 지식** — 즉 오래 남는 스킬 자산이다. (관련해서 [스킬 시스템을 어떻게 설계했는지](/posts/ai-agent-skill-system)도 정리해뒀다.)

AI에게 E2E를 맡길 거라면, 이 6가지를 룰로 먼저 주거나 — 최소한 생성된 테스트를 **반드시 한 번 실제로 돌려보고** 머지하자. "리뷰를 눈으로 통과했다"는 E2E에선 통과의 근거가 못 된다.
