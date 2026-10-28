---
title: "브라우저 WebSocket API 제대로 쓰기(프레임에서 메시지까지)"
date: "2026-10-26"
summary: "핸드셰이크가 끝난 뒤 흐르는 WebSocket 프레임의 구조를 RFC 6455 §5 기준으로 분해하고, 그것이 브라우저 WebSocket API의 텍스트/바이너리 메시지, bufferedAmount, close code에 어떻게 매핑되는지 정리했다."
category: "Frontend"
tags:
  - Network
  - Realtime
  - WebSocket
  - RFC
  - API
featured: false
series: "실시간 웹 통신과 브라우저 런타임"
seriesOrder: 4
---

# 브라우저 WebSocket API 제대로 쓰기(프레임에서 메시지까지)

지난 글에서 핸드셰이크가 끝나면 같은 TCP 연결 위로 더 이상 HTTP가 흐르지 않는다고 했다. 이제부터는 **WebSocket 프레임**이 흐른다. 이 글은 RFC 6455 §5에 정의된 프레임 구조를 한 번 분해한 뒤, 그 위에 올라간 브라우저 `WebSocket` API가 어떤 일을 해주고 어떤 일은 직접 챙겨야 하는지를 정리한다.

핸드셰이크 분석은 [이전 글](/posts/websocket-handshake-rfc)을 참고.

---

## 먼저 결론

| 자주 헷갈리는 지점 | 핵심 한 줄 |
|---|---|
| `onerror`에서 원인을 알 수 없다 | 디버깅은 `close` 이벤트의 `code`와 `reason`으로 한다 |
| 바이너리가 `Blob`으로 들어온다 | `ws.binaryType = "arraybuffer"`로 바꾼다 |
| `send()`를 했는데 안 가는 것 같다 | `bufferedAmount`를 보고 백프레셔를 직접 관리한다 |
| close code 1006이 뜬다 | 정상 close 프레임 없이 끊긴 비정상 종료. 보통 네트워크/프록시 문제 |
| 헤더에 토큰을 못 넣는다 | 브라우저 `WebSocket` API의 한계. 서브프로토콜이나 쿠키로 우회한다 |

---

## RFC 6455 §5: 프레임 한 장 요약

핸드셰이크 직후 흐르는 프레임의 모양은 다음과 같다.

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |   Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |          (16/64)             |
|N|V|V|V|       |S|             |  (if payload len==126/127)   |
+-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
|     Extended payload length continued, if payload len == 127  |
+ - - - - - - - - - - - - - - - +-------------------------------+
|                               | Masking-key, if MASK set to 1 |
+-------------------------------+-------------------------------+
|              Masking-key (continued)       |  Payload Data    |
+--------------------------------------------+- - - - - - - - - +
:                     Payload Data continued ...                :
+---------------------------------------------------------------+
```

핵심 필드만 표로 추렸다.

| 필드 | 비트 | 의미 |
|---|---|---|
| FIN | 1 | 이 프레임이 메시지의 마지막 프레임인지 |
| RSV1~3 | 각 1 | 확장(`permessage-deflate` 같은 것)이 쓰는 예약 비트 |
| opcode | 4 | 프레임의 종류 (텍스트/바이너리/ping 등) |
| MASK | 1 | 페이로드가 마스킹되어 있는지 (클라이언트→서버는 항상 1) |
| Payload len | 7 / 7+16 / 7+64 | 페이로드 길이 (가변 길이 인코딩) |
| Masking-key | 32 | MASK=1일 때만, 클라이언트가 만든 4바이트 마스크 |
| Payload | 가변 | 실제 데이터 |

특이한 점 두 가지를 짚자.

### Payload length는 가변 인코딩이다

7비트로 길이를 표현하다가, 그 값이 `126`이면 다음 2바이트가 진짜 길이, `127`이면 다음 8바이트가 진짜 길이다. 작은 메시지를 헤더 2바이트로 끝낼 수 있게 하면서도 최대 2^63 바이트의 큰 메시지까지 표현할 수 있다.

### 클라이언트 → 서버는 항상 masking

브라우저가 보내는 모든 프레임은 4바이트 마스크로 XOR된다. 핸드셰이크 글에서 짚었듯, 이건 중간 프록시의 cache poisoning을 막기 위한 장치다. 서버 → 클라이언트 방향은 마스킹하지 않는다.

```text
masked_byte[i] = original_byte[i] XOR masking_key[i mod 4]
```

브라우저 `WebSocket` API는 이 마스킹을 자동으로 처리한다. 우리가 신경 쓸 일은 없다.

---

## opcode 종류

| opcode | 종류 | 의미 |
|---|---|---|
| 0x0 | continuation | 분할된 메시지의 이어지는 프레임 |
| 0x1 | text | UTF-8 텍스트 메시지 |
| 0x2 | binary | 바이너리 메시지 |
| 0x8 | close | 연결 종료 |
| 0x9 | ping | 살아있는지 확인용 |
| 0xA | pong | ping에 대한 응답 |

`0x8`, `0x9`, `0xA`는 **control frame**이라 부르고 페이로드가 125바이트 이하이며 분할될 수 없다. 데이터와 별도로 흐르는 "신호" 같은 존재다.

---

## 프레임이 API로 올라오면

브라우저는 이 모든 비트 단위 작업을 숨긴다. 우리에게 보이는 건 다음 객체뿐이다.

```js
const ws = new WebSocket("wss://example.com/chat");

