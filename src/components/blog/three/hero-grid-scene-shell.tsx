"use client";

import dynamic from "next/dynamic";

const HeroGridScene = dynamic(
  () => import("./hero-grid-scene").then((module) => module.HeroGridScene),
  { ssr: false },
);

export function HeroGridSceneShell() {
  return <HeroGridScene />;
}
