---
title: "WebSocket 핸드셰이크 뜯어보기(draft-abarth-01부터 RFC 6455까지)"
date: "2026-10-26"
summary: "WebSocket 연결이 어떻게 평범한 HTTP에서 시작해서 양방향 채널로 바뀌는지, 그 핸드셰이크를 IETF 드래프트 draft-abarth-websocket-handshake-01과 최종 표준 RFC 6455를 비교하며 한 줄씩 분석했다."
category: "Frontend"
tags:
  - Network
  - Realtime
  - WebSocket
  - RFC
  - HTTP
featured: true
series: "실시간 웹 통신과 브라우저 런타임"
seriesOrder: 3
---

# WebSocket 핸드셰이크 뜯어보기(draft-abarth-01부터 RFC 6455까지)

WebSocket을 처음 보면 좀 이상하게 생겼다. 분명히 HTTP 요청으로 시작하는데 응답이 `200`이 아니라 `101 Switching Protocols`이고 `Sec-WebSocket-Key`라는 알 수 없는 키와 `Sec-WebSocket-Accept`라는 SHA-1 해시가 오간다. 핸드셰이크가 끝나면 같은 TCP 연결이 갑자기 HTTP가 아닌 무언가로 바뀌어 있다.

이 글은 그 어색한 모양이 왜 그렇게 생겼는지를, 두 문서를 나란히 놓고 분석한다.

