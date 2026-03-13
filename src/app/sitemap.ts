import { MetadataRoute } from "next";

import { siteConfig } from "@/lib/blog/config";
import { getCategories, getPostSlugs, getTags } from "@/lib/blog/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = ["", "/posts", "/about"].map((route) => ({
    url: `${siteConfig.siteUrl}${route}`,
    lastModified: new Date(),
  }));

  const posts = getPostSlugs().map((slug) => ({
    url: `${siteConfig.siteUrl}/posts/${slug}`,
    lastModified: new Date(),
  }));

  const categories = getCategories().map((category) => ({
    url: `${siteConfig.siteUrl}/categories/${category.slug}`,
    lastModified: new Date(),
  }));

  const tags = getTags().map((tag) => ({
    url: `${siteConfig.siteUrl}/tags/${tag.slug}`,
    lastModified: new Date(),
  }));

  return [...staticPages, ...posts, ...categories, ...tags];
}
