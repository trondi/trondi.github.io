"use client";

import dynamic from "next/dynamic";

const HeroTorusScene = dynamic(
  () => import("./hero-torus-scene").then((m) => m.HeroTorusScene),
  { ssr: false },
);

export function HeroTorusSceneShell() {
  return <HeroTorusScene />;
}
