---
title: "한 번도 돌지 않은 Supabase Keep-Alive — 조용히 꺼져 있던 댓글 기능 되살리기"
date: "2026-10-28"
summary: "Supabase 무료 프로젝트 일시정지를 막으려고 만든 Keep-Alive 워크플로우가 첫 실행부터 한 번도 성공하지 못했다. 원인은 GitHub Secret 누락이었고, 배포는 그 사이 계속 성공해서 댓글·반응·조회수가 몇 달간 조용히 꺼져 있었다. 원인을 찾은 과정과 재발 방지 장치를 정리했다."
category: "Trouble Shooting"
tags:
  - Supabase
  - GitHub Actions
  - Secrets
  - Debugging
  - CI/CD
featured: false
---

# 한 번도 돌지 않은 Supabase Keep-Alive

[정적 블로그에 동적 기능 더하기](/posts/static-blog-dynamic-features)에서 Supabase 무료 프로젝트의 일시정지를 막으려고 **GitHub Actions cron으로 주 2회 ping**을 보낸다고 썼다. 그런데 Actions 탭을 열어보니 Keep-Alive가 빨간불로 줄지어 있었다. 첫 실행부터 **단 한 번도 성공한 적이 없었다.**

더 큰 문제는 따로 있었다. 그 사이 블로그의 **댓글·반응·조회수가 전부 꺼져 있었는데**, 배포는 매번 초록불이었다. 아무도 몰랐다.

---

## 증상

- Supabase Keep-Alive 워크플로우가 매번 실패, 실행 시간은 5~8초
- 에러 메시지는 `Process completed with exit code 1.` 한 줄
- 배포 워크플로우(Deploy Next.js site to Pages)는 계속 성공
- Supabase 대시보드에서 프로젝트가 **Paused** 상태

실패가 몇 초 만에 끝난다는 건 네트워크 타임아웃이 아니라 **명령 자체가 바로 죽었다**는 신호다.

---

## 원인 1 — 시크릿 이름이 달랐다

처음 Keep-Alive 워크플로우는 이렇게 생겼다.

```yaml
- name: Ping comments function
  run: |
    curl -sf "${{ secrets.COMMENTS_API_URL }}?slug=ping" || exit 1
```

그런데 배포 워크플로우는 다른 이름을 쓰고 있었다.

```yaml
env:
  NEXT_PUBLIC_COMMENTS_API_URL: ${{ secrets.NEXT_PUBLIC_COMMENTS_API_URL }}
```

GitHub Actions에서 **존재하지 않는 시크릿은 에러가 아니라 빈 문자열**로 치환된다. 결국 실제로 실행된 명령은 `curl -sf "?slug=ping"`이었고 URL이 없으니 curl이 바로 실패했다. 5초 만에 끝나는 게 당연했다.

그래서 이름을 `NEXT_PUBLIC_COMMENTS_API_URL`로 맞췄다. 그런데도 계속 실패했다.

---

## 원인 2 — 시크릿이 아예 없었다

이름을 맞추면서 이렇게 생각했다. "배포가 성공하니까 `NEXT_PUBLIC_COMMENTS_API_URL`은 등록돼 있겠지." **이 추론이 틀렸다.**

확인 방법은 배포된 사이트 자체에 있었다. `NEXT_PUBLIC_` 접두사가 붙은 환경변수는 **빌드할 때 값이 JS 번들에 그대로 박힌다.** 그러니 배포된 포스트 페이지의 번들을 열어보면 빌드 당시 값을 알 수 있다.

```js
let s = "".replace(/\/comments$/, "/reactions")
```

API 주소가 들어가야 할 자리에 **빈 문자열 `""`** 이 박혀 있었다. 빌드할 때 시크릿 값이 비어 있었다는 뜻이다. 저장소의 Settings → Secrets and variables → Actions에 가보니 실제로 `This repository has no secrets.`라고 떠 있었다.

### 왜 배포는 성공했나

댓글 컴포넌트가 URL이 없을 때 **조용히 사라지도록** 만들어져 있었기 때문이다.

