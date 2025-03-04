"use client";

import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/admin-panel/sidebar";
import { useAppSelector } from "@/hooks/reduxHooks";
import Header from "@components/Header";
import React from "react";

export default function AdminPanelLayout({ children }) {
  const isSidebarOpen = useAppSelector((state) => state.sidebar?.isOpen);
  return (
    <div className="h-screen w-full">
      <Sidebar />
      <div
        className={cn(
          "flex flex-col flex-1 min-h-screen bg-zinc-50 dark:bg-zinc-900 transition-[padding-left] ease-in-out duration-300",
          !isSidebarOpen ? "lg:ml-[90px]" : "lg:ml-72",
          "relative z-[10]",
        )}
      >
        <Header />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
