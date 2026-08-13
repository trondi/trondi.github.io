# Tistory Five-Post Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Tistory posts 19, 20, 21, 22, and 29 into five original, technically current, independently useful React/TypeScript guides and publish them at their existing URLs.

**Architecture:** Use local HTML draft files as the reviewable source of truth, then transfer one completed article at a time into the authenticated Tistory editor. Each post passes local structural checks, Tistory preview checks, and a post-publication DOM check before work begins on the next post; post 29 is the pilot.

**Tech Stack:** Tistory editor, Codex in-app browser, HTML5 article markup, React 19.2 documentation, Vite 8.1.5 documentation, TypeScript TSConfig documentation, Git.

## Global Constraints

- Preserve the existing public URLs `https://trond-soo.tistory.com/19`, `/20`, `/21`, `/22`, and `/29`.
- Keep all five posts public unless a preview or post-publication verification fails and cannot be repaired safely.
- Replace lecture-note wording and outdated Create React App instructions with original explanations and runnable examples.
- Use official React, Vite, npm, Node.js, and TypeScript documentation as technical sources; do not paraphrase other blogs.
- State the documentation date as `2026-07-19` where version-specific requirements appear.
- For Vite 8.1.5 guidance, state the documented Node.js requirement exactly as `20.19+ 또는 22.12+`.
- Every post must have one search intent, one runnable minimum example, one expected result, and at least one failure case or caution.
- Do not save a Tistory edit when preview shows missing text, malformed code blocks, broken heading hierarchy, or an incorrect title.
- Back up each original title, category, tags, and body before changing it.
- Stage and commit only files under `docs/superpowers/tistory-five-posts/`; preserve all unrelated working-tree changes.
- Tistory saves are externally visible and are authorized by the user's instruction to proceed with the approved plan.

---

## File Map

- `docs/superpowers/tistory-five-posts/originals/19.md`: backup of post 19 before editing.
- `docs/superpowers/tistory-five-posts/originals/20.md`: backup of post 20 before editing.
- `docs/superpowers/tistory-five-posts/originals/21.md`: backup of post 21 before editing.
- `docs/superpowers/tistory-five-posts/originals/22.md`: backup of post 22 before editing.
- `docs/superpowers/tistory-five-posts/originals/29.md`: backup of post 29 before editing.
- `docs/superpowers/tistory-five-posts/drafts/19.html`: publishable HTML for the React component guide.
- `docs/superpowers/tistory-five-posts/drafts/20.html`: publishable HTML for the Vite setup guide.
- `docs/superpowers/tistory-five-posts/drafts/21.html`: publishable HTML for the development-server troubleshooting guide.
- `docs/superpowers/tistory-five-posts/drafts/22.html`: publishable HTML for the structure, CSS, and build guide.
- `docs/superpowers/tistory-five-posts/drafts/29.html`: publishable HTML for the TypeScript null-safety guide.
- `docs/superpowers/tistory-five-posts/qa.md`: pre-publication and post-publication checks for all five posts.

## Shared Article Contract

Every draft must begin with one introductory `<p>`, followed by the exact article-specific `<h2>` sequence defined in its task. The runnable example must use `<pre><code class="language-jsx">` or `<pre><code class="language-tsx">`; shell commands use `language-bash` and configuration uses `language-json`. The final two sections must be `정리` and `참고 문서`, and official references must be rendered as an unordered list of descriptive links rather than bare URLs.

---

### Task 1: Back Up the Five Existing Posts

**Files:**
- Create: `docs/superpowers/tistory-five-posts/originals/19.md`
- Create: `docs/superpowers/tistory-five-posts/originals/20.md`
- Create: `docs/superpowers/tistory-five-posts/originals/21.md`
- Create: `docs/superpowers/tistory-five-posts/originals/22.md`
- Create: `docs/superpowers/tistory-five-posts/originals/29.md`
- Create: `docs/superpowers/tistory-five-posts/qa.md`

