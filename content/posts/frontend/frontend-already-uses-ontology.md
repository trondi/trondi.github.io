---
title: "프론트엔드는 이미 온톨로지를 쓰고 있다"
date: "2026-08-20"
summary: "메타태그, 접근성, 상태 관리, GraphQL. 프론트엔드가 매일 쓰는 것들을 온톨로지 관점에서 다시 읽으면 '왜 이렇게 생겼는지'가 설명된다. 이 블로그의 실제 코드로 확인했다."
category: "Frontend"
tags:
  - 구조 용어 시리즈
  - Frontend
  - Ontology
  - A11y
  - SEO
  - GraphQL
featured: false
draft: false
---

# 프론트엔드는 이미 온톨로지를 쓰고 있다

> **구조 용어 시리즈 · 5편 / 전 6편** — 난이도: 중급 (React·상태 관리 경험이 조금 필요하다)
> 이전 → [지식 그래프와 RDF](/posts/knowledge-graph-rdf-jsonld) · 다음 → [온톨로지는 실제로 어디에 쓰이나](/posts/ontology-in-the-wild)

[지식 그래프와 RDF](/posts/knowledge-graph-rdf-jsonld)까지 쓰고 나서 솔직히 든 생각은 이거였다.

> **"좋은 얘기 같은데, 프론트엔드랑 무슨 상관이지?"**

시맨틱 웹(Semantic Web)은 어딘가 학술적이고, 지식 그래프는 검색 엔진 회사 일 같았다. 그런데 이 블로그 코드를 열어 보고 생각이 바뀌었다. **이미 쓰고 있었다.** 이름을 몰랐을 뿐이다.

이 글은 프론트엔드가 매일 만지는 네 가지를 다시 읽는다. 새 기술을 배우자는 게 아니라, **익숙한 것이 왜 그렇게 생겼는지**를 설명하려는 시도다.

---

## 1. 메타태그는 사실 RDF다

이 블로그의 글 페이지에는 이런 코드가 있다. 흔한 SEO 설정이다.

```tsx
export function generateMetadata({ params }: PostPageProps): Metadata {
  const post = getPostBySlug(params.slug);

  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      type: "article",
      publishedTime: post.date,
    },
  };
}
```

이게 브라우저에 그려지면 이런 태그가 된다.

```html
<meta property="og:title" content="프론트엔드는 이미…" />
<meta property="og:type"  content="article" />
```

카카오톡이나 슬랙에 링크를 붙이면 제목과 썸네일이 뜨는데, 그걸 만드는 게 이 태그다. 정식 이름은 **Open Graph**다.

그런데 이 Open Graph라는 규격은 **RDF에서 나왔다.** [앞 글](/posts/knowledge-graph-rdf-jsonld)에서 본 세 조각으로 옮겨 보면 정확히 맞아떨어진다.

```
이 페이지   og:title   "프론트엔드는 이미…"
이 페이지   og:type    "article"
```

속성 이름이 `property`인 것부터가 힌트다. **술어**라는 뜻이다.

| HTML에서 | 앞 글에서 부르던 이름 |
|---|---|
| 페이지 자신 | 주어(subject) |
| `property="og:title"` | 술어(predicate) |
| `content="..."` | 목적어(object) |
| `og:` 라는 접두사 | 단어 사전 선언(vocabulary) |

> 링크를 붙였을 때 미리보기가 뜨는 건, **내가 페이지에 적어 둔 사실을 카카오가 읽어 간 것**이다.

메타태그를 "SEO 하려면 넣어야 하는 주문"으로 외우는 것과, "이 페이지에 대한 사실을 기계가 읽을 형식으로 적는 것"으로 이해하는 건 꽤 다르다. 후자로 보면 **어떤 태그를 넣을지 스스로 판단할 수 있다.**

---

## 2. 접근성 — 안 적은 걸 브라우저가 채워 준다

더 놀라운 쪽은 접근성이다.

[스크린 리더를 직접 써보고 알게 된 것들](/posts/screen-reader-lessons)에서, 아이콘만 있는 버튼이 그냥 **"버튼"**이라고만 읽히는 문제를 다뤘다. 그때는 `aria-label`을 붙이는 해법에 집중했는데, 한 걸음 물러나 보면 이상한 지점이 있다.

