"use client";

import dynamic from "next/dynamic";

const AmbientScene = dynamic(
  () => import("./ambient-scene").then((module) => module.AmbientScene),
  { ssr: false },
);

export function AmbientSceneShell() {
  return <AmbientScene />;
}