**Interfaces:**
- Consumes: authenticated access to `https://trond-soo.tistory.com/manage/posts` and public posts 19, 20, 21, 22, 29.
- Produces: one restorable Markdown record per original post plus a QA ledger used by Tasks 2-7.

- [ ] **Step 1: Record the original state of post 29**

Create `originals/29.md` with the exact title, category, tags, public status, editor URL, and complete original body read from the Tistory editor. Use this header:

```markdown
# Post 29 Original

- URL: https://trond-soo.tistory.com/29
- Editor: https://trond-soo.tistory.com/manage/newpost/29?type=post
- Title: [ React ] null값 허용하기
- Category: Typescript
- Visibility: 공개
- Tags: React, strictNullChecks, null허용, tsconfig.json

## Original Body
```

- [ ] **Step 2: Record posts 19, 20, 21, and 22**

Create the remaining four files with the same fields and the exact current title/body. Their expected current titles are:

```text
19: [ 생활 코딩 - react ] 1. React에 대해서..
20: [ 생활 코딩 - react ] (2) 개발 환경 구축
21: [ 생활 코딩 - react ] (3) 샘플 웹앱 실행
22: [ 생활 코딩 - react ] (4) JS 코딩하는 법 / CSS 수정 / 배포(build, 서비스 시 용량 줄이기)
```

- [ ] **Step 3: Initialize the QA ledger**

Create `qa.md` with a five-row table and all checks initially unchecked:

```markdown
# Tistory Five-Post QA

| Post | Backup | Official sources | Unique intent | Runnable example | Failure case | Preview | Published DOM | Links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 29 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 19 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 20 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 21 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 22 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
```

- [ ] **Step 4: Verify the backup set**

Run:

```bash
for id in 19 20 21 22 29; do test -s "docs/superpowers/tistory-five-posts/originals/$id.md" || exit 1; done
rg -n "^## Original Body$" docs/superpowers/tistory-five-posts/originals/*.md
```

Expected: five non-empty files and five `Original Body` matches.

- [ ] **Step 5: Mark backup checks and commit**

Change the `Backup` cell for all five rows to `[x]`, then run:

```bash
git add docs/superpowers/tistory-five-posts/originals docs/superpowers/tistory-five-posts/qa.md
git commit -m "docs: back up five tistory posts"
```

Expected: one commit containing only the backup files and QA ledger.

---

### Task 2: Rewrite and Publish Post 29 as the Pilot

**Files:**
- Create: `docs/superpowers/tistory-five-posts/drafts/29.html`
- Modify: `docs/superpowers/tistory-five-posts/qa.md`
- Modify externally: `https://trond-soo.tistory.com/manage/newpost/29?type=post`
- Verify externally: `https://trond-soo.tistory.com/29`

**Interfaces:**
- Consumes: `originals/29.md`, TypeScript `strictNullChecks` docs, React `useState` docs.
- Produces: public post 29 and the validated HTML conventions reused for posts 19-22.

- [ ] **Step 1: Write the exact article frame**

Set the title to:

```text
[TypeScript/React] null 타입 오류 해결 — strictNullChecks를 끄기 전에
```

Write `drafts/29.html` with these exact `h2` sections in order:

```text
null 타입 오류가 발생하는 이유
권장 방법: null을 타입에 명시하기
React useState에서 null 처리하기
null을 검사한 뒤 사용하는 방법
옵셔널 체이닝과 기본값
strictNullChecks를 끄면 생기는 변화
non-null assertion을 주의해야 하는 이유
정리
참고 문서
```

- [ ] **Step 2: Include the runnable React/TypeScript example**

Include this complete code block:

```tsx
import { useState } from 'react';

type User = {
  id: number;
  name: string;
};

export default function UserProfile() {
  const [user, setUser] = useState<User | null>(null);

  if (user === null) {
    return (
      <button onClick={() => setUser({ id: 1, name: 'Trond' })}>
        사용자 불러오기
      </button>
    );
  }

  return <p>{user.name}</p>;
}
```

