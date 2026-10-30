import { IslandGame } from "@/components/island/island-game";
import { getLatestPosts } from "@/lib/blog/posts";

export const metadata = {
  title: "Island",
  description: "블로그 한쪽의 작은 섬. 산책하고, 나무를 흔들고, 꽃을 심으며 쉬어 가는 곳.",
};

export default function IslandPage() {
  const posts = getLatestPosts(12).map(({ slug, title, summary }) => ({ slug, title, summary }));
  return <IslandGame posts={posts} />;
}
