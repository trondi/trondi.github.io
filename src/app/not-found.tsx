import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">찾을 수 없는 페이지입니다.</h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
        주소가 바뀌었거나 아직 작성되지 않은 글일 수 있습니다. 아카이브에서 다시 탐색해보세요.
      </p>
      <Link
        href="/posts"
        className="mt-8 rounded-full border border-slate-900 bg-slate-900 px-5 py-3 text-sm font-medium text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950"
      >
        글 목록으로 이동
      </Link>
    </div>
  );
}