Explain that the first render shows a button and the click changes the state to `User`, after which `user.name` is safe. Include `user?.name ?? '사용자 정보 없음'` as a shorter display-only alternative and explain why `user!.name` adds no runtime check.

- [ ] **Step 3: Add the configuration comparison and official sources**

Include both configurations and clearly recommend the first:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true
  }
}
```

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": false
  }
}
```

Link only these technical sources in the reference section:

```text
https://www.typescriptlang.org/tsconfig/strictNullChecks.html
https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#null-and-undefined
https://react.dev/reference/react/useState
```

- [ ] **Step 4: Run the local content checks**

Run:

```bash
test "$(rg -c '<h2>' docs/superpowers/tistory-five-posts/drafts/29.html)" -eq 9
rg -n "User \| null|strictNullChecks|user\?\.name|user!\.name|typescriptlang.org|react.dev" docs/superpowers/tistory-five-posts/drafts/29.html
! rg -n "생활코딩|인프런|출처 *:" docs/superpowers/tistory-five-posts/drafts/29.html
```

Expected: nine headings, all required concepts found, and no lecture/source-note wording.

- [ ] **Step 5: Transfer the title and HTML into Tistory**

Open the post 29 editor, select HTML mode, replace the title and full body with the validated draft, keep category `Typescript`, and set tags to exactly:

```text
TypeScript, React, strictNullChecks, null
```

Do not click `완료` until the next step passes.

- [ ] **Step 6: Preview and publish post 29**

In preview, verify one `h1`, nine `h2` headings, the TypeScript code block, two JSON blocks, and three official links. Confirm the text `strictNullChecks를 끄기 전에` is in the title. Then save as public.

- [ ] **Step 7: Verify the public page and commit**

Open `https://trond-soo.tistory.com/29` and verify the title, all nine section headings, `User | null`, and the three official links. Mark every post 29 QA cell `[x]`, then run:

```bash
git add docs/superpowers/tistory-five-posts/drafts/29.html docs/superpowers/tistory-five-posts/qa.md
git commit -m "docs: rewrite tistory post 29"
```

Expected: post 29 is public at the original URL and the commit contains only its draft and QA update.

---

### Task 3: Rewrite and Publish Post 19

**Files:**
- Create: `docs/superpowers/tistory-five-posts/drafts/19.html`
- Modify: `docs/superpowers/tistory-five-posts/qa.md`
- Modify externally: `https://trond-soo.tistory.com/manage/newpost/19?type=post`
- Verify externally: `https://trond-soo.tistory.com/19`

**Interfaces:**
- Consumes: the post 29 HTML conventions, React props/state documentation.
- Produces: a standalone React component guide and links to posts 20 and 29.

- [ ] **Step 1: Draft the article with a unique search intent**

Set the title to:

```text
[React] 컴포넌트·props·state를 하나의 예제로 이해하기
```

Use these exact `h2` sections:

```text
React 컴포넌트가 필요한 이유
이번에 만들 예제
props로 부모의 값을 전달하기
state로 바뀌는 값을 기억하기
컴포넌트를 나누는 기준
자주 하는 실수
정리
참고 문서
```

- [ ] **Step 2: Include the complete component example**

Include this code and explain that `name` is read-only input while `count` is local memory changed by user interaction:

```jsx
import { useState } from 'react';

function CounterCard({ name }) {
  const [count, setCount] = useState(0);

  return (
    <section>
      <h2>{name}의 카운터</h2>
      <p>현재 값: {count}</p>
      <button onClick={() => setCount(count + 1)}>1 증가</button>
    </section>
  );
}

export default function App() {
  return (
    <main>
      <CounterCard name="첫 번째" />
      <CounterCard name="두 번째" />
    </main>
  );
}
```

The expected result must state that the two counters change independently. The failure section must cover direct prop mutation and calling `count++` instead of the setter.

- [ ] **Step 3: Add internal and official links**

Link to post 20 for environment setup, post 29 for typed nullable state, and these official references:

