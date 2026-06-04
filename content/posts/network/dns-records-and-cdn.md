---
title: "DNS 레코드와 CDN — A 레코드 한 줄 뒤에 숨은 것들"
date: "2026-06-05"
summary: "DNS는 도메인을 IP로 바꾸기만 하는 게 아니다. A·AAAA·CNAME·MX·TXT 같은 레코드의 역할과 TTL, 그리고 같은 도메인이 사용자마다 다른 서버로 연결되는 CDN·GeoDNS의 원리를 정리했다."
category: "Network"
tags:
  - Network
  - DNS
  - CDN
  - Web
featured: false
---

# DNS 레코드와 CDN

[DNS, IP, NAT의 기초](/posts/dns-ip-and-nat)에서 "naver.com = 223.130.x.x" 같은 **A 레코드**를 한 줄 언급하고 넘어갔다. 그런데 DNS는 단순한 이름-IP 대응표가 아니다. 여러 종류의 레코드로 메일, 인증, 별칭까지 관리하고, 같은 도메인이 사용자 위치마다 다른 서버로 연결되게도 한다.

---

## DNS 레코드의 종류

도메인의 권한 네임서버에는 여러 종류의 레코드가 저장된다. 자주 보는 것들만 정리한다.

| 레코드 | 역할 | 예 |
|---|---|---|
| A | 도메인 → IPv4 | `example.com → 93.184.216.34` |
| AAAA | 도메인 → IPv6 | `example.com → 2606:2800:...` |
| CNAME | 도메인 → 다른 도메인(별칭) | `www.example.com → example.com` |
| MX | 메일 서버 지정 | `example.com → mail.example.com` |
| TXT | 임의 텍스트(검증·정책) | SPF, 도메인 소유 확인 |
| NS | 이 도메인의 권한 네임서버 | `ns1.provider.com` |

- **CNAME**은 "이 이름은 사실 저 이름이야"라는 별칭이다. `www.example.com`을 `example.com`으로 연결할 때 쓴다. 단, 루트 도메인 자체에는 보통 걸 수 없다.
- **TXT**는 자유 텍스트라 용도가 넓다. 메일 위조 방지(SPF/DKIM), "이 도메인이 내 것"임을 증명하는 소유권 확인 등에 쓴다.
- **MX**는 `@example.com` 메일이 어느 서버로 가야 하는지를 정한다.

---

## TTL — 캐시가 사는 시간

각 레코드에는 **TTL(Time To Live)**이 붙는다. 조회 결과를 리졸버가 이 시간 동안 캐시한다는 뜻이다.

- TTL이 길면(예: 하루) 조회가 빨라지고 권한 서버 부하가 준다. 대신 IP를 바꿔도 **전 세계에 퍼지는 데 그만큼 오래** 걸린다.
- TTL이 짧으면(예: 60초) 변경이 빨리 반영되지만 조회가 잦아진다.

서버 이전이나 장애 대비 전환(failover)을 앞둔다면 미리 TTL을 줄여두는 게 흔한 운영 패턴이다.

---

## CDN과 GeoDNS — 같은 도메인, 다른 서버

여기서 DNS의 진짜 힘이 나온다. 큰 서비스는 사용자가 전 세계에 있는데, 모두가 한국의 서버 하나로 접속하면 먼 사용자는 느리다. 그래서 **CDN(Content Delivery Network)**은 콘텐츠를 세계 곳곳의 엣지 서버에 복제해 두고, **사용자를 가장 가까운 서버로 보낸다.**

그 "가까운 서버로 보내기"를 DNS가 담당한다.

```text
서울 사용자  → cdn.example.com 조회 → 서울 엣지 IP 응답
뉴욕 사용자  → cdn.example.com 조회 → 뉴욕 엣지 IP 응답
```

같은 도메인을 조회해도 **묻는 사람의 위치에 따라 다른 IP가 응답**된다. 이를 GeoDNS라 하고, 더 정교하게는 **Anycast**(같은 IP를 여러 지역에서 광고해 네트워크가 가장 가까운 곳으로 라우팅)도 쓴다.

그래서 보통 서비스는 자기 도메인을 CDN 제공자의 도메인으로 **CNAME** 연결해 두고, 실제 어느 엣지로 보낼지는 CDN이 DNS 단계에서 결정한다.

---

## 정리

- DNS는 이름-IP 대응만이 아니라 **A·AAAA(주소), CNAME(별칭), MX(메일), TXT(검증), NS(권한 서버)** 등 여러 레코드를 관리한다.
- 각 레코드의 **TTL**이 캐시 수명을 정한다. 변경 전엔 TTL을 줄여두는 게 안전하다.
- **CDN/GeoDNS**는 같은 도메인을 조회해도 사용자 위치에 따라 가장 가까운 엣지 서버 IP를 응답해, 전 세계 사용자에게 빠른 응답을 준다.

[기초편](/posts/dns-ip-and-nat)이 "이름을 번호로"였다면, 이 글은 그 이름이 메일·별칭·세계 분산까지 떠받친다는 이야기다.

---

## 참고 문서

- [Cloudflare — DNS record types](https://www.cloudflare.com/learning/dns/dns-records/)
- [MDN — What is a domain name?](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/What_is_a_domain_name)
- [Cloudflare — What is a CDN?](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/)
