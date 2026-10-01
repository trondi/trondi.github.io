/**
 * JSON-LD를 <script>로 심는다.
 * 본문에서 온 문자열이 그대로 들어가므로 `<`를 이스케이프해
 * </script>로 태그가 조기 종료되는 것을 막는다.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
