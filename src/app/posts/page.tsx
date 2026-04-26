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
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Archive</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">전체 글 목록</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          검색, 카테고리, 태그, 정렬을 조합해서 필요한 글을 빠르게 찾을 수 있도록 정리한 아카이브입니다.
        </p>
      </section>

      <PostsExplorer posts={getAllPosts()} categories={getCategories()} tags={getTags()} />
    </div>
  );
}