```text
https://react.dev/learn/passing-props-to-a-component
https://react.dev/reference/react/useState
https://react.dev/learn/thinking-in-react
```

- [ ] **Step 4: Check, preview, publish, and verify**

Run:

```bash
test "$(rg -c '<h2>' docs/superpowers/tistory-five-posts/drafts/19.html)" -eq 8
rg -n "CounterCard|useState|setCount|trond-soo.tistory.com/20|trond-soo.tistory.com/29|react.dev" docs/superpowers/tistory-five-posts/drafts/19.html
! rg -n "생활 *코딩|1강|강의 필기" docs/superpowers/tistory-five-posts/drafts/19.html
```

Transfer the validated HTML through Tistory HTML mode, set category `Frontend/React`, set tags to `React, 컴포넌트, props, state`, preview all eight sections and the code block, save as public, and verify the same elements at `/19`.

- [ ] **Step 5: Mark QA and commit**

```bash
git add docs/superpowers/tistory-five-posts/drafts/19.html docs/superpowers/tistory-five-posts/qa.md
git commit -m "docs: rewrite tistory post 19"
```

---

### Task 4: Rewrite and Publish Post 20

**Files:**
- Create: `docs/superpowers/tistory-five-posts/drafts/20.html`
- Modify: `docs/superpowers/tistory-five-posts/qa.md`
- Modify externally: `https://trond-soo.tistory.com/manage/newpost/20?type=post`
- Verify externally: `https://trond-soo.tistory.com/20`

**Interfaces:**
- Consumes: Vite 8.1.5 getting-started documentation.
- Produces: a new-project setup guide and links to posts 19, 21, and 22.

- [ ] **Step 1: Draft the Vite setup article**

Set the title to:

```text
[React] Vite로 개발환경 만들기 — 설치·실행·폴더 확인
```

Use these exact `h2` sections:

```text
준비 사항
React 프로젝트 생성하기
개발 서버 실행하기
생성된 폴더 확인하기
자주 발생하는 설치 오류
Create React App 대신 Vite를 사용하는 이유
정리
참고 문서
```

- [ ] **Step 2: Include exact commands and expected result**

Include this command sequence:

```bash
node -v
npm -v
npm create vite@latest react-start -- --template react
cd react-start
npm install
npm run dev
```

State `Vite 8.1.5 공식 문서 기준 Node.js 20.19+ 또는 22.12+가 필요하다 (확인일: 2026-07-19).` Explain that the terminal prints a local URL, normally `http://localhost:5173`, but the port may change if occupied.

- [ ] **Step 3: Add troubleshooting and references**

Cover these exact symptoms and actions:

```text
'node' 또는 'npm' 명령을 찾을 수 없음 → Node.js 설치 후 터미널 재실행
package.json을 찾을 수 없음 → cd react-start 후 현재 경로 확인
포트 5173 사용 중 → Vite가 제안하는 다음 포트 확인 또는 기존 프로세스 종료
```

Link to `https://vite.dev/guide/`, post 19 for components, post 21 for existing-project errors, and post 22 for builds.

- [ ] **Step 4: Check, preview, publish, verify, and commit**

Run:

```bash
test "$(rg -c '<h2>' docs/superpowers/tistory-five-posts/drafts/20.html)" -eq 8
rg -n "20\.19\+|22\.12\+|npm create vite@latest|npm run dev|vite.dev/guide" docs/superpowers/tistory-five-posts/drafts/20.html
! rg -n "npm install -g create-react-app|npx install -g|생활 *코딩" docs/superpowers/tistory-five-posts/drafts/20.html
```

Set category `Frontend/React`, tags `React, Vite, Node.js, npm`, preview all eight sections and the command block, save as public, verify `/20`, mark QA, and commit:

```bash
git add docs/superpowers/tistory-five-posts/drafts/20.html docs/superpowers/tistory-five-posts/qa.md
git commit -m "docs: rewrite tistory post 20"
```

---

### Task 5: Rewrite and Publish Post 21

