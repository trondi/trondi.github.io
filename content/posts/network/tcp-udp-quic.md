---
title: "TCP, UDP, 그리고 QUIC — HTTP를 실어 나르는 전송 계층"
date: "2026-06-05"
summary: "HTTP/3가 TCP 대신 QUIC을 쓴다고 했는데, 그 아래의 전송 계층은 어떻게 다른가. 연결 지향의 TCP, 가벼운 UDP, 그리고 UDP 위에 신뢰성과 암호화를 얹은 QUIC을 정리했다."
category: "Network"
tags:
  - Network
  - TCP
  - UDP
  - QUIC
  - HTTP/3
featured: false
---

# TCP, UDP, 그리고 QUIC

[HTTP 기초](/posts/http-basics)에서 HTTP/3가 TCP 대신 QUIC을 쓴다고만 하고 넘어갔다. 그런데 그 아래 "전송 계층"이 무엇이고 왜 바꿨는지를 알면, HTTP의 진화가 훨씬 또렷해진다.

HTTP, TLS는 결국 데이터를 상대에게 "어떻게든 보내야" 한다. 그 운반을 담당하는 것이 전송 계층이고, 대표 선수가 **TCP**와 **UDP**다. QUIC은 그 둘의 장점을 합치려는 비교적 새로운 시도다.

---

## TCP — 신뢰성을 보장하는 연결

TCP(Transmission Control Protocol)는 **연결 지향**이고 **신뢰성**을 보장한다.

- **연결 수립**: 데이터를 보내기 전에 3-way 핸드셰이크(SYN → SYN-ACK → ACK)로 연결을 먼저 맺는다.
- **순서 보장**: 패킷에 번호를 매겨, 도착 순서가 뒤섞여도 원래 순서로 재조립한다.
- **재전송**: 패킷이 유실되면 다시 보낸다. "도착했다는 확인(ACK)"을 기다린다.

웹, 파일 전송처럼 **데이터가 정확히, 빠짐없이** 도착해야 하는 경우에 쓴다. HTTP/1.1과 HTTP/2가 TCP 위에서 동작한다.

### TCP의 약점 — Head-of-Line 블로킹

신뢰성에는 대가가 있다. 패킷 하나가 유실되면, TCP는 그 패킷이 재전송돼 도착할 때까지 **뒤따라온 패킷들도 애플리케이션에 넘기지 않고 기다린다**. 순서를 보장해야 하기 때문이다. HTTP/2가 한 연결에 여러 요청을 멀티플렉싱해도, TCP 레벨에서 이 막힘(HOL 블로킹)이 생기면 모든 스트림이 함께 밀린다.

---

## UDP — 빠르지만 보장하지 않는다

UDP(User Datagram Protocol)는 정반대다. **비연결**이고 **신뢰성을 보장하지 않는다.**

- 핸드셰이크 없이 그냥 보낸다.
- 순서 보장 없음, 유실돼도 재전송 없음.
- 그 대신 **가볍고 빠르다.**

실시간 스트리밍, 게임, 화상통화처럼 **약간의 손실보다 지연이 더 치명적인** 경우에 쓴다. 오래된 프레임을 재전송받느니 그냥 다음 프레임으로 넘어가는 게 낫기 때문이다.

| | TCP | UDP |
|---|---|---|
| 연결 | 연결 지향(핸드셰이크) | 비연결 |
| 신뢰성 | 보장(순서·재전송) | 보장 안 함 |
| 속도 | 상대적으로 느림 | 빠름 |
| 용도 | 웹, 파일 전송 | 스트리밍, 게임, 화상통화 |

---

## QUIC — UDP 위에 신뢰성과 암호화를 얹다

여기서 QUIC이 등장한다. QUIC은 **UDP 위에 직접** 신뢰성·순서·암호화를 구현한 프로토콜이다. TCP를 버리되, TCP가 주던 보장은 애플리케이션 레벨에서 다시 만든다.

QUIC이 푸는 문제는 두 가지다.

- **TCP HOL 블로킹 제거**: QUIC은 스트림을 독립적으로 다뤄, 한 스트림의 패킷이 유실돼도 다른 스트림은 멈추지 않는다.
- **연결 수립 단축**: TCP 핸드셰이크 + TLS 핸드셰이크를 따로 하던 것을, QUIC은 **연결과 암호화 협상을 하나로 합쳐** 더 빨리 통신을 시작한다. (TLS 1.3이 내장돼 있다.)

```text
HTTP/2:  애플리케이션 → TLS → TCP → IP
HTTP/3:  애플리케이션 → QUIC(내장 TLS 1.3) → UDP → IP
```

이것이 [HTTP 기초](/posts/http-basics)에서 본 "HTTP/3 = QUIC 기반"의 정체다. HTTP/3는 같은 HTTP 약속을, TCP의 한계를 우회하는 QUIC 위에 실어 나른다.

---

## 정리

- **TCP**는 연결 지향·신뢰성 보장(순서·재전송) 프로토콜이다. 웹·파일 전송에 쓰지만, 패킷 유실 시 HOL 블로킹이 생긴다.
- **UDP**는 비연결·무보장이지만 가볍고 빠르다. 스트리밍·게임처럼 지연이 손실보다 치명적인 경우에 쓴다.
- **QUIC**은 UDP 위에 신뢰성·순서·암호화를 다시 구현해, TCP HOL 블로킹을 없애고 연결을 빠르게 맺는다. HTTP/3의 토대다.
- [TLS 핸드셰이크](/posts/https-tls-handshake)가 QUIC에는 내장돼 있어, 연결과 암호화 협상이 한 번에 이뤄진다.

전송 계층은 평소 보이지 않지만, "왜 HTTP가 버전을 올릴수록 빨라졌는가"의 답은 대부분 이 아래층에 있다.

---

## 참고 문서

- [MDN — TCP](https://developer.mozilla.org/en-US/docs/Glossary/TCP)
- [Cloudflare — What is QUIC?](https://www.cloudflare.com/learning/performance/what-is-quic/)
- [RFC 9000 — QUIC: A UDP-Based Multiplexed and Secure Transport](https://datatracker.ietf.org/doc/html/rfc9000)
