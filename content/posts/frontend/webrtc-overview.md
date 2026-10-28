---
title: "WebRTC 개요(한눈에 보는 P2P 통신 스택)"
date: "2026-10-26"
summary: "WebRTC가 WebSocket과 어떻게 다른 카테고리인지, ICE·STUN·TURN·SDP·DTLS·SRTP·SCTP가 각자 어디서 무슨 일을 하는지를 한 장의 지도로 정리하고 브라우저 API와 연결했다."
category: "Frontend"
tags:
  - Network
  - Realtime
  - WebRTC
  - P2P
  - RFC
featured: false
series: "실시간 웹 통신과 브라우저 런타임"
seriesOrder: 6
---

# WebRTC 개요(한눈에 보는 P2P 통신 스택)

이름이 비슷해서 WebSocket과 자주 묶이지만 WebRTC는 사실 **다른 카테고리의 도구**다. WebSocket이 "HTTP의 양방향 버전"이라면 WebRTC는 "브라우저에 들어간 P2P 통신 스택 전체"다.

이 글은 WebRTC를 깊게 파지 않고 시리즈 흐름에 맞춰 WebSocket과 어떻게 다른 자리에 있는지, 내부의 ICE·STUN·TURN·SDP·DTLS·SRTP·SCTP가 각자 어디서 무슨 일을 하는지를 **한 장의 지도로 잡는 것**만 목표로 한다. WebRTC를 직접 다룰 일이 있다면 이 지도를 출발점으로 각 RFC를 깊이 따라가면 된다.

---

## 먼저 결론

| 항목 | WebSocket | WebRTC |
|---|---|---|
| 통신 토폴로지 | Client ↔ Server | Peer ↔ Peer (서버는 시그널링만) |
| 전송 계층 | TCP | UDP (미디어 SRTP, 데이터 SCTP/DTLS) |
| NAT/방화벽 통과 | 무관 (서버가 공인 IP) | ICE/STUN/TURN 필수 |
| 표준 | RFC 6455 한 문서 | RFC 8825 외 수십 개 |
| 자체 시그널링 | 핸드셰이크에 포함 | 없음. WebSocket이나 HTTP를 빌려 씀 |
| 주 용도 | 채팅, 알림, 실시간 피드 | 화상회의, 음성통화, P2P 데이터 |

---

## 큰 그림 한 장

WebRTC 연결이 맺어지는 흐름을 거칠게 그리면 이렇다.

```text
[Peer A]                                    [Peer B]

   │   ── (1) Signaling Channel ───────▶     │
   │       (WebSocket, HTTP, ...)            │
   │   ◀────────────────────────────         │
   │       SDP offer/answer 교환             │
   │       ICE candidate 교환                │
   │                                         │
   │   ── (2) ICE — NAT 뚫기 ───────────▶    │
   │       (STUN으로 외부 주소 알아내기      │
   │        TURN으로 우회 경로 확보)         │
   │   ◀────────────────────────────         │
   │                                         │
   │   ── (3) DTLS handshake ──────────▶     │
   │       (키 교환 + 인증)                  │
   │   ◀────────────────────────────         │
   │                                         │
   │   ── (4) Media: SRTP                ───▶│
   │      Data: SCTP over DTLS              │
   │   ◀════════════════════════════════════ │
```

각 단계가 따르는 표준은 아래 표에 모았다.

