"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Coins, Menu, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface WorkspaceHeaderProps {
  onMenuClick?: () => void;
}

export function WorkspaceHeader({ onMenuClick }: WorkspaceHeaderProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [userInitial, setUserInitial] = useState("U");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/credits/balance");
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance ?? 0);
        }
      } catch { /* silently fail */ }
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setUserInitial(user.email[0].toUpperCase());
      } catch { /* silently fail */ }
    }
    fetchData();

    function handleJobSubmitted() {
      fetch("/api/credits/balance")
        .then((r) => r.json())
        .then((d) => setBalance(d.balance ?? 0))
        .catch(() => {});
    }
    window.addEventListener("job-submitted", handleJobSubmitted);
    return () => window.removeEventListener("job-submitted", handleJobSubmitted);
  }, []);

  return (
    <header className="flex h-14 flex-none items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4">
      {/* Left: Hamburger (mobile) + Logo */}
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <span className="text-lg font-bold">
          <span className="text-primary">Render</span>
          <span className="text-foreground">hane</span>
        </span>
      </div>

      {/* Right: Credits + Theme + Profile */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
          <Coins className="h-3.5 w-3.5 text-primary" />
          {balance !== null ? (
            <span className="text-sm font-semibold tabular-nums">{balance}</span>
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        <ThemeToggle />
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {userInitial}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
