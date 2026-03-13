import { PostsExplorer } from "@/components/blog/posts-explorer";
import { getAllPosts, getCategories, getTags } from "@/lib/blog/posts";

export const metadata = {
  title: "Posts",
  description: "카테고리와 태그로 탐색할 수 있는 전체 글 목록",
};

export default function PostsPage() {
  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Archive</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">전체 글 목록</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600 dark:text-slate-300">
          최신순과 오래된 글 순으로 정렬할 수 있고, 카테고리와 태그 조합으로 필요한 문서를 빠르게 좁힐 수 있습니다.
        </p>
      </section>

      <PostsExplorer posts={getAllPosts()} categories={getCategories()} tags={getTags()} />
    </div>
  );
}
