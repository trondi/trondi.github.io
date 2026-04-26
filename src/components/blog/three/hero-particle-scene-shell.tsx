"use client";

import dynamic from "next/dynamic";

const HeroParticleScene = dynamic(
  () => import("./hero-particle-scene").then((m) => m.HeroParticleScene),
  { ssr: false },
);

export function HeroParticleSceneShell() {
  return <HeroParticleScene />;
}
