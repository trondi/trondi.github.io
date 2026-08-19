---
title: "폴더를 옮기는 데 사고가 났다 — 존 재구조화 세션에서 데인 것들"
date: "2026-06-22"
summary: "한 세션 동안 모노레포의 폴더/의존성 구조를 존(zone) 단위로 재정리했다. 단순한 git mv처럼 보이지만 repoint 스코프 누락, alias 이름 함정, zsh 단어분할, tsc 동시 실행 thrash까지 사고가 끊이지 않았다. 매 단계 tsc 에러 수를 baseline으로 두고 깨지면 되돌린 작업 일지."
category: "Project"
tags:
  - Refactoring
  - Architecture
  - Monorepo
  - Git
  - TypeScript
featured: false
---

# 폴더를 옮기는 데 사고가 났다

한 세션 동안 운영 중인 모노레포의 폴더/의존성 구조를 **존(zone) 단위**로 재정리했다. 목표는 단순하다. app 직속에는 도메인 존(docker/k8s) + shared + api + 라우트만 남기고, 공용은 전부 `shared/`로 모은다.

말로는 "폴더 좀 옮기는 작업"이지만, 실제로는 사고가 끊이지 않았다. `git mv` 실패로 working tree가 깨지고, repoint 스코프를 잘못 잡아 tsc가 폭발하고, zsh 단어분할에 두 번 데였다. 이 글은 그 과정에서 **실제로 겪은 문제·삽질·해결·교훈**을 단계별로 정리한 일지다.

검증 기준은 하나로 고정했다. **app 스코프 `tsc --noEmit` 에러 수.** baseline 59를 잡고, 매 폴더 이동 후 59가 유지되면 커밋, 깨지면 되돌렸다. (마지막 단계에서 숨은 버그를 고쳐 59 → 54가 됐다)

> 이 세션의 마지막 단계인 host 역의존 제거(주입)는 설계가 무거워서 따로 떼어 [공유 화면이 다른 도메인을 직접 import하고 있었다 — 의존성 역전으로 역의존 끊기](/posts/reverse-dependency-injection-refactor)에 정리했다. 여기서는 그 단계도 "경험" 관점으로만 짧게 다룬다.

---

## 공통 작업 패턴 (시행착오로 다듬어짐)

매 단계가 같은 5스텝을 반복했다. 이 패턴 자체가 사고를 겪으며 완성됐다.

1. **인벤토리** — `@alias`형과 `@/app/...`형 사용처를 **둘 다** 집계. 한쪽만 보면 과소집계된다.
2. **move-safety 스캔** — 버킷 밖으로 나가는 `../`, 동적 `import()`, 상대 JSON/CSS 참조를 확인.
3. **`git mv`** — 폴더 이동. 단, **목적지 디렉토리를 먼저 생성**한다.
4. **repoint** — Python으로 `@/app/X` → 새 경로 치환 + tsconfig alias 갱신. 스코프에 `cypress`까지 포함.
5. **tsc 검증(59 유지) → 폴더별 1커밋.**

전체 그림은 이렇다. app 직속에 뒤섞여 있던 폴더를 존 단위로 갈라 공용은 `shared/`로 모은다. 아래 탭으로 Before/After를 비교할 수 있다.

```diagram
zone-restructure-map
```

---

## P2 — k8s 슬라이스 vs 공용 분리

k8s/ 루트에 슬라이스(pod, node, deployment…)와 공용 버킷(components, util, types…)이 섞여 있었다. 공용 7버킷을 `k8s/shared/`로 모으는 작업이다. 버킷별 repoint 건수는 천차만별이었다 — types 144, util 123, **components 307**. 작은 것부터 폴더별 1커밋으로 옮겼다.

여기서 **상대경로 안전성 확인이 사고를 막았다.** 이동 전 util·components 안의 `../` import를 전수 스캔했더니 전부 버킷 내부 sibling(`./common`, `./BoxedSection`)이었다. 통째로 옮겨도 sibling 관계가 보존되므로 안전 — 그대로 진행해 무사고였다. 만약 `../../constants`처럼 버킷 밖으로 나가는 게 있었으면 깨졌을 것이다. **밖으로 나가는 `../`만 위험하다**는 걸 여기서 확립했다.

