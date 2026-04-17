"use client";

import { createContext, useContext, useState } from "react";
import type { Season } from "@/lib/season";

type SeasonalContextValue = {
  activeSeason: Season | null;
  setActiveSeason: (s: Season | null) => void;
};

const SeasonalContext = createContext<SeasonalContextValue | null>(null);

export function SeasonalProvider({ children }: { children: React.ReactNode }) {
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  return (
    <SeasonalContext.Provider value={{ activeSeason, setActiveSeason }}>
      {children}
    </SeasonalContext.Provider>
  );
}

export function useSeasonalContext() {
  const ctx = useContext(SeasonalContext);
  if (!ctx) throw new Error("useSeasonalContext must be used inside SeasonalProvider");
  return ctx;
}
