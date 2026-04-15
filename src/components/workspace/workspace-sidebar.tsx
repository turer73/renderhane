"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FolderOpen,
  CreditCard,
  Gift,
  KeyRound,
  Shield,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Coins,
  Loader2,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WorkspaceSidebarProps {
  onCredits: () => void;
  onReferral: () => void;
  onSettings: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  id: string;
  labelTr: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
  adminOnly?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const LS_KEY = "ws-sidebar-collapsed";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WorkspaceSidebar({
  onCredits,
  onReferral,
  onSettings,
  mobileOpen,
  onMobileClose,
}: WorkspaceSidebarProps) {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "tr";

  /* --- State --- */
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(LS_KEY) !== "false";
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  /* --- Toggle --- */
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_KEY, String(next));
      return next;
    });
  }

  /* --- Data fetching --- */
  useEffect(() => {
    // Admin check
    fetch("/api/admin/check")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setIsAdmin(d.isAdmin); })
      .catch(() => {});

    // Credit balance
    function refreshBalance() {
      fetch("/api/credits/balance")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setBalance(d.balance ?? 0); })
        .catch(() => {});
    }
    refreshBalance();

    // User email
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });

    // Listen for job submissions to refresh balance
    window.addEventListener("job-submitted", refreshBalance);
    return () => window.removeEventListener("job-submitted", refreshBalance);
  }, []);

  /* --- Logout --- */
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  }

  /* --- Nav items --- */
  const navItems: NavItem[] = [
    {
      id: "projects",
      labelTr: "Projeler",
      labelEn: "Projects",
      icon: FolderOpen,
      href: `/${locale}/app/projects`,
    },
    {
      id: "credits",
      labelTr: "Krediler",
      labelEn: "Credits",
      icon: CreditCard,
      onClick: onCredits,
    },
    {
      id: "referral",
      labelTr: "Davet",
      labelEn: "Referral",
      icon: Gift,
      onClick: onReferral,
    },
    {
      id: "settings",
      labelTr: "Ayarlar",
      labelEn: "Settings",
      icon: KeyRound,
      onClick: onSettings,
    },
    {
      id: "admin",
      labelTr: "Yonetim",
      labelEn: "Admin",
      icon: Shield,
      href: `/${locale}/app/admin`,
      adminOnly: true,
    },
  ];

  const filteredItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  function label(item: NavItem) {
    return locale === "en" ? item.labelEn : item.labelTr;
  }

  /* ---------------------------------------------------------------- */
  /*  Shared sidebar content                                           */
  /* ---------------------------------------------------------------- */

  function renderNav(showLabels: boolean) {
    return (
      <nav className="flex flex-col gap-1 px-2">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const text = label(item);

          const inner = (
            <span
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-accent",
                !showLabels && "justify-center px-0"
              )}
            >
              <Icon className="h-5 w-5 flex-none" />
              {showLabels && <span className="truncate">{text}</span>}
            </span>
          );

          if (item.href) {
            return showLabels ? (
              <Link key={item.id} href={item.href} onClick={onMobileClose}>
                {inner}
              </Link>
            ) : (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Link href={item.href}>{inner}</Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {text}
                </TooltipContent>
              </Tooltip>
            );
          }

          return showLabels ? (
            <button
              key={item.id}
              onClick={() => {
                item.onClick?.();
                onMobileClose();
              }}
              className="text-left"
            >
              {inner}
            </button>
          ) : (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button onClick={item.onClick} className="text-left w-full">
                  {inner}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {text}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    );
  }

  function renderBottom(showLabels: boolean) {
    return (
      <div className="border-t border-border px-2 py-3 space-y-2">
        {/* Credit balance */}
        {showLabels ? (
          <button
            onClick={onCredits}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Coins className="h-5 w-5 flex-none text-primary" />
            {balance !== null ? (
              <span className="font-semibold tabular-nums">{balance}</span>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCredits}
                className="flex w-full items-center justify-center rounded-lg py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <div className="relative">
                  <Coins className="h-5 w-5 text-primary" />
                  {balance !== null && (
                    <span className="absolute -top-1.5 -right-2.5 text-[10px] font-bold tabular-nums text-primary">
                      {balance > 999 ? "999+" : balance}
                    </span>
                  )}
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {balance !== null
                ? `${balance} ${locale === "en" ? "credits" : "kredi"}`
                : locale === "en"
                  ? "Loading..."
                  : "Yukleniyor..."}
            </TooltipContent>
          </Tooltip>
        )}

        {/* User email + logout */}
        {showLabels ? (
          <div className="flex items-center gap-2 px-3 py-1">
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {userEmail ?? ""}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className="flex-none rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {locale === "en" ? "Logout" : "Cikis"}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-center rounded-lg py-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {locale === "en" ? "Logout" : "Cikis"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Desktop sidebar                                                  */
  /* ---------------------------------------------------------------- */

  const desktopSidebar = (
    <aside
      className={cn(
        "hidden md:flex flex-col flex-none border-r border-border bg-card/50 transition-[width] duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      {/* Toggle button */}
      <div
        className={cn(
          "flex h-14 flex-none items-center border-b border-border px-2",
          collapsed ? "justify-center" : "justify-end"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleCollapsed}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {collapsed
              ? locale === "en"
                ? "Expand sidebar"
                : "Kenar cubugunu ac"
              : locale === "en"
                ? "Collapse sidebar"
                : "Kenar cubugunu kapat"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto py-3">
        {renderNav(!collapsed)}
      </div>

      {/* Bottom section */}
      {renderBottom(!collapsed)}
    </aside>
  );

  /* ---------------------------------------------------------------- */
  /*  Mobile drawer                                                    */
  /* ---------------------------------------------------------------- */

  const mobileDrawer = (
    <>
      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-card border-r border-border md:hidden",
          "transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button */}
        <div className="flex h-14 flex-none items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold">
            <span className="text-primary">Render</span>
            <span className="text-foreground">hane</span>
          </span>
          <button
            onClick={onMobileClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav items — always expanded on mobile */}
        <div className="flex-1 overflow-y-auto py-3">
          {renderNav(true)}
        </div>

        {/* Bottom section */}
        {renderBottom(true)}
      </aside>
    </>
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <TooltipProvider delayDuration={300}>
      {desktopSidebar}
      {mobileDrawer}
    </TooltipProvider>
  );
}