또 하나, `@k8s/types`(공용)만 옮기고 `@k8s/pod/types` 같은 **슬라이스 전용 type은 절대 안 건드렸다.** repoint가 슬라이스 경로를 오염시키지 않았는지 카운트로 검증했다(이동 후에도 슬라이스 type 110개 그대로).

곁가지로 배운 것 하나. 처음엔 커밋 제목에 `(P2-C1)` 같은 단계 태그를 붙였는데 "우리끼리만 아는 표기니 빼라"는 지적을 받았다. 이미 7커밋 한 뒤라 `git filter-branch`로 7커밋 메시지를 일괄 재작성해 제거했다(push 전이라 가능).

```bash
git filter-branch --msg-filter 'sed -E "s/ \(P2-C[0-9]+\)//"' <base>..HEAD
```

**커밋 메시지엔 내부 작업표기를 넣지 말 것.**

---

## P3 — app 직속 공용 → `app/shared/` (가장 사고가 많았던 단계)

이 세션에서 사고가 가장 많았고, 작업 패턴이 여기서 거의 완성됐다.

### 잘못된 첫 예측 → 비용 정정

처음엔 "이 폴더들은 `@components`·`@hooks` 같은 alias가 있으니 tsconfig alias만 바꾸면 끝, 싸다"고 봤다. 인벤토리해보니 틀렸다. alias형(`@constants`)보다 **물리경로형(`@/app/constants`)이 더 많이** 쓰이고 있었다.

| 폴더 | `@/app/X` repoint |
|---|---|
| store | 196 |
| types | 179 |
| hooks | 179 |
| util | 164 |
| constants | **766** |

alias만으론 안 되고 물리형 전부 repoint = P2급 churn이었다. 진행 전에 사용자에게 비용부터 정정했다. **"싸다"고 단정하지 말고 `@alias`·`@/app` 두 형태를 다 세본 뒤 판단할 것.**

### 겪은 사고 3건

**사고 1 — `git mv` 실패로 working tree 깨짐 (tsc 264).** `src/app/shared/`가 아직 없어서 `git mv`가 "No such file or directory"로 실패했다. 그런데 같은 스크립트의 Python repoint·tsconfig 수정은 그대로 실행돼, **소스는 새 경로를 가리키는데 파일은 안 옮겨진** 어긋난 상태가 됐다. `git restore src tsconfig.json`로 전부 되돌리고, `mkdir -p src/app/shared`를 먼저 한 뒤 재실행했다. → 목적지 디렉토리를 먼저 생성하고, mv 실패 시 후속 치환이 안 돌도록 가드(`git mv … || return`).

**사고 2 — repoint 스코프 누락 (tsc 274).** repoint를 `src/`만 돌렸는데 **`cypress/`가 `@/app/constants/...`를 219파일에서 참조**하고 있었다. cypress는 옛 경로 그대로 남아 tsc가 폭발했다. 전역(cypress 포함) repoint로 220건을 추가 치환해 복구했다. → repoint 스코프에 `cypress/` 등 **src 밖 전부**를 포함할 것. tsc는 cypress도 컴파일한다.

**사고 3 — 미이동 폴더의 deep 상대참조 (tsc 60, 딱 1건 초과).** `components/uPlot/tooltip/UPlotTooltip.tsx`가 `'../../../constants/uPlot'`을 깊은 상대경로로 참조하고 있었는데, `@/app/constants` 치환에 안 잡혔다. tsc가 정확히 1건을 짚어줘서 `@constants/uPlot` alias로 바꿨다. → 이동 폴더를 "밖에서 deep 상대경로"로 참조하는 곳은 치환이 못 잡으니 **tsc로 마무리**한다. 단, `docker/swarm/util → ../types`류는 슬라이스 자체 segment(오탐)라 절대 건드리면 안 된다.

### tsc 9개 동시 실행 thrash

백그라운드 tsc를 여러 번 띄우다 **tsc 프로세스가 9개** 동시에 돌며 CPU 경쟁이 붙었고, config 검증이 기어갔다. `pkill -f "tsc --noEmit"`로 전부 정리하고 경쟁 없는 단일 tsc로 재검증했다. **검증 tsc는 한 번에 하나.**

### alias 이름 함정

폴더 간 상대참조를 이동 전에 alias로 변환했는데, 여기서 alias 이름이 직관과 다른 함정이 있었다.

