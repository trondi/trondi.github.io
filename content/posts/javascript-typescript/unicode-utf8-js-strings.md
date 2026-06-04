---
title: "유니코드, UTF-8, 그리고 JavaScript 문자열 — 이모지 length가 2인 이유"
date: "2026-06-05"
summary: "atob이 한글을 깨뜨린 근본 원인을 따라간다. 문자에 번호를 매기는 유니코드, 번호를 바이트로 바꾸는 UTF-8, 내부적으로 UTF-16인 JavaScript 문자열의 관계와 거기서 생기는 length·slice 함정을 정리했다."
category: "JavaScript / TypeScript"
tags:
  - JavaScript
  - Unicode
  - UTF-8
  - String
  - Encoding
featured: false
---

# 유니코드, UTF-8, 그리고 JavaScript 문자열

[브라우저에서 비밀값을 디코딩한다는 것](/posts/browser-secret-decoding)에서 `atob`이 한글과 이모지를 깨뜨린다는 걸 봤다. 그 근본 원인은 "글자가 컴퓨터에서 어떻게 표현되는가"에 있다. 그리고 같은 뿌리에서 `"👍".length`가 `1`이 아니라 `2`로 나오는 그 유명한 함정도 자란다.

이 문제를 깔끔하게 풀려면 **세 층**을 분리해야 한다. 문자에 번호를 매기는 **유니코드**, 그 번호를 바이트로 바꾸는 **UTF-8**, 그리고 그 문자를 메모리에 담는 **JavaScript의 UTF-16**이다.

```text
글자 '가'
  │  ① 유니코드: 문자 → 코드포인트   →  U+AC00
  │  ② 인코딩(UTF-8): 코드포인트 → 바이트  →  EA B0 80 (3바이트)
  │  ③ JS 내부(UTF-16): 코드포인트 → 코드유닛 →  0xAC00 (1 유닛)
```

세 층을 차례로 본다.

---

## ① 유니코드 — 모든 문자에 번호를

유니코드는 세상의 모든 문자에 고유 번호를 부여한 표준이다. 이 번호를 **코드포인트(code point)**라 하고 `U+` 접두사로 쓴다.

```text
'A'  → U+0041
'가' → U+AC00
'👍' → U+1F44D
```

코드포인트의 범위는 U+0000 ~ U+10FFFF다. 이 중 U+0000 ~ U+FFFF를 **기본 다국어 평면(BMP)**이라 부르고, 한글·한자·대부분의 문자가 여기 있다. 이모지처럼 그 너머(U+10000 이상)에 있는 문자를 **보충 문자(supplementary)**라고 한다. 이 구분이 뒤에서 함정의 씨앗이 된다.

유니코드는 어디까지나 "문자 ↔ 번호" 대응표일 뿐, 그 번호를 바이트로 어떻게 저장할지는 정하지 않는다. 그건 인코딩의 몫이다.

---

## ② UTF-8 — 번호를 바이트로 (가변 길이)

UTF-8은 코드포인트를 바이트로 바꾸는 가장 널리 쓰이는 인코딩이다. 핵심은 **문자마다 바이트 수가 다른 가변 길이**라는 점이다.

| 코드포인트 범위 | 바이트 수 | 예 |
|---|---|---|
| U+0000 ~ U+007F (ASCII) | 1 | `A` → 41 |
| U+0080 ~ U+07FF | 2 | `é` → C3 A9 |
| U+0800 ~ U+FFFF | 3 | `가` → EA B0 80 |
| U+10000 ~ U+10FFFF | 4 | `👍` → F0 9F 91 8D |

ASCII는 1바이트라 영문/숫자는 옛 방식과 호환되고, 한글은 3바이트, 이모지는 4바이트다. UTF-8이 인터넷 표준 인코딩이 된 이유는 이 ASCII 호환성과 효율 때문이다.

여기서 `atob`의 함정이 설명된다. `atob`은 디코드 결과를 **바이트당 한 글자(Latin-1)**로 돌려준다. 한글 `가`는 UTF-8로 3바이트인데, `atob`은 이 3바이트를 각각 별개의 글자로 해석해 버린다. 그래서 글자가 깨진다. 바이트를 받아 `TextDecoder('utf-8')`로 다시 묶어야 정상 복원된다.

```js
// 깨짐: 3바이트를 글자 3개로 해석
atob(b64);
// 정상: 바이트열을 UTF-8 규칙으로 재조립
new TextDecoder('utf-8').decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
```

바이트를 직접 다루는 이야기는 [JavaScript는 어디서 실행되는가](/posts/js-engine-vs-runtime)의 Buffer/TypedArray 절과 이어진다.

---

## ③ JavaScript 문자열은 UTF-16이다 — 함정의 시작