ws.onopen = () => console.log("열림");
ws.onmessage = (e) => console.log("받음:", e.data);
ws.onclose = (e) => console.log("끊김:", e.code, e.reason);
ws.onerror = () => console.log("에러");

ws.send("안녕");
```

프레임이 메시지로 올라오는 과정을 정리하면 이렇다.

```text
[수신 흐름]
  TCP 바이트 스트림
    → 프레임 단위 파싱 (opcode, length, payload)
    → 같은 메시지의 여러 프레임을 이어붙임 (FIN 비트로 판단)
    → opcode가 0x1 → 문자열로 디코딩 → MessageEvent.data = string
    → opcode가 0x2 → ArrayBuffer 또는 Blob → MessageEvent.data
    → opcode가 0x8 → close 이벤트
    → opcode가 0x9 → 자동으로 0xA pong 응답 (개발자 코드 없이)
```

여기서 한 가지 중요한 점이 있다. **브라우저 `WebSocket` API에서 우리가 받는 단위는 "프레임"이 아니라 "메시지"다.** 메시지가 여러 프레임으로 쪼개져 도착해도, 브라우저가 이어붙여서 한 번의 `message` 이벤트로 올려준다. 프레임 경계를 다룰 필요가 없다.

---

## `new WebSocket()`

```js
const ws = new WebSocket(url, protocols);
```

- `url`: `ws://` 또는 `wss://` 스킴. HTTP 페이지면 `ws`/`wss` 둘 다 가능하지만 **HTTPS 페이지에서는 mixed content 정책 때문에 `wss://`만 동작한다.**
- `protocols`: 문자열 또는 문자열 배열. 핸드셰이크 시 `Sec-WebSocket-Protocol`로 전달되는 서브프로토콜 후보 목록.

```js
const ws = new WebSocket("wss://example.com/chat", ["v2.json", "v1.json"]);
ws.onopen = () => {
  console.log(ws.protocol); // 서버가 고른 서브프로토콜 (예: "v2.json")
};
```

서버가 응답으로 고른 서브프로토콜은 `ws.protocol`에서 확인할 수 있다.

---

## readyState: 4단계 라이프사이클

| 값 | 상수 | 의미 |
|---|---|---|
| 0 | `WebSocket.CONNECTING` | TCP/TLS 연결 + 핸드셰이크 진행 중 |
| 1 | `WebSocket.OPEN` | 메시지 송수신 가능 |
| 2 | `WebSocket.CLOSING` | `close()` 호출됐고 close 프레임 교환 중 |
| 3 | `WebSocket.CLOSED` | 완전히 닫힘 |

```text
            new WebSocket()
                 │
                 ▼
            CONNECTING
                 │
        (핸드셰이크 성공) ───→ OPEN
                 │              │
        (핸드셰이크 실패)         │
                 │              ▼
                 └─────────► CLOSING
                                │
                                ▼
                             CLOSED
```

흥미롭게도 `CONNECTING` 상태에서 `send()`를 호출하면 **에러가 던져진다.** 보내려는 데이터를 큐에 쌓아두지 않는다. 직접 큐를 만들거나, `onopen`까지 기다려야 한다.

```js
const queue = [];

function sendOrQueue(data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  } else {
    queue.push(data);
  }
}

ws.onopen = () => {
  for (const msg of queue) ws.send(msg);
  queue.length = 0;
};
```

---

## 텍스트와 바이너리

`send()`가 받을 수 있는 타입은 다음과 같다.

