"use client";

import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/admin-panel/sidebar";
import { useAppSelector } from "@/hooks/reduxHooks";
import Header from "@components/Header";
import React from "react";

export default function AdminPanelLayout({ children }) {
  const isSidebarOpen = useAppSelector((state) => state.sidebar?.isOpen);
  return (
    <div className={`h-screen w-full flex`}>
      <Sidebar />
      <div
        className={cn(
          "min-h-[calc(100vh_-_56px)] bg-zinc-50 dark:bg-zinc-900 transition-[margin-left] ease-in-out duration-300",
          !isSidebarOpen ? "lg:ml-[90px]" : "lg:ml-72",
          "relative z-[10]",
        )}
      >
        <Header />
        {children}
      </div>
    </div>
  );
}