| 단계 | 역할 | 관련 표준 |
|---|---|---|
| 1. Signaling | 서로의 SDP와 ICE 후보를 교환 | 자체 표준 없음 (앱이 선택) |
| 2. ICE | NAT을 뚫고 가장 좋은 경로 선택 | [RFC 8445](https://www.rfc-editor.org/rfc/rfc8445), [STUN RFC 8489](https://www.rfc-editor.org/rfc/rfc8489), [TURN RFC 8656](https://www.rfc-editor.org/rfc/rfc8656) |
| 3. DTLS | 키 교환 + 인증 | [RFC 6347](https://www.rfc-editor.org/rfc/rfc6347) |
| 4. Media | 오디오/비디오 전송 | [SRTP RFC 3711](https://www.rfc-editor.org/rfc/rfc3711) |
| 4. Data | DataChannel 전송 | [SCTP RFC 4960](https://www.rfc-editor.org/rfc/rfc4960), DTLS 캡슐화 |
| 전체 개요 | WebRTC 아키텍처 | [RFC 8825](https://www.rfc-editor.org/rfc/rfc8825) |

---

## 1단계: 시그널링 (Signaling)

WebRTC에는 **자체 시그널링 프로토콜이 없다**. 두 피어가 서로의 존재를 알기 위한 메시지 교환 채널은 앱이 직접 마련해야 한다.

```text
Peer A ──┬─── 시그널링 서버 ───┬── Peer B
         │   (WebSocket 등)   │
         └───────              ──────┘
```

이 시그널링 채널로 교환하는 것은 두 가지다.

### SDP (Session Description Protocol)

서로의 미디어 능력과 코덱을 협상하는 텍스트 포맷이다. [RFC 8866](https://www.rfc-editor.org/rfc/rfc8866)이 정의한다.

```text
v=0
o=- 2890844526 2890842807 IN IP4 192.0.2.1
s=-
t=0 0
m=audio 49170 RTP/SAVPF 96
a=rtpmap:96 opus/48000/2
m=video 51372 RTP/SAVPF 100
a=rtpmap:100 VP8/90000
```

이 텍스트가 의미하는 건 대충 "나는 192.0.2.1:49170에서 opus 오디오를, 51372에서 VP8 비디오를 받을 수 있다"다.

A가 `offer`를 만들어 보내면 B가 `answer`를 만들어 응답한다. 이 SDP 한 쌍을 양쪽이 모두 `setLocalDescription`과 `setRemoteDescription`으로 저장하면, 어떤 미디어를 어떻게 보낼지 합의가 끝난다.

### ICE candidate

각자의 가능한 네트워크 경로다. "공인 IP의 이 포트", "내부 IP의 저 포트", "TURN 서버의 그 포트" 같은 후보들이 차례로 만들어져 시그널링 채널로 상대에게 전달된다.

ICE candidate는 trickle 방식으로 흘러간다. 후보가 생기는 대로 즉시 전달하기 때문에 한 번에 모은 다음 보낼 때보다 연결 시도 시간이 줄어든다.

---

## 2단계: ICE / STUN / TURN

세 약어가 한 묶음으로 등장하니 역할을 하나씩 보자.

### STUN (Session Traversal Utilities for NAT)

내가 NAT 뒤에 있을 때 외부에서 보이는 내 IP와 포트가 무엇인지 알아내기 위한 단순 프로토콜이다. 공인 STUN 서버에 패킷을 하나 보내면 서버가 "내가 본 너의 주소는 이거야"라고 응답한다.

```text
Peer A (192.168.1.10:5000) ─ NAT ─→ STUN Server
                                       │
                       "너는 외부에서   │
                        203.0.113.5:   │
                        62034로 보여" ←┘
```

### TURN (Traversal Using Relays around NAT)

대칭형 NAT처럼 STUN으로도 못 뚫는 경우가 있다. 그때는 **공인 IP를 가진 TURN 서버가 중간 릴레이**가 되어 양쪽 트래픽을 전달한다. P2P가 아닌 셈이지만 다른 경로가 없을 때의 최후 보루다.

TURN은 비싸다. 양쪽 미디어 트래픽을 모두 서버가 받고 보내야 하기 때문이다. 그래서 일반적인 WebRTC 운영에서 TURN 비용이 가장 큰 인프라 부담이 된다.

### ICE (Interactive Connectivity Establishment)

STUN과 TURN을 묶어서 "가능한 모든 경로 후보를 모은 뒤 가장 좋은 걸 골라 쓰는 알고리즘"이다. RFC 8445가 정의한다.

```text
[Peer A의 후보들]            [Peer B의 후보들]
- 192.168.1.10:5000          - 10.0.0.5:6000
  (내부 IP, host)               (내부 IP, host)
- 203.0.113.5:62034          - 198.51.100.7:54123
  (STUN으로 알아낸 외부)        (STUN으로 알아낸 외부)
- relay.example.com:3478     - relay.example.com:3478
  (TURN)                       (TURN)
```

각 후보 쌍을 시도해 연결되는지 검사하고 우선순위를 매겨 최선의 경로를 골라 쓴다.

---

## 3단계: DTLS 핸드셰이크

ICE로 경로가 정해지면 그 위에서 키 교환을 한다. WebRTC는 UDP를 쓰기 때문에 일반 TLS는 못 쓰고 **DTLS(Datagram TLS, [RFC 6347](https://www.rfc-editor.org/rfc/rfc6347))**가 쓰인다.

DTLS 핸드셰이크가 끝나면 양쪽이 같은 세션 키를 공유한다. 이 키로 이후의 모든 트래픽을 암호화한다.

---

## 4단계: Media와 Data

핸드셰이크 이후의 트래픽은 두 갈래로 나뉜다.

### Media: SRTP

오디오와 비디오는 **SRTP(Secure RTP, RFC 3711)**로 전송된다. RTP는 미디어 패킷의 타임스탬프와 시퀀스를 다루고 SRTP는 그 위에 암호화를 더한 것이다. UDP 위에서 동작한다.

무엇보다 SRTP는 **재전송하지 않는다**. 손실된 패킷은 그냥 버린다. 영상통화에서 250ms 늦게 도착한 프레임은 쓸모가 없기 때문이다. 대신 FEC(Forward Error Correction)나 NACK 같은 보조 메커니즘으로 일부 손실을 보완한다.

### Data: SCTP over DTLS

브라우저 간 임의 데이터를 주고받는 채널이 `RTCDataChannel`이다. 이 채널은 **SCTP([RFC 4960](https://www.rfc-editor.org/rfc/rfc4960))를 DTLS로 캡슐화한** 모양으로 동작한다.

SCTP는 옵션이 풍부하다.

| 옵션 | 의미 |
|---|---|
| `ordered: true` | 도착 순서 보장 (TCP처럼) |
| `ordered: false` | 빠른 도착 우선, 순서 무시 |
| `maxRetransmits: 3` | 3번 재전송 후 포기 |
| `maxPacketLifeTime: 100` | 100ms 내에 못 보내면 포기 |

채팅 메시지는 `ordered: true`로, 게임의 위치 업데이트는 `ordered: false` + 짧은 lifetime으로 같은 채널을 다르게 쓸 수 있다. TCP와 UDP의 절충 지점을 채널 단위로 고를 수 있다.

---

## 브라우저 API로 보면

이 모든 표준 위에 브라우저는 세 개의 상위 API를 올린다.

```js
// 1. 미디어 캡처
const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

// 2. 피어 연결
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});
stream.getTracks().forEach((t) => pc.addTrack(t, stream));

// SDP offer 만들기
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

// 시그널링 채널로 offer 전송 (WebSocket 등)
signaling.send({ type: "offer", sdp: offer.sdp });

// ICE candidate가 생길 때마다 상대에게 보냄
pc.onicecandidate = (e) => {
  if (e.candidate) signaling.send({ type: "ice", candidate: e.candidate });
};

// 상대 트랙이 도착하면 비디오에 연결
pc.ontrack = (e) => {
  videoElement.srcObject = e.streams[0];
};

// 3. 임의 데이터 채널
const dc = pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 });
dc.onmessage = (e) => handleGameInput(e.data);
```

세 가지 API의 역할을 정리하면 다음과 같다.

| API | 역할 |
|---|---|
| `getUserMedia` | 카메라/마이크에서 `MediaStream` 만들기 |
| `RTCPeerConnection` | SDP 협상, ICE 처리, 미디어/데이터 송수신 관리 |
| `RTCDataChannel` | SCTP 기반 임의 데이터 채널 |

코드를 자세히 보면 **시그널링 부분이 없다.** WebRTC API는 `signaling.send(...)` 같은 추상적인 함수에 의존하고 그 안쪽은 우리가 직접 채워야 한다. WebSocket으로 만드는 경우가 가장 흔하다.

---

## WebSocket과의 관계

이 시리즈에서 WebRTC를 한 글로 다루기로 한 데는 이 관계가 가장 컸다.

```text
[ WebRTC를 쓰는 화상회의 앱 ]

   Peer A ←─ Signaling: WebSocket ─→ Peer B
     │                                 │
     └─────── Media/Data: WebRTC ──────┘
```

WebRTC가 P2P 미디어/데이터를 옮기는 동안 **시그널링 채널은 거의 항상 WebSocket**이 된다. 그래서 이 시리즈의 WebSocket 글은 WebRTC를 쓰는 프로젝트에서도 그대로 쓸모가 있다.

---

## 정리

WebRTC는 한 줄로 "**브라우저에 들어간 P2P 통신 스택의 다발**"이다. 미디어를 옮기는 SRTP, 데이터를 옮기는 SCTP, NAT을 뚫는 ICE/STUN/TURN, 키를 교환하는 DTLS, 협상의 언어 SDP까지 모두 각자 자기 RFC를 가지고 모여 있다.

이 글은 그 다발의 지도를 그리는 데서 멈춘다. 한 가지만 기억해두면 충분하다.

- **WebSocket** = 서버를 통한 양방향 메시징
- **WebRTC** = 브라우저끼리 직접 연결하는 통신 스택. 시그널링은 보통 WebSocket으로 한다.

[다음 글](/posts/dedicated-worker)부터는 시리즈의 두 번째 축, **브라우저 JS 실행 컨텍스트**로 넘어간다. Dedicated Worker, Shared Worker, Service Worker가 각각 어떤 자리에 있는지, 그 위에 어떤 통신 패턴이 올라가는지를 본다.

---

## 참고

- [RFC 8825: Overview: Real-Time Protocols for Browser-Based Applications](https://www.rfc-editor.org/rfc/rfc8825)
- [RFC 8445: Interactive Connectivity Establishment (ICE)](https://www.rfc-editor.org/rfc/rfc8445)
- [RFC 8489: STUN](https://www.rfc-editor.org/rfc/rfc8489)
- [RFC 8656: TURN](https://www.rfc-editor.org/rfc/rfc8656)
- [RFC 8866: SDP](https://www.rfc-editor.org/rfc/rfc8866)
- [RFC 6347: DTLS](https://www.rfc-editor.org/rfc/rfc6347)
- [MDN: WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