```tsx
<button onClick={handleDelete}>
  <TrashIcon />
</button>
```

**나는 "이건 버튼이다"라고 어디에도 적지 않았다.** 그런데 스크린 리더는 "버튼"이라고 읽었다. 심지어 클릭할 수 있고 Tab으로 이동할 수 있다는 것도 알고 있다.

누가 알려준 걸까? **아무도 안 알려줬다. 브라우저가 끌어냈다.** [앞 글](/posts/knowledge-graph-rdf-jsonld)에서 본 **추론**이 바로 이것이다.

원리는 이렇다. 웹 표준에는 요소의 역할(role)이 **종류별로 정리돼 있다.**

- `button`은 **명령 종류**의 하나다
- `checkbox`는 **입력 종류**의 하나다

[1편](/posts/structure-terms-ontology-topology-taxonomy)의 **옷장 서랍**, 곧 택소노미다. 여기에 "`<button>` 태그는 자동으로 button 역할을 가진다"는 규칙이 더해진다.

브라우저는 이 규칙들을 적용해 화면을 **접근성 트리(accessibility tree)**라는 별도의 구조로 다시 정리한다. 스크린 리더가 읽는 건 우리가 짠 HTML이 아니라 **이 정리된 결과물**이다.

```diagram
a11y-inference
```

`role="checkbox"`만 줬는데 스크린 리더가 "선택 안 됨"까지 말해 주는 것도 같은 이유다. **체크박스에는 체크 상태가 있다는 사실이 표준에 이미 적혀 있기 때문**이다.

여기서 규칙 하나가 선명해진다.

> **시맨틱 태그를 쓰라는 말은 잔소리가 아니다.** `<div onClick>`이 문제인 이유는 못생겨서가 아니라, **이미 정의된 의미 체계 바깥에 있어서 아무것도 추론되지 않기 때문**이다. 브라우저가 대신 채워 줄 근거가 없다.

---

## 3. 상태를 정규화하는 진짜 이유

세 번째는 상태 관리다. 서버에서 받은 데이터를 이렇게 펴라는 조언을 들어봤을 것이다.

```ts
// 받은 그대로 — 작성자가 글 "안에" 들어 있다
{ post: { id: 1, author: { id: 7, name: "Trond" } } }

// 정규화 후 — 따로 떼어 내고 번호로 연결한다
{
  posts:   { 1: { id: 1, authorId: 7 } },
  authors: { 7: { id: 7, name: "Trond" } },
}
```

이걸 **정규화(normalization)**라고 한다. 흔한 설명은 "중복이 사라져서"인데, 더 근본적인 이유가 있다.

**중첩된 구조로는 여러 대 여러 관계를 표현할 수 없기 때문이다.**

첫 번째 모양에서 작성자는 글 *안에* 들어 있다. 그런데 같은 사람이 글을 여러 개 쓰면 어떻게 될까.

```diagram
tree-to-graph
```

**같은 사람이 글 수만큼 복사된다.** 이름을 바꾸면 전부 고쳐야 하고, 하나라도 빠뜨리면 화면마다 다른 이름이 뜬다.

[1편](/posts/structure-terms-ontology-topology-taxonomy)에서 본 **"한 항목은 부모를 하나만 가진다"**는 트리의 한계 그대로다. 옷장 서랍 문제가 상태 관리에서 되풀이된다.

정규화는 이 트리를 **각각의 덩어리와 번호 연결로 분해한다.** 그리고 `authorId: 7`은 결국 이런 뜻이다.

```
글1  ──작성자──▶  사람7
```

앞 글에서 본 세 조각짜리 사실, 그대로다. **좋은 상태 설계는 대체로 "트리에서 그래프로" 가는 방향**이다.

---

## 4. GraphQL과 SPARQL — 닮았지만 반대편

마지막은 질의다. 이름부터 그래프인 GraphQL은 앞 글의 SPARQL과 자주 비교된다. 실제로 둘 다 **원하는 모양을 그려서 묻는다.**