- types alias가 `@types`가 아니라 **`@ctypes`**
- common alias가 `@common`이 아니라 **`@statistics`·`@regi`** (`@common`은 `components/common`을 가리키는 별개)

**alias는 이름과 대상이 다를 수 있다.** 추측하지 말고 인벤토리로 확인해야 한다.

이 단계 결과로 app 직속이 `(private)·api·docker·k8s·shared` 5개만 남았다.

---

## P4a — `components·styles` → `app/shared/`

`components`엔 순수 공용(admin-panel·form·uPlot·common)과 도메인 결합(selectbox 일부·FlexSubModal·cluster)이 섞여 있었다. 전부 한 번에 깨끗이 분할하려면 판단이 크다. 그래서 2스텝으로 나눴다(사용자와 상의).

- **P4a**: `components`·`styles`를 통째로 `app/shared/`로 옮겨 app 직속부터 정리. 결합건은 `shared/components`에 known-debt로 안고 간다.
- **P4b**: selectbox 결합건만 도메인 존으로 추출.

구조 목표(app 직속 클린)를 P4a로 즉시 달성하고, 위험한 분할은 분리한 것이다. 여기서도 함정이 둘 있었다.

**함정 1 — `@common` alias도 같이 갱신.** `components`를 옮기면 두 alias를 동시에 고쳐야 했다. `@components/*`뿐 아니라 **`@common/*` → `./src/app/shared/components/common/*`** 까지. `@common`이 `components/common`을 가리킨다는 걸 모르면 놓치기 쉽다(P3에서 옮긴 app/common과는 완전히 다른 alias다).

**함정 2 — styles는 components와 함께 옮겨야 한다.** `styles/uplot.css`를 `components/uPlot/TimeSeries.tsx`가 `'../../styles/uplot.css'` 상대경로로만 참조하고 있었다. components만 옮기면 `../../styles`가 아직 없는 `shared/styles`를 가리켜 깨지고, styles만 옮겨도 깨진다. **둘 다 `shared/` 밑으로 한 커밋에** 옮겨야 상대경로가 맞아떨어진다.

교훈은 둘 다 한 줄로 요약된다. **이름이 비슷한 alias를 주의하고, 상대결합된 자원은 함께 이동한다.**

---

## P4b — 결합 selectbox 도메인 추출

공용 위치(`shared/components/selectbox`)에 있으나 도메인을 import하던 selectbox 7개를, 각 도메인 존으로 추출하는 작업이다(ConfigMap/Pvc/Secret → k8s, Stack 3종/Noti → docker).

여기서 무작정 옮기지 않은 게 핵심이다. **옮기면 그 selectbox의 사용처가 다른 존이 되어 오히려 새 cross-zone import를 만들 수 있기** 때문이다. 그래서 각 결합 selectbox의 **사용처를 존별로 먼저 집계**했다.

- ConfigMap/Pvc/Secret → k8s에서만 사용
- Stack 3종/Noti → docker에서만 사용

전부 단일 도메인 사용이라 자기 도메인으로 옮겨도 새 cross-zone import가 안 생긴다는 걸 확인하고 진행했다. **분할 전 사용처 집계** — 단일 도메인 사용이어야 분할이 깨끗하다.

반대로 옮길 수 없는 것도 명확히 가려냈다. `components/cluster`(docker 타입을 import하는데 docker·k8s 양쪽이 사용)와 `FlexSubModal`(host+pod+job 3개 도메인 동시 참조)은 단일 존으로 못 옮긴다. 이건 폴더 이동이 아니라 주입 리팩토링이 필요해서 known-debt로 문서화하고 보류했다.

### zsh 단어분할에 또 데임

`batch` 헬퍼에서 `names="$@"` 후 `for n in $names`를 했는데, **zsh는 unquoted 변수를 단어분할하지 않는다.** 파일명 3개가 통째로 한 인자가 되어 `git mv "src/.../ConfigMapSelectbox PvcSelectbox SecretSelectbox.tsx"`라는 없는 파일을 찾다 실패했다.

```bash
# ✗ zsh에선 단어분할 안 됨 → 파일명 3개가 한 인자로
names="$@"
for n in $names; do git mv ".../$n.tsx" ".../dest/"; done

# ✓ 배열 원소를 그대로 순회
for n in "$@"; do git mv ".../$n.tsx" ".../dest/"; done
```

