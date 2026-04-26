import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">찾을 수 없는 페이지입니다.</h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">
        주소가 바뀌었거나 아직 작성되지 않은 글일 수 있습니다. 아카이브에서 다시 탐색해보세요.
      </p>
      <Link
        href="/posts"
        className="mt-8 rounded-full border border-foreground bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-transparent hover:text-foreground"
      >
        글 목록으로 이동
      </Link>
    </div>
  );
}
