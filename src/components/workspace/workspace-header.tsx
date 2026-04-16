"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Coins,
  Loader2,
  FolderOpen,
  CreditCard,
  Gift,
  KeyRound,
  Shield,
  LogOut,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface WorkspaceHeaderProps {
  onCredits?: () => void;
  onReferral?: () => void;
  onSettings?: () => void;
}

export function WorkspaceHeader({
  onCredits,
  onReferral,
  onSettings,
}: WorkspaceHeaderProps) {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "tr";

  const [balance, setBalance] = useState<number | null>(null);
  const [userInitial, setUserInitial] = useState("U");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/credits/balance");
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance ?? 0);
        }
      } catch {
        /* silently fail */
      }
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          setUserInitial(user.email[0].toUpperCase());
          setUserEmail(user.email);
        }
      } catch {
        /* silently fail */
      }
      try {
        const res = await fetch("/api/admin/check");
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(data.isAdmin === true);
        }
      } catch {
        /* silently fail */
      }
    }
    fetchData();

    function handleJobSubmitted() {
      fetch("/api/credits/balance")
        .then((r) => r.json())
        .then((d) => setBalance(d.balance ?? 0))
        .catch(() => {});
    }
    window.addEventListener("job-submitted", handleJobSubmitted);
    return () =>
      window.removeEventListener("job-submitted", handleJobSubmitted);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  }

  const isTr = locale === "tr";

  return (
    <header className="flex h-14 flex-none items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold">
          <span className="text-primary">Render</span>
          <span className="text-foreground">hane</span>
        </span>
      </div>

      {/* Right: Credits + Theme + User Menu */}
      <div className="flex items-center gap-2">
        {/* Credit badge */}
        <button
          onClick={onCredits}
          className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 hover:bg-muted/80 transition-colors"
        >
          <Coins className="h-3.5 w-3.5 text-primary" />
          {balance !== null ? (
            <span className="text-sm font-semibold tabular-nums">
              {balance}
            </span>
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </button>

        <ThemeToggle />

        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            {/* User info */}
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium truncate">
                {userEmail ?? "..."}
              </p>
              {balance !== null && (
                <p className="text-xs text-muted-foreground">
                  {balance} {isTr ? "kredi" : "credits"}
                </p>
              )}
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {/* Navigation items */}
            <DropdownMenuItem asChild>
              <Link
                href={`/${locale}/app/projects`}
                className="flex items-center gap-2 cursor-pointer"
              >
                <FolderOpen className="h-4 w-4" />
                {isTr ? "Projeler" : "Projects"}
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={onCredits}
              className="flex items-center gap-2 cursor-pointer"
            >
              <CreditCard className="h-4 w-4" />
              {isTr ? "Krediler" : "Credits"}
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={onReferral}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Gift className="h-4 w-4" />
              {isTr ? "Davet Et" : "Referral"}
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={onSettings}
              className="flex items-center gap-2 cursor-pointer"
            >
              <KeyRound className="h-4 w-4" />
              {isTr ? "Ayarlar" : "Settings"}
            </DropdownMenuItem>

            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href={`/${locale}/app/admin`}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Shield className="h-4 w-4" />
                    {isTr ? "Yonetim" : "Admin"}
                  </Link>
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleLogout}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              {isTr ? "Cikis Yap" : "Logout"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
