---
title: "브라우저에서 비밀값을 디코딩한다는 것 — base64, atob, TextDecoder, Web Crypto"
date: "2026-06-05"
summary: "쿠버네티스 Secret 뷰어를 만들며 마주친 질문 — 백엔드가 내려준 base64를 브라우저는 어떻게 푸는가, atob의 비트 재조립과 Latin-1 함정, 화면 마스킹이 보안이 아닌 이유, 그리고 진짜 암호화인 Web Crypto까지 정리했다."
category: "Frontend"
tags:
  - Browser
  - Web API
  - base64
  - Web Crypto
  - Security
featured: false
---

# 브라우저에서 비밀값을 디코딩한다는 것

쿠버네티스 Secret을 다루는 화면을 만들 때, 백엔드가 내려주는 값은 평문이 아니라 base64 문자열이다. 화면에 그대로 뿌리면 `czNjcjN0` 같은 글자가 보이니, 프론트엔드에서 사람이 읽을 수 있는 형태로 되돌려야 한다. 실제로 쓰던 유틸 함수는 이렇게 생겼다.

```ts
// base64 안전 decode — 실패 시 원본 반환
export const safeAtob = (s: string) => {
  if (!s) return '';
  try {
    return typeof atob !== 'undefined'
      ? atob(s)                                       // 브라우저
      : Buffer.from(s, 'base64').toString('utf-8');   // 서버(SSR)
  } catch {
    return s;
  }
};

// 평문 → mask 문자열 (개행 보존)
export const maskString = (s: string) => s.replace(/[^\n]/g, '•');
```

짧지만 이 안에는 생각보다 많은 개념이 들어 있다. 브라우저가 base64를 어떻게 푸는지, 왜 `atob`만으로는 한글이 깨지는지, `maskString`으로 가린 값이 정말 안전한지, 그리고 진짜로 값을 보호하려면 무엇을 써야 하는지. 이 글은 그 질문들을 차례로 정리한다.

이 글은 백엔드 관점에서 "base64는 암호화가 아니다"를 다룬 [Kubernetes Secret — Encoded와 Encrypted의 차이](/posts/k8s-secret)의 프론트엔드 짝꿍이다.

---

## 인코딩과 암호화는 다른 일이다

가장 먼저 구분해야 할 것은 **디코딩(decode)** 과 **복호화(decrypt)** 다. 둘 다 "되돌린다"는 점은 같지만 성격이 정반대다.

| | 디코딩 (decode) | 복호화 (decrypt) |
|---|---|---|
| 대상 | base64, URL, UTF-8 같은 **인코딩** | AES, RSA 같은 **암호화** |
| 되돌리는 데 필요한 것 | 규칙(알파벳 표)만 알면 됨 | 비밀 **키**가 있어야 함 |
| 키 | 없음 | 필수 |
| 보안 효과 | **없음** (누구나 되돌림) | 있음 (키 없으면 불가능) |

base64는 "암호화처럼 생긴 글자" 때문에 자주 오해받지만, 실제로는 **바이너리를 텍스트로 안전하게 실어 나르는 포장**일 뿐이다. 키가 없으니 누구나 푼다. 그래서 `safeAtob`이 하는 일은 "비밀을 해독"하는 게 아니라 "포장을 벗기는" 것에 가깝다.

---

## base64는 왜 4글자가 3바이트인가

base64는 데이터를 64개의 안전한 글자(`A-Z`, `a-z`, `0-9`, `+`, `/`)로만 표현한다. 글자 하나가 표현할 수 있는 경우의 수가 64가지이므로, 한 글자는 정확히 **6비트**(2의 6승 = 64)를 담는다.

컴퓨터의 데이터는 8비트(1바이트) 단위인데 base64는 6비트 단위라, 둘의 최소공배수인 24비트에서 딱 맞아떨어진다.

```text
base64 4글자 × 6비트 = 24비트 = 8비트 × 3 = 3바이트
```

그래서 base64는 항상 4글자씩 묶여 3바이트로 디코드된다. 데이터가 3의 배수로 안 떨어지면 남는 자리를 `=`로 채우는데, 이게 패딩이다.

---

## atob은 무엇을 하나 — 6비트를 8비트로 재조립

`atob`은 브라우저(와 최신 Node)에 내장된 전역 함수다. 이름은 ASCII to binary의 줄임말이다. 내부에서 하는 일은 암호 해독이 아니라 **비트를 다시 끊는 것**뿐이다.

1. base64 글자를 알파벳 표의 인덱스(`A`=0, `B`=1, …, `/`=63)로 바꾼다.
2. 각 인덱스를 6비트로 편다.
3. 그 비트열을 8비트씩 다시 끊으면 원래 바이트가 나온다.

`TWFu`를 예로 들면 다음과 같다.