```tsx
const COMMENTS_API = process.env.NEXT_PUBLIC_COMMENTS_API_URL;

if (!COMMENTS_API) return null;
```

로컬 개발 중에 `.env`가 없어도 화면이 깨지지 않게 하려는 방어 코드였는데, 운영에서는 이게 **장애를 숨기는 코드**가 됐다. 빌드도 성공하고 페이지도 멀쩡히 뜨는데, 댓글 섹션만 없었다.

### 로컬 .env는 왜 상관없나

로컬에서는 `.env`에 값이 있으니 모든 게 잘 동작했다. 하지만 `.env`는 `.gitignore`에 들어 있어서 GitHub에 올라가지 않는다. GitHub Actions 빌드 서버에는 이 파일이 없고 **저장소의 Secrets에 따로 등록**해야 `${{ secrets.이름 }}`으로 꺼내 쓸 수 있다.

| 환경 | 값을 가져오는 곳 |
|------|------------------|
| 로컬 개발 | `.env`, `.env.local` |
| GitHub Actions | Settings → Secrets and variables → Actions → **Secrets** 탭 |

Variables 탭에 등록하면 `secrets.`로는 읽히지 않는다. 이름이 같아도 `vars.`로 읽어야 한다.

> `NEXT_PUBLIC_` 값은 어차피 클라이언트 번들에 노출되는 공개 엔드포인트라 진짜 비밀은 아니다. 그래도 공개 저장소의 워크플로우 파일에는 `${{ secrets.이름 }}`이라는 참조만 남고 값은 GitHub에만 저장되니, Secret으로 관리하는 편이 깔끔하다. 진짜 비밀인 service_role 키는 Supabase Edge Function 쪽에만 둔다.

---

## Supabase 프로젝트 복구

Keep-Alive가 한 번도 성공하지 못했고 댓글 기능도 꺼져 있었으니, Supabase에는 요청이 하나도 가지 않았다. 7일 뒤 프로젝트는 당연히 일시정지됐다.

정지 상태는 쉽게 확인할 수 있다. 프로젝트 호스트(`<project-ref>.supabase.co`)를 조회하면 **DNS 자체가 없다(NXDOMAIN).**

복구는 대시보드에서 프로젝트를 열고 **Resume project**를 누르면 된다. 몇 분 뒤 다시 응답한다. 데이터와 백업은 정지 중에도 그대로 보존된다.

> 복구 가능 기한은 프로젝트 페이지에 날짜로 표시된다("You can resume this project from the dashboard until ..."). 처음엔 "90일 지나면 끝"이라고 알고 있었는데, 실제 내 프로젝트에는 그보다 훨씬 넉넉한 기한이 적혀 있었다. 기억이나 블로그 글보다 **대시보드에 적힌 날짜**를 믿자.

---

## 함정 — Re-run jobs는 옛날 코드로 돈다

워크플로우를 고치고 푸시한 뒤, 실패한 실행에서 **Re-run jobs**를 눌렀다. 또 실패했다.

실행 화면을 보니 커밋이 수정 전 커밋으로 찍혀 있었다. **Re-run은 그 실행이 원래 돌았던 커밋으로 다시 돌린다.** 고친 워크플로우 파일은 쓰이지 않는다.

| 버튼 | 사용하는 코드 |
|------|---------------|
| Re-run jobs | 원래 실행됐던 시점의 커밋 |
| Run workflow | 지금 선택한 브랜치의 최신 커밋 |

고친 내용을 확인하려면 **Run workflow**를 써야 한다. 이 버튼은 워크플로우에 `workflow_dispatch` 트리거가 있어야 생기고 "All workflows" 화면에는 안 보인다. 왼쪽 사이드바에서 **워크플로우를 하나 골라야** 오른쪽 위에 나타난다.

---

## 해결 순서

