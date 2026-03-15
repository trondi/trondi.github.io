"use client";

import dynamic from "next/dynamic";

type CategorySceneShellProps = {
  slug: string;
};

const CategoryScene = dynamic(
  () => import("./category-scene").then((module) => module.CategoryScene),
  { ssr: false },
);

export function CategorySceneShell({ slug }: CategorySceneShellProps) {
  return <CategoryScene slug={slug} />;
}
