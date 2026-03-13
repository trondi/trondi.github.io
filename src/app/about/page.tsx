import Link from "next/link";

import { TagChip } from "@/components/blog/tag-chip";
import { siteConfig } from "@/lib/blog/config";

const stacks = ["React", "Next.js", "TypeScript", "Tailwind CSS", "Design Systems", "Performance"];

export const metadata = {
  title: "About",
  description: "블로그 작성자 소개와 기술 스택",
};

export default function AboutPage() {
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <section className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">About</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">읽기 좋은 인터페이스와 오래 가는 문서를 만듭니다.</h1>
        <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-slate-300">
          {siteConfig.author.bio} 이 블로그는 구현 결과를 과장해서 보여주기보다, 실제로 다시 찾아 읽을 수 있는 기록을
          남기기 위해 만들었습니다.
        </p>
        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Tech Stack</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {stacks.map((stack) => (
              <TagChip key={stack} label={stack} />
            ))}
          </div>
        </div>
      </section>

      <aside className="rounded-[28px] border border-slate-200 bg-white/80 p-6 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Links</p>
        <div className="mt-5 space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <Link href={siteConfig.author.github} className="flex items-center justify-between transition-colors hover:text-slate-950 dark:hover:text-white">
            <span>GitHub</span>
            <span>→</span>
          </Link>
          <a href={`mailto:${siteConfig.author.email}`} className="flex items-center justify-between transition-colors hover:text-slate-950 dark:hover:text-white">
            <span>Email</span>
            <span>→</span>
          </a>
        </div>
      </aside>
    </div>
  );
}