1. Supabase 대시보드에서 프로젝트 Resume
2. GitHub 저장소 Secrets 탭에 `NEXT_PUBLIC_COMMENTS_API_URL` 등록
3. 배포 워크플로우를 Run workflow로 재실행해서 URL이 번들에 들어간 상태로 다시 빌드
4. Keep-Alive를 Run workflow로 실행해서 초록불 확인
5. 배포된 번들에 Supabase 주소가 들어갔는지 직접 확인

5번이 중요하다. 초록불만으로는 부족하다는 걸 이번에 배웠다.

---

## 재발 방지 — 시크릿이 없으면 빨간불로 멈추기

이번 사고의 본질은 **실패가 실패로 보이지 않았다**는 것이다. 그래서 두 워크플로우 모두 시크릿이 비어 있으면 명확한 에러로 멈추게 했다.

### 배포 워크플로우

빌드 전에 시크릿부터 확인한다. 의존성 설치보다 먼저 돌아서 시크릿이 없으면 몇 초 만에 실패한다.

```yaml
# 시크릿이 비어도 빌드는 성공하고 댓글·반응·조회수만 조용히 사라지므로 여기서 막는다
- name: Check Required Secrets
  env:
    NEXT_PUBLIC_COMMENTS_API_URL: ${{ secrets.NEXT_PUBLIC_COMMENTS_API_URL }}
  run: |
    if [ -z "$NEXT_PUBLIC_COMMENTS_API_URL" ]; then
      echo "::error::Missing GitHub Actions secret NEXT_PUBLIC_COMMENTS_API_URL."
      exit 1
    fi
```

`::error::`로 시작하는 줄은 GitHub Actions가 실행 요약의 Annotations에 그대로 띄워준다. 로그를 뒤질 필요 없이 실패 원인이 첫 화면에 보인다.

### Keep-Alive 워크플로우

같은 방식으로 시크릿을 먼저 확인하고 ping을 보낸다.

```yaml
- name: Ping comments function
  env:
    NEXT_PUBLIC_COMMENTS_API_URL: ${{ secrets.NEXT_PUBLIC_COMMENTS_API_URL }}
  run: |
    url="$NEXT_PUBLIC_COMMENTS_API_URL"

    if [ -z "$url" ]; then
      echo "::error::Missing GitHub Actions secret NEXT_PUBLIC_COMMENTS_API_URL."
      exit 1
    fi

    curl -fsS "${url}?slug=ping" >/dev/null
```

`${{ secrets.X }}`를 `run` 안에 직접 쓰지 않고 `env`로 넘긴 것도 의도한 것이다. 값이 셸 스크립트 문자열에 그대로 끼워 넣어지지 않아서 따옴표나 특수문자 때문에 스크립트가 깨질 일이 없다.

---

## 남은 주의점 — 60일 규칙

GitHub은 **공개 저장소에 60일 동안 활동이 없으면 예약(schedule) 워크플로우를 자동으로 비활성화**한다. 글을 한동안 안 쓰면 Keep-Alive가 멈추고 방문자도 없으면 Supabase가 다시 정지될 수 있다.

꾸준히 커밋하면 신경 쓸 일이 없다. 오래 쉬게 되면 GitHub이 미리 알림 메일을 보내니, 메일에 있는 버튼으로 다시 켜면 된다.

---

## 마치며

이번 일에서 얻은 교훈은 세 가지다.

1. **초록불은 "에러가 안 났다"는 뜻이지 "제대로 동작한다"는 뜻이 아니다.** 결과물을 직접 확인하자. 이번엔 배포된 번들의 `""` 하나가 모든 걸 설명했다.
2. **조용한 폴백은 운영에서 장애를 숨긴다.** 로컬 편의를 위한 `return null`이 몇 달짜리 장애를 가렸다. 필수 설정은 CI에서 빨간불로 막자.
3. **추론보다 확인이 싸다.** "배포가 되니까 시크릿은 있겠지"라는 가정 하나 때문에 한 바퀴를 더 돌았다. Settings 페이지를 여는 데는 10초면 충분했다.

> 지금 이 글 아래의 댓글·리액션·조회수가 보인다면, 이 수정이 잘 동작하고 있다는 뜻이다.
