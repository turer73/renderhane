"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { TopBar } from "@/components/app/top-bar";
import { BottomNav } from "@/components/app/bottom-nav";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — always visible on lg+ */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Sidebar drawer */}
          <div className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden animate-in slide-in-from-left duration-300">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="flex flex-1 flex-col lg:pl-64">
        <TopBar onMenuClick={() => setMobileOpen((prev) => !prev)} />
        <main className="flex-1 px-4 py-6 pb-20 sm:px-6 lg:px-8 lg:pb-6">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav onMenuClick={() => setMobileOpen((prev) => !prev)} />
    </div>
  );
}
