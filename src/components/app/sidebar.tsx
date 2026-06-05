"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useParams, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  FolderOpen,
  Shield,
  LogOut,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const t = useTranslations("common");
  const tSidebar = useTranslations("sidebar");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const pathname = usePathname();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userInitial, setUserInitial] = useState("U");
  const [balance, setBalance] = useState<number | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const maxCredits = 800; // Pro package max (for progress bar scaling)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
        setUserInitial(user.email[0].toUpperCase());
      }

      try {
        const res = await fetch("/api/credits/balance");
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance ?? 0);
        }
      } catch {
        // silently fail
      }

      // Check admin status
      try {
        const adminRes = await fetch("/api/admin/check");
        if (adminRes.ok) {
          const adminData = await adminRes.json();
          setIsAdminUser(adminData.isAdmin === true);
        }
      } catch {
        // silently fail
      }
    }
    fetchData();

    // Listen for job-submitted events to refresh credits
    function handleJobSubmitted() {
      fetch("/api/credits/balance")
        .then((r) => r.json())
        .then((d) => setBalance(d.balance ?? 0))
        .catch(() => {});
    }
    window.addEventListener("job-submitted", handleJobSubmitted);
    return () => window.removeEventListener("job-submitted", handleJobSubmitted);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  }

  const isOnAdmin = pathname.startsWith(`/${locale}/app/admin`);

  const userNavItems = [
    {
      href: `/${locale}/app`,
      label: "Workspace",
      icon: Sparkles,

    },
    {
      href: `/${locale}/app/projects`,
      label: t("projects"),
      icon: FolderOpen,

    },
    ...(isAdminUser
      ? [
          {
            href: `/${locale}/app/admin`,
            label: tSidebar("admin"),
            icon: Shield,
      
          },
        ]
      : []),
  ];

  const adminNavItems = [
    {
      href: `/${locale}/app`,
      label: "Uygulamaya Dön",
      icon: ArrowLeft,

    },
    {
      href: `/${locale}/app/admin`,
      label: tSidebar("admin"),
      icon: Shield,

    },
  ];

  const navItems = isOnAdmin ? adminNavItems : userNavItems;

  function isActive(href: string) {
    if (href === "#") return false;
    return pathname.startsWith(href);
  }

  const isDashboard =
    pathname === `/${locale}/app` || pathname === `/${locale}/app/`;

  const creditPercent =
    balance !== null ? Math.min(100, (balance / maxCredits) * 100) : 0;

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-border/40 bg-background",
        className
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Image
          src="/logo/icon-app.svg"
          width={32}
          height={32}
          alt="Renderhane"
          unoptimized
          className="size-8 rounded-lg"
        />
        <span className="text-lg font-bold tracking-tight">renderhane.</span>
      </div>

      {/* New Production CTA — hidden on admin pages */}
      {!isOnAdmin && (
        <div className="px-4 pb-4">
          <Button
            asChild
            className="w-full gap-2 font-semibold bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            onClick={onNavigate}
          >
            <Link href={`/${locale}/app`}>
              <Sparkles className="size-4" />
              {tSidebar("newProduction")}
            </Link>
          </Button>
        </div>
      )}

      {/* Menu label */}
      <div className="px-5 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {tSidebar("menu")}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section: Credits + User */}
      <div className="mt-auto border-t border-border/40 p-4 space-y-4">
        {/* Credit balance */}
        {balance !== null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {tSidebar("remainingCredits")}
              </span>
              <span className="font-semibold text-foreground">{balance}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-500 dark:bg-indigo-400"
                style={{ width: `${creditPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* User info */}
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold dark:bg-indigo-500/20 dark:text-indigo-300">
              {userInitial}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{userEmail ?? "..."}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label={t("logout")}
            title={t("logout")}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