JavaScript는 문자열을 내부적으로 **UTF-16**으로 다룬다. 단위는 16비트짜리 **코드유닛(code unit)**이다.

문제는 16비트로는 U+FFFF까지밖에 표현할 수 없다는 것이다. BMP 안의 문자(한글 포함)는 코드유닛 하나로 충분하지만, 이모지처럼 U+10000 이상인 문자는 **서로게이트 페어(surrogate pair)**라는 두 개의 코드유닛으로 쪼개서 표현한다.

그리고 `length`는 문자 수가 아니라 **코드유닛의 수**를 센다.

```js
"A".length    // 1  (BMP, 1 코드유닛)
"가".length   // 1  (BMP, 1 코드유닛)
"👍".length   // 2  ← 서로게이트 페어, 2 코드유닛!
```

`"👍".length`가 2인 건 버그가 아니라, "문자열 길이 = 코드유닛 수"라는 정의의 결과다.

### charCodeAt vs codePointAt

이 차이를 다루는 두 메서드가 있다.

```js
"👍".charCodeAt(0)   // 55357  ← 서로게이트의 절반(코드유닛)
"👍".codePointAt(0)  // 128077 ← 진짜 코드포인트 U+1F44D
```

- `charCodeAt`: 코드유닛(16비트) 하나를 본다. 이모지에선 반쪽만 나온다.
- `codePointAt`: 서로게이트 페어를 합쳐 진짜 코드포인트를 돌려준다.

### 반복(iteration)은 코드포인트 단위

`for...of`나 스프레드는 문자열을 코드포인트 단위로 순회한다. 그래서 `length`와 다른 결과가 나온다.

```js
"👍".length        // 2
[..."👍"].length   // 1  ← 코드포인트 단위
```

문자 개수를 제대로 세려면 `length`가 아니라 `[...str].length`를 쓰는 편이 안전하다.

---

## 실무 함정들

### 1. slice가 서로게이트를 반토막 낸다

`slice`/`substring`은 코드유닛 인덱스로 자른다. 서로게이트 페어 중간을 자르면 깨진 반쪽이 남는다.

```js
"a👍b".slice(0, 2)  // "a�"  ← 이모지의 절반만 잘림
```

### 2. 결합 문자와 grapheme

사람이 "한 글자"로 인식하는 단위(grapheme)는 코드포인트 하나가 아닐 수 있다. 가족 이모지처럼 여러 코드포인트가 ZWJ로 결합된 경우, `[...str].length`로도 여러 개로 센다. 진짜 "보이는 글자" 단위가 필요하면 `Intl.Segmenter`를 쓴다.

```js
const seg = new Intl.Segmenter("ko", { granularity: "grapheme" });
[...seg.segment("👨‍👩‍👧")].length   // 1 (보이는 글자 기준)
```

### 3. normalize — 같아 보이지만 다른 문자열

`é`는 단일 코드포인트(U+00E9)로도, `e` + 결합 악센트(U+0301)로도 표현된다. 보기엔 같아도 `===`는 false다. 비교 전에 `normalize()`로 정규화해야 한다.

```js
"é" === "é"                        // false
"é".normalize() === "é".normalize() // true
```

---

## 정리

- **세 층을 분리하라.** 유니코드(문자↔코드포인트), UTF-8(코드포인트↔바이트), JS 내부의 UTF-16(코드포인트↔코드유닛)은 서로 다른 일을 한다.
- UTF-8은 가변 길이(ASCII 1, 한글 3, 이모지 4바이트)다. `atob`이 멀티바이트를 깨는 건 결과를 Latin-1(바이트당 한 글자)로 보기 때문이고, `TextDecoder`가 정답이다.
- JS 문자열은 UTF-16이라 `length`는 **코드유닛 수**다. 이모지는 서로게이트 페어라 `length === 2`다.
- `charCodeAt`(코드유닛) vs `codePointAt`(코드포인트), `length` vs `[...str].length`(코드포인트), 그리고 보이는 글자 단위는 `Intl.Segmenter`.
- 보기엔 같은 문자열도 정규화(`normalize`)가 다르면 `===`로 다르다.

"글자"는 사람에겐 하나지만 컴퓨터에겐 번호이자 바이트이자 코드유닛이다. 이 셋이 다른 층이라는 걸 알면, 인코딩이 깨지는 거의 모든 상황이 같은 그림으로 설명된다.

---

## 참고 문서

- [MDN — UTF-8](https://developer.mozilla.org/en-US/docs/Glossary/UTF-8)
- [MDN — String.prototype.codePointAt()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/codePointAt)
- [MDN — Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)
- [The Absolute Minimum Every Software Developer Must Know About Unicode (Joel Spolsky)](https://www.joelonsoftware.com/2003/10/08/the-absolute-minimum-every-software-developer-absolutely-positively-must-know-about-unicode-and-character-sets-no-excuses/)