```text
글자:   T        W        F        u
인덱스: 19       22       5        46
6비트:  010011   010110   000101   101110     ← base64 기준으로 끊기

이어붙인 비트열:  010011 010110 000101 101110
8비트로 다시 끊기: 01001101 01100001 01101110  ← 바이트 기준으로 끊기
바이트:           0x4D     0x61     0x6E
글자:             M        a        n
```

여기에 비밀 키가 전혀 없다는 점이 핵심이다. 규칙만 알면 누구나 같은 절차로 되돌릴 수 있다. 보안 효과가 0인 이유가 이 그림에 그대로 드러난다.

---

## atob의 함정 — Latin-1이라 한글이 깨진다

`atob`은 디코드한 결과를 **"바이너리 문자열"**, 즉 각 글자의 코드포인트가 0~255인 Latin-1 문자열로 돌려준다. 영문/숫자 비밀번호처럼 ASCII 범위라면 문제가 없다. 그러나 한글이나 이모지처럼 **UTF-8 멀티바이트** 값은 깨진다.

`비밀`이라는 글자는 UTF-8로 6바이트인데, `atob`은 이 6바이트를 한 글자씩 Latin-1로 해석해 버린다. 글자를 다시 조립하지 못한다.

해결책은 디코드된 바이트를 직접 받아서 `TextDecoder`로 UTF-8로 재조립하는 것이다.

```js
// 1. base64 → 바이트 배열
const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
// 2. 바이트 → UTF-8 문자열
const text = new TextDecoder('utf-8').decode(bytes);
```

`atob`이 만든 Latin-1 문자열의 각 글자를 `charCodeAt(0)`로 바이트 값(0~255)으로 되돌린 다음, 그 바이트열을 `TextDecoder`가 UTF-8 규칙으로 다시 해석한다. 멀티바이트가 정상적으로 복원된다.

> 앞의 `safeAtob`은 브라우저 경로에서 bare `atob`을 쓰므로 엄밀히는 ASCII 전용이다. 멀티바이트 Secret까지 다뤄야 한다면 위의 `TextDecoder` 패턴으로 바꿔야 한다.

---

## 서버에서는 Buffer를 쓴다

`safeAtob`이 `typeof atob !== 'undefined'`로 분기하는 이유는, 같은 컴포넌트 코드가 **브라우저와 SSR(서버 사이드 렌더링) 양쪽에서 실행**되기 때문이다.

| 환경 | base64 → 텍스트 |
|---|---|
| 브라우저 | `atob(s)` (+ `TextDecoder`) |
| 서버(Node) | `Buffer.from(s, 'base64').toString('utf-8')` |

`Buffer`는 Node.js에만 있는 바이트 처리 클래스이고, `'utf-8'` 변환을 한 줄로 해주므로 서버 경로는 멀티바이트도 정확하다. 브라우저에는 `Buffer`가 없고, Node에는 `window`나 (구버전에선) `atob`이 없을 수 있어서 환경별로 도구를 고르는 것이다. 이 "같은 코드가 두 환경에서 도는" 구조는 [JavaScript는 어디서 실행되는가](/posts/js-engine-vs-runtime)에서 더 깊게 다룬다.

---

## 화면에서 가리기 — maskString vs input type=password

디코드한 값을 화면에 바로 노출하면 어깨너머로 훔쳐볼 수 있으니, 기본은 가려두고 사용자가 "Reveal"을 눌렀을 때만 보여준다. 가리는 방법은 크게 두 가지다.

```ts
// 방법 A: 값 자체를 점으로 치환
const displayed = revealed ? decoded : maskString(decoded);
```

```html
<!-- 방법 B: 브라우저 렌더링 단계에서 가림 -->
<input type="password" value="s3cr3t" />
```

둘은 의도는 같지만 **가리는 메커니즘이 다르다.**

| | `input type="password"` | `maskString` |
|---|---|---|
| 가리는 위치 | 브라우저 렌더링 단계(시각적으로 점 표시) | 문자열 자체를 점으로 치환 |
| 진짜 값 위치 | `input.value`에 그대로 살아 있음 | 가린 텍스트엔 원본이 없음(Reveal 시 교체) |
| 복사하면 | 진짜 값이 복사됨 | 점이 복사됨 |
| 노출 방법 | DevTools에서 `type`을 `text`로 바꾸면 바로 보임 | reveal 상태를 켜야 보임 |
| 여러 줄 | 불가(한 줄 전용) | 가능(개행 보존, 인증서 등에 유리) |

`maskString`이 `\n`을 보존하는 이유가 여기 있다. 인증서처럼 여러 줄짜리 값의 줄 모양을 유지하면서 가릴 수 있다.

### 다만, 둘 다 보안은 아니다

