"use client";

import { useEffect } from "react";

const STORAGE_KEY = "recently-viewed-posts";
const MAX_ITEMS = 5;

type PostViewTrackerProps = {
  slug: string;
};

export function PostViewTracker({ slug }: PostViewTrackerProps) {
  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [slug, ...parsed.filter((item) => item !== slug)].slice(0, MAX_ITEMS);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [slug]);

  return null;
}
