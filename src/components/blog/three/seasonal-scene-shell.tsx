"use client";

import dynamic from "next/dynamic";

const SeasonalScene = dynamic(
  () => import("./seasonal-scene").then((m) => m.SeasonalScene),
  { ssr: false },
);

export function SeasonalSceneShell() {
  return <SeasonalScene />;
}