| 전달 타입 | 프레임 |
|---|---|
| `string` | opcode 0x1 (text). UTF-8로 인코딩된다. |
| `ArrayBuffer` | opcode 0x2 (binary) |
| `Blob` | opcode 0x2 (binary) |
| `ArrayBufferView` (`Uint8Array` 등) | opcode 0x2 (binary) |

받을 때는 반대다. 텍스트 메시지는 항상 `string`이지만 바이너리는 `binaryType` 설정에 따라 형태가 달라진다.

```js
ws.binaryType = "arraybuffer"; // 기본은 "blob"

ws.onmessage = (e) => {
  if (typeof e.data === "string") {
    handleText(e.data);
  } else if (e.data instanceof ArrayBuffer) {
    handleBinary(new Uint8Array(e.data));
  }
};
```

`"blob"`은 큰 데이터를 메모리 사본 없이 다룰 때 유리하다. `"arraybuffer"`는 바로 바이트 단위로 읽고 싶을 때 편하다. 보통은 `"arraybuffer"`가 다루기 쉽다.

### 텍스트 프레임은 UTF-8이어야 한다

opcode 0x1 텍스트 프레임의 페이로드는 **반드시 valid UTF-8**이어야 한다. 그렇지 않으면 RFC 6455 §8.1에 따라 close code `1007 (invalid frame payload data)`로 연결이 끊긴다. 임의의 바이트 시퀀스를 텍스트 프레임에 끼워 넣을 수 없다.

---

## `send()`는 동기지만 전송은 비동기다

`ws.send(data)`는 즉시 리턴하지만 그 시점에 데이터가 네트워크로 나간 것은 아니다. 브라우저 내부 송신 버퍼에 들어갔을 뿐이다. 진짜로 전송되는 건 그 후의 일이다.

이 버퍼에 얼마가 쌓여있는지가 `bufferedAmount`다.

```js
ws.send(bigPayload);
console.log(ws.bufferedAmount); // 아직 안 나간 바이트 수
```

큰 페이로드를 빠르게 연속 호출하면 `bufferedAmount`가 무한히 늘어날 수 있다. 메모리가 차오르거나, 클라이언트가 OOM으로 죽는다. 백프레셔(backpressure)를 우리가 직접 관리해야 한다.

```js
function safeSend(data) {
  if (ws.bufferedAmount > 1_000_000) {
    // 1MB 이상 쌓이면 잠시 보류
    return false;
  }
  ws.send(data);
  return true;
}
```

---

## `close()`: 정상 종료

```js
ws.close(code, reason);
```

- `code`: 1000~4999 범위의 정수. 생략하면 1000 (normal closure).
- `reason`: UTF-8 문자열, 최대 123바이트.

호출하면 close 프레임(opcode 0x8)이 서버로 가고 서버도 close 프레임을 응답한 뒤 양쪽이 TCP를 닫는다. `onclose` 이벤트가 발생한다.

### 자주 보는 close code

| code | 의미 | 발생 상황 |
|---|---|---|
| 1000 | normal | 정상 종료 |
| 1001 | going away | 페이지 이동, 서버 셧다운 |
| 1002 | protocol error | 잘못된 프레임 수신 |
| 1003 | unsupported data | 지원하지 않는 데이터 타입 |
| 1006 | abnormal closure | close 프레임 없이 끊김. **앱이 직접 설정할 수 없는 값** |
| 1007 | invalid payload | 텍스트 프레임이 valid UTF-8이 아님 |
| 1008 | policy violation | 정책 위반 |
| 1009 | message too big | 메시지가 허용 크기 초과 |
| 1011 | internal error | 서버 내부 오류 |

`1006`은 특별하다. **RFC가 명시적으로 "앱은 이 코드를 close 프레임에 넣을 수 없다"고 정한 값**이다. 이 코드가 보이면 close 프레임 자체가 오지 않았다는 뜻이다. 즉 네트워크 단절, 프록시의 강제 종료, 브라우저의 비정상 종료 같은 상황이다.

```js
ws.onclose = (e) => {
  console.log("code:", e.code, "reason:", e.reason, "clean:", e.wasClean);
};
```

`wasClean`이 `true`면 양쪽이 close 프레임을 정상적으로 주고받았다는 뜻이다. `false`면 비정상 종료다.

---

## `onerror`의 함정

WebSocket에서 가장 짜증나는 부분이다. **`error` 이벤트는 거의 정보가 없다.**

```js
ws.onerror = (e) => {
  console.log(e); // Event { type: "error", ... } — 사유가 안 들어있다
};
```