다행히 첫 mv에서 멈춰 아무것도 안 옮겨졌다. 이 세션에서 zsh 단어분할로 **두 번** 데였다. **zsh 반복문은 `for n in "$@"` 또는 `${=var}`.**

---

## P6 — host 역의존 제거 (경험만)

host 목록 화면이 docker/k8s 공유인데 공유 구현이 `docker/host`에 있으면서 k8s 조각을 직접 import하는 **역의존 7건**이 있었다. 셸은 계약(`HostExtension`)만 두고 각 페이지가 자기 조각을 주입하도록 바꿔 7 → 0으로 끊었다.

설계·코드 상세는 [별도 글](/posts/reverse-dependency-injection-refactor)로 뺐고, 여기서는 경험 관점의 교훈 둘만 남긴다.

**"공유"라고 다 같지 않다.** host 분석 중 cluster도 동일 역의존인 걸 발견했는데, host는 한 방향 위주인 반면 cluster는 양방향에 공유 컨트롤러 6개로 훨씬 엉켜 있고 개발 중(PAN-1436)이었다. 지금 손대면 움직이는 표적과 충돌하니 host만 하고 cluster는 후속으로 합의했다. 결합의 방향성·개수·개발 중 여부로 난이도를 가늠하고, 위험한 건 분리한다.

**주입 도입 시 참조 안정성은 필수.** 옮기다 보니 숨어있던 pre-existing 버그(`K8S_HOST_LIST`가 선언 없이 4곳에서 참조 — 런타임 `undefined`)도 튀어나왔다. 별도 커밋으로 선언을 추가해 TS2551 5건을 해소하면서 baseline이 59 → 54가 됐다. 그리고 사용자의 "ext를 useMemo deps에 넣은 거야?"라는 질문 하나가 remount 회귀와 그 root cause(`useExcludeCntrConfig`의 `|| []`)까지 추적하는 단서가 됐다. (상세는 위 글)

---

## 전체 교훈

다음에 또 폴더를 옮길 때 그대로 들고 갈 체크리스트다.

1. 폴더 이동은 **목적지 디렉토리를 먼저 생성**하고, mv 실패 시 후속 치환이 안 돌게 가드한다.
2. repoint 스코프는 **cypress 등 src 밖 전부** 포함한다. tsc는 cypress도 본다.
3. 이동 폴더를 **밖에서 deep 상대경로로 참조**하는 곳은 alias 치환이 못 잡으니 **tsc로 마무리**한다.
4. 검증 **tsc는 한 번에 하나**. 동시 실행은 thrash를 부른다.
5. zsh 반복문은 **`for n in "$@"`**. unquoted 변수는 단어분할되지 않는다.
6. **alias는 이름과 대상이 다를 수 있다**(types→`@ctypes`, `@common`=components/common). 인벤토리로 확인한다.
7. **주입 도입 시 참조 안정성**(useCallback/useMemo)이 필수다.
8. 커밋은 잘게 — 폴더별 1커밋, 메시지엔 내부 단계표기를 넣지 않는다.

---

## 메모

이 세션에서 가장 크게 남은 건, **"기계적인 작업"일수록 검증 기준을 숫자 하나로 못박아야 한다**는 것이다. tsc 에러 수 59를 baseline으로 잡아두니, 사고가 나도 "지금 몇 건이지?"만 보면 됐다. 264로 튀면 무조건 되돌리고 원인을 찾았다. 이 단순한 가드가 없었으면 어디서 깨졌는지 추적하느라 훨씬 오래 헤맸을 것이다.

또 하나, **틀린 첫 예측을 빨리 정정하는 게 비용을 아낀다.** P3에서 "alias만 바꾸면 싸다"는 가정이 인벤토리 한 번으로 깨졌고, 그 덕에 766건짜리 작업을 "싼 줄 알고" 들어갔다가 중간에 엎는 일을 피했다. 옮기기 전에 두 형태(`@alias`/`@/app`)를 다 세보는 30분이, 잘못 들어간 작업을 되돌리는 몇 시간을 막는다.

폴더를 옮기는 일은 지루하지만, 의존 그래프를 단방향으로 되돌리는 작업이라 미루면 미룰수록 비싸진다. 그 끝에 있던 host 역의존 제거의 설계는 [다른 글](/posts/reverse-dependency-injection-refactor)에 적었다.