중요한 점은 어느 쪽이든 **프론트엔드 마스킹은 보안 장치가 아니라는 것**이다. 진짜 값은 이미 네트워크 응답(Network 탭)과 JS 메모리(`decoded` 변수)에 평문으로 존재한다. 마스킹은 "어깨너머 훔쳐보기 방지"라는 UX일 뿐이고, 작정한 사람은 응답을 직접 보거나 Reveal을 누르면 된다. 게다가 점의 개수가 글자 수와 같아 길이는 새어 나간다. 진짜로 숨기려면 값을 클라이언트로 내려보내지 않거나, 서버에서 권한을 검사해야 한다.

---

## 진짜로 보호하려면 — Web Crypto API

키 없이 되돌릴 수 있는 base64와 달리, **키가 있어야만 되돌릴 수 있는** 암호화가 진짜 보호다. 브라우저는 이걸 위해 `crypto.subtle`(Web Crypto API)을 내장으로 제공한다.

```text
window
  └─ crypto
       ├─ getRandomValues()   ← 랜덤 바이트 (동기)
       ├─ randomUUID()        ← UUID 생성 (동기)
       └─ subtle              ← 객체 하나, 암호 연산이 모여 있음
            ├─ digest()                 (해시: SHA-256 등)
            ├─ encrypt() / decrypt()    (AES-GCM 등)
            ├─ sign() / verify()        (서명)
            └─ generateKey() / importKey() / exportKey()
```

특징은 두 가지다. 모든 `subtle` 메서드는 **Promise를 반환**(비동기)하고, **보안 컨텍스트(HTTPS, localhost)에서만** 동작한다. `http://`나 `file://`로 열면 `crypto.subtle`은 `undefined`다.

사용 패턴은 언제나 "글자 → 바이트 → 연산 → 바이트 → 글자"다. 앞에서 본 `TextEncoder`/`TextDecoder`가 여기서 다시 쓰인다.

```js
// SHA-256 해시 (단방향, 되돌릴 수 없음)
const bytes = new TextEncoder().encode('hello');
const buf = await crypto.subtle.digest('SHA-256', bytes);
const hex = [...new Uint8Array(buf)]
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');
```

```js
// AES-GCM 암호화 → 복호화 (키가 있어야 가능)
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));

const ct = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv }, key, new TextEncoder().encode('secret'));

const pt = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv }, key, ct);     // 같은 key + iv 필요
const text = new TextDecoder().decode(pt);
```

여기서 `decrypt`는 키가 없으면 절대 성공하지 못한다. 그게 base64 디코딩과의 결정적 차이다. 참고로 보안상 취약한 MD5는 Web Crypto에 없다(외부 라이브러리가 필요하다).

---

## 덤 — 압축도 키 없이 풀린다

base64처럼 키가 필요 없는 또 하나의 변환은 압축이다. 브라우저는 `CompressionStream` / `DecompressionStream`으로 `gzip`, `deflate`를 지원한다. gzip된 데이터가 base64로 함께 와도 중간에 끼워 풀 수 있다.

```js
const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const stream = new Blob([bytes]).stream()
  .pipeThrough(new DecompressionStream('gzip'));
const text = await new Response(stream).text();
```

---

## 정리

- **인코딩(base64)과 암호화(AES)는 다르다.** 인코딩은 키 없이 누구나 되돌리므로 보안 효과가 없고, 암호화는 키가 있어야 되돌린다.
- `atob`은 base64 글자를 6비트 인덱스로 펴서 8비트 바이트로 재조립하는 **비트 재정렬**일 뿐이다. 키가 없다.
- `atob` 단독은 Latin-1이라 한글/이모지가 깨진다. `Uint8Array.from(atob(s), c => c.charCodeAt(0))` + `TextDecoder`가 UTF-8 안전 패턴이다.
- 같은 코드가 브라우저(`atob`)와 서버(`Buffer`)에서 돌기 때문에 환경 분기가 필요하다.
- 화면 마스킹(`maskString`, `type="password"`)은 메커니즘이 다르지만 **둘 다 보안이 아니다.** 진짜 값은 이미 클라이언트에 있다.
- 진짜 보호가 필요하면 `crypto.subtle`(Web Crypto)로 암호화하거나, 값을 애초에 클라이언트로 내려보내지 않는다.

값을 푸는 도구는 브라우저에 다 들어 있지만, "푼다"와 "지킨다"는 전혀 다른 문제다. base64가 풀린다는 사실 자체가, 그것이 보호 수단이 아니라는 증거다.

---

## 참고 문서

- [MDN — Window.atob()](https://developer.mozilla.org/en-US/docs/Web/API/Window/atob)
- [MDN — TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)
- [MDN — Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [MDN — SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
- [RFC 4648 — The Base16, Base32, and Base64 Data Encodings](https://datatracker.ietf.org/doc/html/rfc4648)