이건 보안 설계 결정이다. 자세한 에러 정보를 노출하면 cross-origin 공격에 단서를 제공할 수 있어서 명세가 의도적으로 정보를 막아뒀다.

**디버깅은 `onclose`로 한다.** `error` 다음에는 거의 항상 `close`가 이어지고 `close`의 `code`와 `reason`이 실제 단서다.

```js
ws.onerror = () => {
  // 여기서는 그냥 표시만
  console.log("error 발생, close를 기다림");
};

ws.onclose = (e) => {
  // 진짜 원인은 여기
  console.log("code:", e.code, "reason:", e.reason);
};
```

---

## 헤더를 못 넣는다는 제약

브라우저 `WebSocket` API는 **커스텀 헤더를 지정할 방법이 없다.** `new WebSocket(url, protocols)`의 두 번째 인자는 서브프로토콜 후보일 뿐 헤더가 아니다.

이건 보안과 무관한 단순한 API 설계 한계다. 그래서 JWT 토큰 같은 인증 정보를 다음 셋 중 하나로 전달해야 한다.

1. **쿠키**: 같은 origin이면 자동으로 따라간다. 가장 깔끔.
2. **URL 쿼리**: `wss://example.com/chat?token=xxx`. 로그에 토큰이 남는 단점.
3. **서브프로토콜 트릭**: 토큰을 서브프로토콜 후보처럼 끼워 넣는 방법. 좀 hacky.

서브프로토콜 트릭은 이렇게 생겼다.

```js
new WebSocket(url, ["v1.protocol", `Bearer.${jwtToken}`]);
```

서버는 두 번째 항목을 토큰으로 인식해 검증한 뒤, 응답에서는 `v1.protocol`만 골라 돌려준다. 권장되는 방법은 아니지만 [Kubernetes API server](https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/apimachinery/pkg/util/httpstream/wsstream/conn.go) 같은 데서 실제로 쓰인다.

---

## 메시지 조각화는 보이지 않는다

RFC 6455 §5.4에 따르면 큰 메시지는 여러 프레임(FIN=0인 프레임들 + 마지막 FIN=1 프레임)으로 쪼개서 보낼 수 있다. 그러나 브라우저 `WebSocket` API는 **이 조각들을 자동으로 이어붙여 한 번의 `message` 이벤트로 올려준다.**

부분적으로 도착한 메시지를 스트리밍으로 처리할 방법은 표준 API에 없다. 큰 메시지를 점진적으로 보여주고 싶으면 **앱 레벨에서 메시지를 작게 쪼개서 보내는 패턴**을 직접 만들어야 한다(LLM 응답 스트리밍에서 SSE가 자주 선택되는 이유 중 하나가 이것이다).

---

## 한 화면에 모은 최소 패턴

```js
const ws = new WebSocket("wss://example.com/chat", ["chat.v1"]);
ws.binaryType = "arraybuffer";

ws.onopen = () => {
  console.log("open, subprotocol:", ws.protocol);
  ws.send(JSON.stringify({ type: "hello" }));
};

ws.onmessage = (e) => {
  if (typeof e.data === "string") {
    const msg = JSON.parse(e.data);
    handleText(msg);
  } else {
    handleBinary(new Uint8Array(e.data));
  }
};

ws.onclose = (e) => {
  console.log("closed", { code: e.code, reason: e.reason, clean: e.wasClean });
};

ws.onerror = () => {
  console.log("error — close 이벤트에서 사유 확인");
};

function safeSend(data) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > 1_000_000) return false;
  ws.send(data);
  return true;
}
```

이게 브라우저 측에서 WebSocket을 다루는 가장 기본 형태다. 그러나 실서비스에서는 이 위에 한 겹이 더 필요하다.

- **네트워크가 끊겼을 때 어떻게 다시 붙는가**
- **연결이 살아있는 것처럼 보이지만 사실 죽어있는 좀비 연결을 어떻게 감지하는가**
- **반복 재연결이 서버를 폭격하지 않게 어떻게 백오프를 거는가**

이게 [다음 글](/posts/websocket-reconnect-heartbeat-backoff)의 주제다.

---

## 참고

- [RFC 6455 §5: Data Framing](https://www.rfc-editor.org/rfc/rfc6455.html#section-5)
- [RFC 6455 §7.4: Status Codes](https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4)
- [MDN: WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [WHATWG HTML: The WebSocket interface](https://html.spec.whatwg.org/multipage/web-sockets.html)