**Files:**
- Create: `docs/superpowers/tistory-five-posts/drafts/21.html`
- Modify: `docs/superpowers/tistory-five-posts/qa.md`
- Modify externally: `https://trond-soo.tistory.com/manage/newpost/21?type=post`
- Verify externally: `https://trond-soo.tistory.com/21`

**Interfaces:**
- Consumes: a Vite project with `dev`, `build`, and `preview` scripts.
- Produces: an existing-project execution and diagnosis guide that links to posts 20 and 22.

- [ ] **Step 1: Draft the troubleshooting article**

Set the title to:

```text
[React] 개발 서버 실행·종료와 자주 발생하는 npm 오류 해결
```

Use these exact `h2` sections:

```text
기존 React 프로젝트 실행 순서
package.json의 scripts 확인하기
개발 서버를 안전하게 종료하기
Missing script 오류
모듈을 찾을 수 없는 오류
포트 충돌과 잘못된 작업 폴더
의존성 설치를 다시 해야 하는 경우
정리
참고 문서
```

- [ ] **Step 2: Include commands and safe recovery boundaries**

Include:

```bash
cd project-folder
npm install
npm run dev
```

Show this exact script example:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

Explain `Ctrl+C` for shutdown. For recovery, instruct the reader to inspect the first error before deleting anything; only show `rm -rf node_modules && npm install` as a macOS/Linux option and `Remove-Item -Recurse -Force node_modules; npm install` as a PowerShell option after confirming the project has a valid lockfile.

- [ ] **Step 3: Check, preview, publish, verify, and commit**

Run:

```bash
test "$(rg -c '<h2>' docs/superpowers/tistory-five-posts/drafts/21.html)" -eq 9
rg -n "Missing script|package.json|npm install|npm run dev|Ctrl\+C|node_modules" docs/superpowers/tistory-five-posts/drafts/21.html
! rg -n "npm run start|생활 *코딩|샘플 웹앱" docs/superpowers/tistory-five-posts/drafts/21.html
```

Set category `Frontend/React`, tags `React, npm, Vite, 오류해결`, preview nine sections and all platform-specific commands, save as public, verify `/21`, mark QA, and commit:

```bash
git add docs/superpowers/tistory-five-posts/drafts/21.html docs/superpowers/tistory-five-posts/qa.md
git commit -m "docs: rewrite tistory post 21"
```

---

### Task 6: Rewrite and Publish Post 22

**Files:**
- Create: `docs/superpowers/tistory-five-posts/drafts/22.html`
- Modify: `docs/superpowers/tistory-five-posts/qa.md`
- Modify externally: `https://trond-soo.tistory.com/manage/newpost/22?type=post`
- Verify externally: `https://trond-soo.tistory.com/22`

**Interfaces:**
- Consumes: the Vite project created in post 20 and execution model explained in post 21.
- Produces: a project-structure, CSS, and production-build guide linking to posts 20 and 21.

- [ ] **Step 1: Draft the structure and build article**

Set the title to:

```text
[React] 프로젝트 구조와 CSS 적용, production build 확인하기
```

Use these exact `h2` sections:

```text
Vite React 프로젝트 구조
index.html과 src/main.jsx의 연결
App.jsx 수정하기
CSS 파일 연결하기
개발 서버와 production build의 차이
빌드 결과를 preview로 확인하기
빌드와 CSS에서 자주 발생하는 오류
정리
참고 문서
```

- [ ] **Step 2: Include the complete file and command examples**

Show this tree:

```text
react-start/
├── index.html
├── package.json
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   └── App.css
└── public/
```

Include an `App.jsx` example that imports `./App.css`, plus this command sequence:

```bash
npm run build
npm run preview
```

Explain that Vite uses root `index.html` as the build entry and writes the production bundle to `dist` by default. State that `preview` is for local verification, not a production server.

- [ ] **Step 3: Add failure cases and sources**

Cover CSS path/case mismatch, build failure caused by the first reported source error, and broken assets under a nested deployment path. Link to:

```text
https://vite.dev/guide/
https://vite.dev/guide/build
https://vite.dev/guide/static-deploy
```

Also link to post 20 and post 21 where the flow naturally requires them.

- [ ] **Step 4: Check, preview, publish, verify, and commit**

Run:

```bash
test "$(rg -c '<h2>' docs/superpowers/tistory-five-posts/drafts/22.html)" -eq 9
rg -n "src/main\.jsx|App\.css|npm run build|npm run preview|dist|vite.dev/guide/build" docs/superpowers/tistory-five-posts/drafts/22.html
! rg -n "create-react-app|npm install -g serve|npx serve -s build|생활 *코딩" docs/superpowers/tistory-five-posts/drafts/22.html
```

Set category `Frontend/React`, tags `React, Vite, CSS, build`, preview nine sections, the file tree, code, and links, save as public, verify `/22`, mark QA, and commit:

```bash
git add docs/superpowers/tistory-five-posts/drafts/22.html docs/superpowers/tistory-five-posts/qa.md
git commit -m "docs: rewrite tistory post 22"
```

---

### Task 7: Cross-Link and Final Quality Audit

**Files:**
- Modify: `docs/superpowers/tistory-five-posts/qa.md`
- Verify externally: `https://trond-soo.tistory.com/19`
- Verify externally: `https://trond-soo.tistory.com/20`
- Verify externally: `https://trond-soo.tistory.com/21`
- Verify externally: `https://trond-soo.tistory.com/22`
- Verify externally: `https://trond-soo.tistory.com/29`

**Interfaces:**
- Consumes: five public rewritten posts and the complete QA ledger.
- Produces: a fully checked five-post cluster ready for the wider 45-post audit.

- [ ] **Step 1: Verify titles and unique search intents**

Confirm the public titles are exactly:

```text
19 [React] 컴포넌트·props·state를 하나의 예제로 이해하기
20 [React] Vite로 개발환경 만들기 — 설치·실행·폴더 확인
21 [React] 개발 서버 실행·종료와 자주 발생하는 npm 오류 해결
22 [React] 프로젝트 구조와 CSS 적용, production build 확인하기
29 [TypeScript/React] null 타입 오류 해결 — strictNullChecks를 끄기 전에
```

- [ ] **Step 2: Verify the internal link graph**

Check these required directed links:

```text
19 → 20, 29
20 → 19, 21, 22
21 → 20, 22
22 → 20, 21
29 → 19
```

Expected: every link returns the intended public post and no article contains a repeated generic link dump.

- [ ] **Step 3: Verify content integrity and originality signals**

For each public page, confirm one `h1`, the planned `h2` count, at least one code block, at least one failure/caution section, and working official references. Confirm none of these phrases remain:

```text
생활 코딩
생활코딩
1강
2강
3강
4강
출처 :
수정중
```

- [ ] **Step 4: Complete and validate the QA ledger**

All cells must be `[x]`. Run:

```bash
if rg -n '\[ \]' docs/superpowers/tistory-five-posts/qa.md; then exit 1; fi
for id in 19 20 21 22 29; do test -s "docs/superpowers/tistory-five-posts/drafts/$id.html" || exit 1; done
git diff --check -- docs/superpowers/tistory-five-posts
```

Expected: no unchecked cells, five non-empty drafts, and no whitespace errors.

- [ ] **Step 5: Commit the final QA result**

```bash
git add docs/superpowers/tistory-five-posts/qa.md
git commit -m "docs: verify tistory five-post rewrite"
```

Expected: the final commit contains only the completed QA ledger.

---

## Completion Evidence

The work is complete only when all of the following are available:

1. Five original-content backups in `originals/`.
2. Five validated HTML sources in `drafts/`.
3. A QA ledger with no unchecked cells.
4. Five public pages at their original URLs with the exact planned titles.
5. Browser verification showing the expected headings, code blocks, internal links, and official sources.
6. No changes to unrelated user files or Tistory posts.