```graphql
query {
  post(id: 1) {
    title
    author { name }
  }
}
```

"글의 제목, 그리고 그 글 작성자의 이름"처럼 **경로를 그대로 쓴다.** SPARQL의 빈칸 채우기와 발상이 비슷하다.

그런데 전제가 정반대다.

| | GraphQL | SPARQL |
|---|---|---|
| 구조 | 미리 정해 둠 | 없어도 됨 |
| 물어볼 수 있는 것 | 서버가 정의한 것만 | 데이터에 있는 아무 경로나 |
| 새 정보 추가 | 서버를 고쳐야 함 | 줄만 추가 |
| 강점 | 예측 가능, 타입 안전 | 유연함 |

GraphQL은 **닫힌 세계(closed-world assumption)**를 가정한다. 내 서버가 아는 것만 다루니 안전하고 도구 지원이 좋다. SPARQL은 **열린 세계(open-world assumption)**를 가정한다. 누가 어떤 사실을 덧붙일지 모르니 유연하지만 보장이 약하다.

어느 쪽이 낫다기보다 **내 데이터가 닫혀 있는지 열려 있는지**의 문제다. 우리가 만드는 서비스 API는 대개 닫혀 있고, 위키 같은 지식 데이터는 열려 있다.

---

## 그래서 다음 걸음은

여기까지가 "이미 쓰고 있다"는 이야기였다. 그럼 **한 걸음 더 갈 곳**은 어디일까.

확인해 보니 이 블로그에는 `openGraph`는 있지만 **JSON-LD는 아직 없다.** 앞 글에서 본, 검색 엔진에 글 정보를 정확히 알려주는 그 형식이다. 가장 값싸고 효과가 확실한 다음 걸음이 여기다.

Next.js에서는 스크립트 태그 하나를 렌더하면 끝난다.

```tsx
export function PostJsonLd({ post }: { post: Post }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    keywords: post.tags,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

새로 만들 데이터가 없다는 점이 중요하다. **글 맨 위에 이미 적어 둔 제목·요약·날짜·태그를 형식만 바꿔 내보내는 것**이다.

여기까지 되면 [3편](/posts/ontology-taxonomy-and-blog-ia)에서 숙제로 남긴 "관계 이름표"도 자연스럽게 붙일 수 있다. 이것도 직접 만들 필요 없이 `schema.org`에 이미 있는 것을 쓰면 된다.

- 먼저 읽어야 할 글 → `isBasedOn`
- 시리즈 묶음 → `isPartOf`
- 관련 글 → `relatedLink`

---

## 정리

네 가지를 한 줄씩 다시 적으면 이렇다.

- **메타태그** — 페이지에 대한 사실을 기계가 읽는 형식으로 적은 것. 이미 RDF를 쓰고 있다.
- **접근성** — 역할 분류는 택소노미이고, 브라우저는 그 위에서 **안 적은 것까지 추론한다.**
- **정규화** — 트리를 그래프로 바꾸는 일. 여러 대 여러 관계를 담으려면 필연이다.
- **GraphQL** — 같은 그래프 질의지만 **닫힌 세계(closed-world assumption)**를 택했다는 점이 SPARQL과 다르다.

시리즈를 시작할 때는 온톨로지가 프론트엔드와 먼 이야기인 줄 알았다. 다 쓰고 나니 반대였다. **이 개념들은 이미 웹 플랫폼에 깔려 있었고, 이름을 알고 나니 따로 알던 것들이 한 줄로 꿰였다.**

시맨틱 태그를 쓰는 이유, 상태를 정규화하는 이유, 메타태그를 넣는 이유가 전부 같은 뿌리였다. **"기계가 알아들을 수 있게 의미를 적어 둔다."** 그게 전부다.

다만 여기까지는 온톨로지의 얕은 쪽이다. 이걸 **목숨이 걸린 수준으로 진지하게 쓰는 분야**가 따로 있다. [마지막 글](/posts/ontology-in-the-wild)에서 위키데이터에 직접 질의해 보고, 병원과 군에서 어떻게 쓰이는지 본다.