- IETF 드래프트 [draft-abarth-websocket-handshake-01](https://www.ietf.org/archive/id/draft-abarth-websocket-handshake-01.html) (2010, Adam Barth)
- 최종 표준 [RFC 6455: The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455.html) (2011)

두 문서를 함께 보면 WebSocket이 왜 "HTTP 위에 얹힌 별도 프로토콜"이라는 어정쩡한 모양을 갖게 됐는지가 분명해진다.

---

## 왜 핸드셰이크가 필요한가

지금까지의 글에서 짚었듯, polling과 SSE는 HTTP 그대로다. 별도 핸드셰이크가 필요 없다. WebSocket은 사정이 다르다.

WebSocket이 풀어야 했던 문제는 이렇다.

1. **양방향**: 서버도 임의 시점에 메시지를 보낼 수 있어야 한다.
2. **메시지 단위**: 바이트 스트림이 아니라 메시지 경계를 가진 채로 주고받아야 한다.
3. **기존 인프라 통과**: 80/443 포트, 기존 프록시·방화벽·로드밸런서를 그대로 통과해야 한다.
4. **보안**: 브라우저에서 시작되는 만큼 cross-protocol 공격, cache poisoning, CSRF 같은 공격에 안전해야 한다.

3번 때문에 새 포트나 새 TCP 프로토콜을 만들 수 없었고 4번 때문에 "그냥 HTTP의 keep-alive를 길게 쓰자"로 끝낼 수도 없었다. 그래서 WebSocket은 **HTTP로 시작했다가 같은 TCP 연결을 다른 프로토콜로 갈아타는** 모양을 택했다. 이 갈아타는 절차가 핸드셰이크다.

---

## 두 단계로 본 WebSocket

WebSocket은 두 단계로 나뉜다.

```text
[1단계: Opening Handshake]   HTTP 형식의 요청과 응답
                              여기서 서버가 "OK, 이제 WebSocket으로 가자" 응답
                              ───────────────────────
[2단계: Data Framing]         같은 TCP 연결 위에서 자체 프레임 포맷
                              opcode, payload length, masking key, payload
```

이 글은 1단계, 핸드셰이크만 다룬다. 2단계 프레임은 [다음 글](/posts/websocket-browser-api)에서 다룬다.

---

## draft-abarth-websocket-handshake-01이라는 갈림길

WebSocket은 2009~2011년 사이 IETF에서 여러 드래프트를 거치며 모양이 잡혔다. 초기에는 Ian Hixie의 드래프트들이 있었고 거기서 핸드셰이크는 `Sec-WebSocket-Key1`, `Sec-WebSocket-Key2`라는 두 개의 키와 본문에 붙은 8바이트를 조합해 검증하는 꽤 기괴한 모양이었다. 보안 검토에서 여러 문제가 지적되면서 Adam Barth가 **보안을 다시 설계한 일련의 드래프트**를 제출한다. 그중 하나가 이 글에서 볼 `draft-abarth-websocket-handshake-01`이다.

흥미롭게도 **이 -01 드래프트는 RFC 6455와 상당히 다르다.** 표준은 이 드래프트의 보안 원칙은 받아들이되, 구체적인 모양은 더 평범하게 다듬어서 확정됐다.

네 가지가 핵심 차이다.

| | draft-abarth-01 (2010) | RFC 6455 (2011) |
|---|---|---|
| HTTP 메서드 | `CONNECT websocket.invalid:443` | `GET /chat` |
| 검증 알고리즘 | `HMAC-SHA1(key=nonce, data=GUID)` | `base64(SHA-1(key + GUID))` |
| 응답 상태 | `200 OK` | `101 Switching Protocols` |
| 메타데이터 전달 | `Sec-WebSocket-Metadata` 단일 헤더에 base64 masked metadata | `Sec-WebSocket-*` 여러 헤더로 분리 |

세부는 달라도, 두 문서가 공유하는 게 더 중요하다.

- **magic GUID** `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`
- **16바이트 nonce를 base64 인코딩한 클라이언트 키**
- **`Sec-` 접두 헤더로 브라우저 JavaScript의 위조를 막는다는 보안 원칙**

지금 우리가 코드에서 보는 모양은 RFC 6455 쪽이므로, 아래부터는 그 기준으로 분해한다. abarth 드래프트가 "왜 그런 모양이 필요했는지"의 사유를 제공했다고 이해하면 충분하다.

---

## RFC 6455 핸드셰이크: 클라이언트 요청

브라우저가 `new WebSocket("wss://example.com/chat")`를 실행하면 다음 요청이 나간다.

```text
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Origin: https://example.com
Sec-WebSocket-Protocol: chat, superchat
Sec-WebSocket-Extensions: permessage-deflate
```

한 줄씩 보자.

### GET + Upgrade + Connection

`GET`이고 HTTP/1.1 이상이어야 한다. 핵심은 두 헤더의 조합이다.

- `Upgrade: websocket`은 "이 연결을 websocket 프로토콜로 갈아탑시다."라는 뜻이다.
- `Connection: Upgrade`는 "이 Upgrade 헤더를 진지하게 받아들여라."라는 뜻이다.

HTTP 명세에 따르면 `Connection: Upgrade`가 빠지면 Upgrade 헤더는 hop-by-hop으로 처리되지 않는다. 둘이 함께 있어야 의미가 산다. 중간 프록시가 일반 HTTP 요청으로 오해하지 않게 하는 안전장치다.

### Sec-WebSocket-Key

```text
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
```

- 클라이언트가 **랜덤한 16바이트**를 생성한 뒤 base64로 인코딩한 값이다.
- 인증용이 아니다. **서버가 진짜로 WebSocket을 이해하는지 확인하는 챌린지** 역할이다.
- `Sec-` 접두로 시작한다. 이 점이 보안의 핵심이다(아래에서 설명).

### Sec-WebSocket-Version

```text
Sec-WebSocket-Version: 13
```

RFC 6455의 프로토콜 버전은 **13**으로 고정되어 있다. 그보다 작은 값(드래프트 시절의 흔적)은 서버가 거부할 수 있다.

### Origin

```text
Origin: https://example.com
```

브라우저가 자동으로 붙인다. 서버는 이 값을 보고 **다른 origin에서 시작된 WebSocket 연결을 거부할 수 있다.** WebSocket에는 CORS가 없기 때문에, Origin 헤더 기반의 화이트리스트가 사실상 같은 일을 한다.

### Sec-WebSocket-Protocol (선택)

```text
Sec-WebSocket-Protocol: chat, superchat
```

서브프로토콜 협상이다. "내가 말할 수 있는 응용 레벨 프로토콜은 chat과 superchat이다"라고 알리고 서버는 그중 하나를 골라 응답한다. 클라이언트 코드에서는 다음처럼 지정한다.

```js
new WebSocket("wss://example.com/chat", ["chat", "superchat"]);
```

### Sec-WebSocket-Extensions (선택)

```text
Sec-WebSocket-Extensions: permessage-deflate
```

프레임 레벨 확장 협상이다. 가장 흔한 게 `permessage-deflate`(메시지 단위 압축, [RFC 7692](https://www.rfc-editor.org/rfc/rfc7692.html)).

---

## RFC 6455 핸드셰이크: 서버 응답

서버가 이 요청을 받아들이면 다음과 같이 응답한다.

```text
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Sec-WebSocket-Protocol: chat
```

### 101 Switching Protocols

`200 OK`가 아니다. `101`은 "이 요청을 응답으로 끝내는 게 아니라, 같은 TCP 연결을 다른 프로토콜로 갈아탄다"는 의미다. abarth-01 드래프트가 `200 OK`를 쓴 것과 달리 RFC 6455는 이 의미를 헤더가 아닌 상태 코드로 명확히 했다.

이 응답이 끝나는 순간부터 같은 TCP 소켓 위로는 더 이상 HTTP가 흐르지 않는다. WebSocket 프레임이 흐른다.

### Sec-WebSocket-Accept

```text
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

이 값은 클라이언트가 보낸 `Sec-WebSocket-Key`와 정해진 GUID로부터 **결정론적으로 계산된 값**이다. 서버가 이 값을 정확히 응답해야만, 클라이언트는 "이 서버가 진짜 WebSocket을 이해한다"고 판단한다.

---

## Sec-WebSocket-Accept 계산

RFC 6455가 정의한 계산식은 이렇다.

```text
accept = base64( SHA1( key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11" ) )
```

- `key`: 클라이언트가 보낸 `Sec-WebSocket-Key` 값(base64 문자열 그대로, 디코드하지 않는다)
- GUID: 고정 문자열 `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`
- 둘을 그냥 문자열로 이어붙인 뒤 SHA-1 해시(20바이트)를 base64로 인코딩

Node.js로 검증해보자.

```js
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function accept(key) {
  return createHash("sha1")
    .update(key + GUID)
    .digest("base64");
}

console.log(accept("dGhlIHNhbXBsZSBub25jZQ=="));
// → "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
```

RFC 6455 §1.3에 적힌 정확히 그 예시가 나온다. 이 값을 응답에 그대로 넣으면 핸드셰이크가 성립한다.

abarth-01 드래프트는 같은 GUID를 쓰지만 계산 방식이 `HMAC-SHA1(key=client-nonce, data=GUID)`였다. 보안적으로는 비슷한 의도지만 **RFC 6455가 더 단순한 plain SHA-1 concat 방식으로 정착**했다. 서버 구현에서 HMAC 라이브러리 의존성을 줄이고 검증 절차를 명확히 하는 효과가 있다.

---

## 왜 이렇게 이상하게 생겼나: 보안상의 이유

핸드셰이크의 모양이 어색한 것은 다 이유가 있다. RFC 6455 §10에 정리된 보안 모델은 대략 다음 위협들을 막는 것이 목표다.

### 1. cross-protocol 공격 차단

WebSocket이 등장하기 전에도 브라우저는 임의의 TCP 포트로 HTTP 요청을 보낼 수 있었다. 만약 WebSocket 핸드셰이크가 그냥 일반 HTTP 요청과 구분되지 않는다면, **공격자가 피해자의 브라우저에서 SMTP나 IRC 같은 다른 프로토콜의 서버에 "HTTP 요청처럼 보이는 공격 패킷"을 보낼 수 있게 된다.**

이걸 막기 위한 장치가 `Sec-WebSocket-Key` + GUID + SHA-1 챌린지다. 서버가 정확한 `Sec-WebSocket-Accept`를 돌려주지 못하면 클라이언트는 연결을 끊는다. 즉 WebSocket이 아닌 서버가 어쩌다 200을 돌려주는 일이 있어도, **클라이언트가 그것을 WebSocket 연결로 오인하지 않는다.**

### 2. Sec- 접두로 위조 방지

`Sec-WebSocket-Key`, `Sec-WebSocket-Version` 등 모든 핵심 헤더가 `Sec-` 접두로 시작한다. 이건 [Fetch Standard의 forbidden header names](https://fetch.spec.whatwg.org/#forbidden-header-name)에 등록되어 있어서 **`XMLHttpRequest`, `fetch`, `<form>` 같은 브라우저 API로는 절대 설정할 수 없다.**

이 제약이 있기 때문에, 공격자가 자바스크립트로 WebSocket 핸드셰이크처럼 생긴 요청을 만들어 다른 서버에 보내는 것도 막힌다. 진짜 WebSocket 핸드셰이크는 `new WebSocket(...)`을 통해서만 만들 수 있다.

### 3. masking으로 cache poisoning 방지

핸드셰이크가 끝난 뒤 클라이언트 → 서버 방향 데이터는 모두 **랜덤 마스크로 XOR**된다. 같은 TCP 연결을 들여다보는 중간 프록시가 클라이언트 데이터를 캐싱하거나 캐시를 오염시키는 공격을 막기 위한 장치다. 이건 다음 글의 프레임 포맷에서 자세히 본다.

### 4. Origin 검증

WebSocket은 CORS preflight가 없다. 대신 `Origin` 헤더가 자동으로 붙고 **서버가 직접 Origin 화이트리스트를 검사해야 한다.** 검사를 생략하면 cross-site WebSocket hijacking(CSWSH)에 그대로 노출된다.

---

## 핸드셰이크 전체 흐름 한 장으로

```text
[Client (Browser)]                          [Server]
       │                                        │
       │   new WebSocket("wss://.../chat")      │
       │                                        │
       │   GET /chat HTTP/1.1                   │
       │   Upgrade: websocket                   │
       │   Connection: Upgrade                  │
       │   Sec-WebSocket-Key: <base64 16B>      │
       │   Sec-WebSocket-Version: 13            │
       │   Origin: https://...                  │
       │ ─────────────────────────────────────▶ │
       │                                        │
       │                          (서버가 검증)
       │                          - Origin 허용?
       │                          - Version 13?
       │                          - subprotocol?
       │                          - Accept 계산
       │                                        │
       │   HTTP/1.1 101 Switching Protocols     │
       │   Upgrade: websocket                   │
       │   Connection: Upgrade                  │
       │   Sec-WebSocket-Accept: <base64 sha1>  │
       │ ◀───────────────────────────────────── │
       │                                        │
       │   (Accept 검증 성공)                    │
       │                                        │
       │     같은 TCP 연결 위에서                │
       │     이제부터는 WebSocket 프레임          │
       │ ◀══════════════════════════════════════▶
       │                                        │
```

이 시점부터 양쪽은 동등한 발화권을 갖는다. HTTP의 요청-응답 구조는 사라지고 메시지를 자유롭게 주고받는다.

---

## 정리: abarth-01이 남긴 것

draft-abarth-websocket-handshake-01은 RFC 6455에 그대로 들어가지 않았다. CONNECT 메서드는 GET + Upgrade로 바뀌었고 HMAC-SHA1은 plain SHA-1로 단순화됐다. 200 OK는 101 Switching Protocols로 명확해졌다. 그러나 이 드래프트가 정착시킨 보안 원칙들은 RFC 6455의 뼈대 그대로다.

- **챌린지 응답으로 cross-protocol 공격 차단**
- **Sec- 접두 헤더로 브라우저 JS의 위조 차단**
- **고정 GUID로 결정론적 검증**

지금 우리가 짜는 WebSocket 코드 한 줄 한 줄의 안전성이 이 합의 위에 서 있다. abarth 드래프트들은 그 합의가 어떻게 만들어졌는지를 보여주는 기록이다.

[다음 글](/posts/websocket-browser-api)에서는 핸드셰이크가 끝난 뒤 흐르는 **WebSocket 프레임**의 구조를 RFC 6455 §5의 비트 레이아웃을 기준으로 분해하고 그것이 브라우저 `WebSocket` API의 텍스트/바이너리 메시지에 어떻게 매핑되는지를 본다.

---

## 참고

- [draft-abarth-websocket-handshake-01 (IETF, 2010)](https://www.ietf.org/archive/id/draft-abarth-websocket-handshake-01.html)
- [RFC 6455: The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455.html)
- [RFC 7692: Compression Extensions for WebSocket](https://www.rfc-editor.org/rfc/rfc7692.html)
- [Fetch Standard: Forbidden header names](https://fetch.spec.whatwg.org/#forbidden-header-name)
