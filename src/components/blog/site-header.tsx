import { SiteHeaderClient } from "@/components/blog/site-header-client";
import { siteConfig } from "@/lib/blog/config";
import { getCategories, getSearchIndex } from "@/lib/blog/posts";
import { slugify } from "@/lib/blog/utils";

export function SiteHeader() {
  const categories = getCategories().map((category) => ({
    ...category,
    href: `/categories/${slugify(category.name)}`,
  }));
  const searchEntries = getSearchIndex();

  return (
    <SiteHeaderClient
      title={siteConfig.title}
      intro={siteConfig.intro}
      primaryNav={siteConfig.primaryNav}
      categories={categories}
      searchEntries={searchEntries}
    />
  );
}
