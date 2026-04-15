# Workspace Single-Screen Transformation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the dashboard at `/app` — make workspace THE single main screen with a collapsible navigation sidebar for Credits, Referral, Settings, Admin access.

**Architecture:**
- `/app` renders workspace directly (dashboard page eliminated)
- New collapsible `WorkspaceSidebar` on the left: collapsed = icons (52px), expanded = icons + labels + credit balance (240px)
- Credits, Referral, Settings open as Sheet panels (slide from right) triggered from sidebar
- Projects and Admin remain as separate pages (linked from sidebar)
- Old routes redirect via middleware: `/app/workspace` → `/app`, `/app/credits` → `/app`, `/app/batch` → `/app`
- Mobile: sidebar becomes a hamburger-activated drawer in WorkspaceHeader
- iyzico payment callback updated: `/app/credits?status=X` → `/app?payment=X`

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui Sheet, react-resizable-panels

---

## Task 1: Install shadcn Sheet component

**Files:**
- Create: `src/components/ui/sheet.tsx`

**Step 1: Install Sheet**

```bash
npx shadcn@latest add sheet
```

**Step 2: Verify file exists**

```bash
ls src/components/ui/sheet.tsx
```

Expected: file exists

**Step 3: Commit**

```bash
git add src/components/ui/sheet.tsx
git commit -m "chore: add shadcn Sheet component for workspace panels"
```

---

## Task 2: Create WorkspaceSidebar component

**Files:**
- Create: `src/components/workspace/workspace-sidebar.tsx`
- Modify: `src/components/workspace/index.ts`

**Step 1: Create WorkspaceSidebar**

Create `src/components/workspace/workspace-sidebar.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WorkspaceSidebarProps {
  onCredits: () => void;
  onReferral: () => void;
  onSettings: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  action: "link" | "sheet";
  href?: string;
  onClick?: () => void;
  adminOnly?: boolean;
}

export function WorkspaceSidebar({
  onCredits,
  onReferral,
  onSettings,
  mobileOpen,
  onMobileClose,
}: WorkspaceSidebarProps) {
  const params = useParams<{ locale: string }>();
  const pathname = usePathname();
  const locale = params?.locale || "tr";

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ws-sidebar-collapsed") !== "false";
    }
    return true;
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem("ws-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  // Fetch user info, admin status, balance
  useEffect(() => {
    async function init() {
      try {
        const [adminRes, balanceRes] = await Promise.all([
          fetch("/api/admin/check").catch(() => null),
          fetch("/api/credits/balance").catch(() => null),
        ]);
        if (adminRes?.ok) {
          const d = await adminRes.json();
          setIsAdmin(d.isAdmin === true);
        }
        if (balanceRes?.ok) {
          const d = await balanceRes.json();
          setBalance(d.balance ?? 0);
        }
      } catch { /* silent */ }
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setUserEmail(user.email);
      } catch { /* silent */ }
    }
    init();

    // Refresh balance on job-submitted
    function onJobSubmitted() {
      fetch("/api/credits/balance")
        .then((r) => r.json())
        .then((d) => setBalance(d.balance ?? 0))
        .catch(() => {});
    }
    window.addEventListener("job-submitted", onJobSubmitted);
    return () => window.removeEventListener("job-submitted", onJobSubmitted);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    onMobileClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const navItems: NavItem[] = [
    {
      id: "projects",
      label: locale === "tr" ? "Projeler" : "Projects",
      icon: FolderOpen,
      action: "link",
      href: `/${locale}/app/projects`,
    },
    {
      id: "credits",
      label: locale === "tr" ? "Krediler" : "Credits",
      icon: CreditCard,
      action: "sheet",
      onClick: onCredits,
    },
    {
      id: "referral",
      label: locale === "tr" ? "Davet Et" : "Referral",
      icon: Gift,
      action: "sheet",
      onClick: onReferral,
    },
    {
      id: "settings",
      label: locale === "tr" ? "Ayarlar" : "Settings",
      icon: KeyRound,
      action: "sheet",
      onClick: onSettings,
    },
    {
      id: "admin",
      label: "Admin",
      icon: Shield,
      action: "link",
      href: `/${locale}/app/admin`,
      adminOnly: true,
    },
  ];

  const filteredNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  }

  function SidebarContent({ isMobile = false }: { isMobile?: boolean }) {
    const showLabels = isMobile || !collapsed;

    return (
      <div className="flex h-full flex-col">
        {/* Toggle / Close */}
        <div className="flex items-center justify-between px-3 py-3">
          {showLabels && (
            <span className="text-sm font-bold">
              <span className="text-primary">Render</span>
              <span className="text-foreground">hane</span>
            </span>
          )}
          <button
            onClick={isMobile ? onMobileClose : () => setCollapsed(!collapsed)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {isMobile ? (
              <X className="h-5 w-5" />
            ) : collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 space-y-1 px-2">
          <TooltipProvider delayDuration={300}>
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href && pathname?.includes(item.href.split("/").pop()!);

              const button = (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.action === "link" && item.href) {
                      window.location.href = item.href;
                    } else if (item.onClick) {
                      item.onClick();
                      if (isMobile) onMobileClose();
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    "text-muted-foreground hover:bg-accent hover:text-foreground",
                    isActive && "bg-primary/10 text-primary font-medium",
                    !showLabels && "justify-center px-0"
                  )}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {showLabels && <span>{item.label}</span>}
                </button>
              );

              if (!showLabels) {
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return button;
            })}
          </TooltipProvider>
        </nav>

        {/* Bottom: Balance + User */}
        <div className="border-t border-border/50 px-2 py-3 space-y-2">
          {/* Credit Balance */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 cursor-pointer hover:bg-muted transition-colors",
              !showLabels && "justify-center px-2"
            )}
            onClick={onCredits}
          >
            <Coins className="h-4 w-4 text-primary shrink-0" />
            {showLabels && (
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">
                  {locale === "tr" ? "Kredi" : "Credits"}
                </p>
                <p className="text-sm font-bold tabular-nums">
                  {balance !== null ? balance : (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                </p>
              </div>
            )}
          </div>

          {/* User + Logout */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2",
              !showLabels && "justify-center px-2"
            )}
          >
            {showLabels && userEmail && (
              <span className="flex-1 truncate text-xs text-muted-foreground">
                {userEmail}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={showLabels ? "top" : "right"}>
                {locale === "tr" ? "Çıkış Yap" : "Logout"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop sidebar — always visible on md+ */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border/50 bg-card/80 backdrop-blur-sm flex-none",
          "transition-all duration-200 ease-in-out",
          collapsed ? "w-[52px]" : "w-[220px]"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={onMobileClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[280px] bg-card shadow-xl md:hidden animate-in slide-in-from-left duration-300">
            <SidebarContent isMobile />
          </aside>
        </>
      )}
    </>
  );
}
```

**Step 2: Update workspace/index.ts exports**

Add to `src/components/workspace/index.ts`:
```ts
export { WorkspaceSidebar } from "./workspace-sidebar";
```

**Step 3: Verify no type errors**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/components/workspace/workspace-sidebar.tsx src/components/workspace/index.ts
git commit -m "feat: add WorkspaceSidebar with collapsible nav + mobile drawer"
```

---

## Task 3: Create CreditsSheet component

**Files:**
- Create: `src/components/workspace/credits-sheet.tsx`

**Step 1: Create CreditsSheet**

Move the pricing card UI from `src/app/[locale]/(app)/app/credits/page.tsx` into a Sheet wrapper. The Sheet slides in from the right.

Create `src/components/workspace/credits-sheet.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Coins, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { PackageKey } from "@/lib/payments/iyzico";

const PACKAGE_KEYS: PackageKey[] = ["monthly", "starter", "standard", "pro"];

interface CreditsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreditsSheet({ open, onOpenChange }: CreditsSheetProps) {
  const t = useTranslations("credits");
  const tp = useTranslations("landing.pricing");

  const [balance, setBalance] = useState<number | null>(null);
  const [loadingPackage, setLoadingPackage] = useState<PackageKey | null>(null);

  // Fetch balance when sheet opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {});
  }, [open]);

  async function handleBuy(packageKey: PackageKey) {
    setLoadingPackage(packageKey);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey }),
      });
      if (!res.ok) throw new Error("Checkout failed");
      const data = await res.json();
      if (data.paymentPageUrl) {
        window.location.href = data.paymentPageUrl;
      } else {
        throw new Error("No payment page URL");
      }
    } catch {
      toast.error(t("purchaseError"));
      setLoadingPackage(null);
    }
  }

  function getFeatures(key: PackageKey): string[] {
    const features: string[] = [];
    features.push(tp(`${key}.feature1`));
    features.push(tp(`${key}.feature2`));
    features.push(tp(`${key}.feature3`));
    if (key === "pro") {
      const f4 = tp(`${key}.feature4`);
      if (f4) features.push(f4);
    }
    return features;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-indigo-500" />
            {t("purchaseTitle")}
          </SheetTitle>
          <SheetDescription>{t("purchaseSubtitle")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Current Balance */}
          <Card className="border-indigo-200/50 bg-indigo-50/30 dark:border-indigo-500/20 dark:bg-indigo-500/5">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <Coins className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <p className="text-xs text-muted-foreground">{t("currentBalance")}</p>
                <p className="text-xl font-bold">{balance !== null ? balance : "--"}</p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Pricing Cards */}
          <div className="space-y-4">
            {PACKAGE_KEYS.map((key) => {
              const isPopular = key === "standard";
              return (
                <Card
                  key={key}
                  className={`relative ${
                    isPopular
                      ? "border-indigo-500 shadow-lg ring-1 ring-indigo-500/20"
                      : "border-border/50 hover:border-indigo-300 dark:hover:border-indigo-700"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="gap-1">
                        <Sparkles className="h-3 w-3" />
                        {tp("mostPopular")}
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{tp(`${key}.name`)}</CardTitle>
                      <span className="text-xl font-bold">{tp(`${key}.price`)}</span>
                    </div>
                    <CardDescription className="text-xs">{tp(`${key}.description`)}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <Badge variant="secondary" className="text-xs mb-2">{tp(`${key}.credits`)}</Badge>
                    <ul className="space-y-1">
                      {getFeatures(key).map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <Check className="h-3 w-3 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className={`w-full ${isPopular ? "bg-indigo-600 text-white hover:bg-indigo-700" : ""}`}
                      variant={isPopular ? "default" : "outline"}
                      onClick={() => handleBuy(key)}
                      disabled={loadingPackage !== null}
                    >
                      {loadingPackage === key ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("processing")}</>
                      ) : (
                        tp("buyNow")
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/workspace/index.ts`:
```ts
export { CreditsSheet } from "./credits-sheet";
```

**Step 3: Commit**

```bash
git add src/components/workspace/credits-sheet.tsx src/components/workspace/index.ts
git commit -m "feat: add CreditsSheet panel for workspace sidebar"
```

---

## Task 4: Create ReferralSheet component

**Files:**
- Create: `src/components/workspace/referral-sheet.tsx`

**Step 1: Create ReferralSheet**

This wraps the existing `ReferralCard` component in a Sheet. Create `src/components/workspace/referral-sheet.tsx`:

```tsx
"use client";

import { ReferralCard } from "@/components/app/referral-card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Gift } from "lucide-react";

interface ReferralSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReferralSheet({ open, onOpenChange }: ReferralSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-indigo-500" />
            Davet Programi
          </SheetTitle>
          <SheetDescription>
            Arkadas davet et, ucretsiz kredi kazan
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <ReferralCard />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/workspace/index.ts`:
```ts
export { ReferralSheet } from "./referral-sheet";
```

**Step 3: Commit**

```bash
git add src/components/workspace/referral-sheet.tsx src/components/workspace/index.ts
git commit -m "feat: add ReferralSheet panel for workspace sidebar"
```

---

## Task 5: Create SettingsSheet component

**Files:**
- Create: `src/components/workspace/settings-sheet.tsx`

**Step 1: Create SettingsSheet**

Move API key management from `src/app/[locale]/(app)/app/settings/page.tsx` into a Sheet. Create `src/components/workspace/settings-sheet.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
  Code2,
  AlertTriangle,
  Loader2,
  Shield,
} from "lucide-react";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const t = useTranslations("settings");

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) fetchKeys();
  }, [open]);

  async function fetchKeys() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create key"); return; }
      setNewRawKey(data.key);
      setNewKeyName("");
      fetchKeys();
    } catch { setError("Network error"); }
    finally { setCreating(false); }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm(t("revokeConfirm"))) return;
    try {
      await fetch("/api/v1/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      fetchKeys();
    } catch { /* silent */ }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("tr-TR", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  const activeKeys = keys.filter((k) => k.is_active);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-indigo-500" />
            {t("title")}
          </SheetTitle>
          <SheetDescription>{t("apiKeysDesc")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Create Button */}
          {!showCreate && !newRawKey && activeKeys.length < 5 && (
            <Button onClick={() => setShowCreate(true)} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 w-full">
              <Plus className="size-4" />{t("createKey")}
            </Button>
          )}

          {/* New Key Display */}
          {newRawKey && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-500/10">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("keyCreated")}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-xs break-all border dark:bg-background">
                      {showKey ? newRawKey : newRawKey.slice(0, 11) + "\u2022".repeat(20)}
                    </code>
                    <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)}>
                      {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(newRawKey)}>
                      {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setNewRawKey(null); setShowKey(false); setShowCreate(false); }} className="text-xs">
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Create Form */}
          {showCreate && !newRawKey && (
            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder={t("keyNamePlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={!newKeyName.trim() || creating} className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700">
                  {creating && <Loader2 className="size-4 animate-spin mr-1" />}{t("create")}
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>{t("cancel")}</Button>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          {/* Keys List */}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : keys.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center">
              <Key className="mx-auto mb-2 size-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("noKeys")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map((key) => (
                <div key={key.id} className={`flex items-center gap-3 rounded-xl border p-3 ${key.is_active ? "border-border/60 bg-card" : "opacity-50"}`}>
                  <Key className="size-4 text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{key.name}</span>
                      <Badge variant={key.is_active ? "default" : "secondary"} className={`text-[10px] ${key.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : ""}`}>
                        {key.is_active ? t("active") : t("revoked")}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      <code>{key.key_prefix}...</code> {" \u2022 "} {formatDate(key.created_at)}
                    </p>
                  </div>
                  {key.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => handleRevoke(key.id)} className="text-red-500 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeKeys.length >= 5 && (
            <p className="text-xs text-muted-foreground">{t("maxKeys")}</p>
          )}

          {/* API Docs Quick Ref */}
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Code2 className="size-4 text-indigo-500" />{t("docsTitle")}
            </h3>
            <div className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-200">
              <pre className="font-mono">{`curl -H "Authorization: Bearer rh_your_key" \\
  https://www.renderhane.com/api/v1/balance`}</pre>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <Shield className="size-3.5 shrink-0" />{t("rateLimitInfo")}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/workspace/index.ts`:
```ts
export { SettingsSheet } from "./settings-sheet";
```

**Step 3: Commit**

```bash
git add src/components/workspace/settings-sheet.tsx src/components/workspace/index.ts
git commit -m "feat: add SettingsSheet panel for workspace sidebar"
```

---

## Task 6: Rewire /app page to render workspace

**Files:**
- Modify: `src/app/[locale]/(app)/app/page.tsx` (complete rewrite)
- Modify: `src/components/app/app-shell.tsx` (update workspace detection)

**Step 1: Rewrite /app/page.tsx**

Replace the entire content of `src/app/[locale]/(app)/app/page.tsx` with the workspace + sidebar + sheets:

```tsx
"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  WorkspaceLayout,
  WorkspaceHeader,
  WorkspaceSidebar,
  CreditsSheet,
  ReferralSheet,
  SettingsSheet,
} from "@/components/workspace";

/** Map tool/tab IDs from registry to workspace category */
const TOOL_TO_CATEGORY: Record<string, string> = {
  "3d-model": "3d-model",
  image: "image",
  video: "video",
  ecommerce: "ecommerce",
  design: "design",
  batch: "batch",
  "bg-remove": "image",
  enhance: "image",
  "text-to-image": "image",
  "image-edit": "image",
  scene: "ecommerce",
  aplus: "ecommerce",
  "virtual-tryon": "ecommerce",
  "social-kit": "ecommerce",
  "talking-avatar": "video",
  logo: "design",
  "qr-code": "design",
};

const VALID_TABS = new Set([
  "bg-remove", "enhance", "text-to-image", "image-edit",
  "scene", "aplus", "virtual-tryon", "talking-avatar",
  "logo", "qr-code",
]);

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "tr";

  const toolParam = searchParams.get("tool");
  const paymentStatus = searchParams.get("payment");

  const initialCategory = toolParam
    ? (TOOL_TO_CATEGORY[toolParam] ?? "3d-model")
    : "3d-model";
  const initialTab =
    toolParam && VALID_TABS.has(toolParam) ? toolParam : undefined;

  const [activeTool, setActiveTool] = useState(initialCategory);

  // Sidebar + Sheet states
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Handle payment callback toast (from iyzico redirect)
  useEffect(() => {
    if (paymentStatus === "success") {
      toast.success(locale === "tr" ? "Odeme basarili! Kredileriniz yuklendi." : "Payment successful! Credits loaded.");
      window.dispatchEvent(new Event("job-submitted")); // triggers balance refresh
    } else if (paymentStatus === "error") {
      toast.error(locale === "tr" ? "Odeme basarisiz. Lutfen tekrar deneyin." : "Payment failed. Please try again.");
    }
    // Clean URL
    if (paymentStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.toString());
    }
  }, [paymentStatus, locale]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <WorkspaceHeader onMenuClick={() => setSidebarMobileOpen((v) => !v)} />

      <div className="flex flex-1 overflow-hidden">
        <WorkspaceSidebar
          onCredits={() => setCreditsOpen(true)}
          onReferral={() => setReferralOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          mobileOpen={sidebarMobileOpen}
          onMobileClose={() => setSidebarMobileOpen(false)}
        />

        <div className="flex-1 min-w-0">
          <WorkspaceLayout
            activeTool={activeTool}
            onToolChange={setActiveTool}
            initialTab={initialTab}
          />
        </div>
      </div>

      {/* Sheet panels */}
      <CreditsSheet open={creditsOpen} onOpenChange={setCreditsOpen} />
      <ReferralSheet open={referralOpen} onOpenChange={setReferralOpen} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

export default function AppDashboard() {
  return (
    <Suspense>
      <WorkspaceContent />
    </Suspense>
  );
}
```

**Step 2: Update AppShell workspace detection**

In `src/components/app/app-shell.tsx`, change line 34 from:

```tsx
const isWorkspace = pathname?.includes("/workspace");
```

To match both `/workspace` AND the exact `/app` page:

```tsx
// Workspace mode: full-screen layout (no sidebar/topbar/bottomnav)
// Matches /xx/app (exact root = workspace), /xx/app/workspace (backward compat)
const isWorkspace = pathname?.includes("/workspace") ||
  /^\/[a-z]{2}\/app\/?$/.test(pathname ?? "");
```

**Step 3: Verify no type errors**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add src/app/[locale]/(app)/app/page.tsx src/components/app/app-shell.tsx
git commit -m "feat: /app renders workspace as single main screen"
```

---

## Task 7: Update WorkspaceHeader

**Files:**
- Modify: `src/components/workspace/workspace-header.tsx`

**Step 1: Add hamburger menu for mobile, remove back button**

The header needs:
- Replace `ArrowLeft` back button with `Menu` hamburger (mobile only, hidden on md+)
- Keep logo, credit balance, theme toggle, avatar
- Accept `onMenuClick` prop for mobile sidebar toggle
- Remove Link to `/app/credits` on credits badge (credits open as Sheet now)

Replace the full content of `src/components/workspace/workspace-header.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Coins, Menu, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface WorkspaceHeaderProps {
  onMenuClick?: () => void;
}

export function WorkspaceHeader({ onMenuClick }: WorkspaceHeaderProps) {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "tr";
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
```

**Step 2: Commit**

```bash
git add src/components/workspace/workspace-header.tsx
git commit -m "refactor: workspace header - hamburger menu, remove back button"
```

---

## Task 8: Update middleware + payment callback

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/app/api/payments/callback/route.ts`

**Step 1: Add middleware redirects**

In `src/middleware.ts`, after the existing tool redirect block (line 13-20), add redirects for old routes:

```tsx
// Redirect /app/workspace → /app (workspace is now the root)
const workspaceMatch = request.nextUrl.pathname.match(
  /^\/([a-z]{2})\/app\/workspace\b/
);
if (workspaceMatch) {
  const [, wLocale] = workspaceMatch;
  const target = new URL(`/${wLocale}/app`, request.url);
  // Preserve query params (e.g. ?tool=bg-remove)
  request.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  return NextResponse.redirect(target);
}

// Redirect /app/credits → /app (credits is now a Sheet panel)
// Preserve ?status= as ?payment= for iyzico callback compat
const creditsMatch = request.nextUrl.pathname.match(
  /^\/([a-z]{2})\/app\/credits\b/
);
if (creditsMatch) {
  const [, cLocale] = creditsMatch;
  const target = new URL(`/${cLocale}/app`, request.url);
  const status = request.nextUrl.searchParams.get("status");
  if (status) target.searchParams.set("payment", status);
  return NextResponse.redirect(target);
}

// Redirect /app/batch → /app (batch is a workspace category)
const batchMatch = request.nextUrl.pathname.match(
  /^\/([a-z]{2})\/app\/batch\b/
);
if (batchMatch) {
  const [, bLocale] = batchMatch;
  return NextResponse.redirect(
    new URL(`/${bLocale}/app`, request.url)
  );
}

// Redirect /app/settings → /app (settings is now a Sheet panel)
const settingsMatch = request.nextUrl.pathname.match(
  /^\/([a-z]{2})\/app\/settings\b/
);
if (settingsMatch) {
  const [, sLocale] = settingsMatch;
  return NextResponse.redirect(
    new URL(`/${sLocale}/app`, request.url)
  );
}
```

**Step 2: Update payment callback route**

In `src/app/api/payments/callback/route.ts`, change ALL redirect URLs from:
```
/${locale}/app/credits?status=success
/${locale}/app/credits?status=error
```
To:
```
/${locale}/app?payment=success
/${locale}/app?payment=error
```

There are 5 redirect calls to update (lines 31-32, 42-43, 53-54, 82-83, 90-91, 96-97).

**Step 3: Update sidebar.tsx navigation**

In `src/components/app/sidebar.tsx`, update the "Workspace" menu item href from `/app/workspace` to `/app`:

Change:
```tsx
{ href: `/${locale}/app/workspace`, ... }
```
To:
```tsx
{ href: `/${locale}/app`, ... }
```

Also update "New Production" CTA button href from `/app/workspace` to `/app`.

**Step 4: Update bottom-nav.tsx**

In `src/components/app/bottom-nav.tsx`, the Dashboard link already points to `/app`, so no change needed for that. But verify all links are correct.

**Step 5: Commit**

```bash
git add src/middleware.ts src/app/api/payments/callback/route.ts src/components/app/sidebar.tsx
git commit -m "feat: add middleware redirects + update payment callback URLs"
```

---

## Task 9: Delete old files + cleanup

**Files to delete:**
- `src/app/[locale]/(app)/app/workspace/page.tsx` (merged into /app/page.tsx)
- `src/app/[locale]/(app)/app/credits/page.tsx` (replaced by CreditsSheet)
- `src/app/[locale]/(app)/app/settings/page.tsx` (replaced by SettingsSheet)
- `src/app/[locale]/(app)/app/batch/page.tsx` (batch is a workspace category)
- `src/components/app/dashboard-content.tsx` (no longer used)

**Step 1: Delete files**

```bash
rm src/app/\[locale\]/\(app\)/app/workspace/page.tsx
rm src/app/\[locale\]/\(app\)/app/credits/page.tsx
rm src/app/\[locale\]/\(app\)/app/settings/page.tsx
rm src/app/\[locale\]/\(app\)/app/batch/page.tsx
rm src/components/app/dashboard-content.tsx
```

**Step 2: Check for orphan imports**

Search for any remaining imports of deleted files:

```bash
grep -r "dashboard-content" src/ --include="*.ts" --include="*.tsx"
grep -r "BatchUpload" src/app/ --include="*.ts" --include="*.tsx"
```

Remove any orphan imports found.

**Step 3: Remove ToolGrid if unused**

Check if `src/components/app/tool-grid.tsx` exists and if it's only used by dashboard-content:

```bash
grep -r "ToolGrid\|tool-grid" src/ --include="*.ts" --include="*.tsx"
```

If only referenced by dashboard-content, delete it too.

**Step 4: Clean Next.js cache**

```bash
rm -rf .next
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete old dashboard, credits, settings, batch pages"
```

---

## Task 10: Update WorkspaceLayout height calculation

**Files:**
- Modify: `src/components/workspace/workspace-layout.tsx`

**Step 1: Fix height calculation**

The workspace layout currently uses `h-[calc(100vh-56px)]` which assumes the header is the only thing above it. Now the layout is inside a `flex-1` container within the page flex row. Change both mobile and desktop containers from fixed `h-[calc(100vh-56px)]` to `h-full`:

In workspace-layout.tsx, change:
```tsx
<div className="flex md:hidden h-[calc(100vh-56px)] w-full flex-col overflow-y-auto">
```
To:
```tsx
<div className="flex md:hidden h-full w-full flex-col overflow-y-auto">
```

And change:
```tsx
<div className="hidden md:flex h-[calc(100vh-56px)] w-full gap-3 px-2 pb-2">
```
To:
```tsx
<div className="hidden md:flex h-full w-full gap-3 px-2 pb-2">
```

**Step 2: Commit**

```bash
git add src/components/workspace/workspace-layout.tsx
git commit -m "fix: workspace layout uses h-full instead of fixed calc"
```

---

## Task 11: Update E2E tests

**Files:**
- Modify: `e2e/login.spec.ts`
- Modify: `e2e/tool-pages.spec.ts`
- Modify: `e2e/tool-grid.spec.ts`
- Modify: `e2e/tool-submit.spec.ts`

**Step 1: Update login.spec.ts**

The redirect tests should verify `/app` shows workspace (not a dashboard). The unauthenticated redirect should still go to `/login`.

Update the workspace redirect test (if it references `/app/workspace`):
- `/app/workspace` now redirects to `/app` via middleware
- Unauthenticated `/app` should redirect to `/login`

**Step 2: Update tool-pages.spec.ts**

Change workspace direct access URLs from:
```
/tr/app/workspace?tool=${tool.id}
```
To:
```
/tr/app?tool=${tool.id}
```

Update URL assertions to match new structure.

Old URL redirect tests should now verify that `/app/workspace?tool=X` redirects to `/app?tool=X`.

**Step 3: Update tool-grid.spec.ts**

The ToolGrid (dashboard) no longer exists. These tests need significant changes since the dashboard page now IS the workspace. Either:
- Remove dashboard-specific tests (grid, tool cards)
- Or rewrite to test workspace tool selection

**Step 4: Update tool-submit.spec.ts**

Change workspace URLs from `/app/workspace?tool=X` to `/app?tool=X`.

**Step 5: Commit**

```bash
git add e2e/
git commit -m "test: update E2E tests for single-screen workspace"
```

---

## Task 12: Build verification

**Step 1: Type check**

```bash
npx tsc --noEmit --pretty
```

Expected: no errors

**Step 2: Full build**

```bash
npm run build
```

Expected: build succeeds

**Step 3: Fix any errors**

If build fails, fix errors and re-run. Common issues:
- Missing imports from deleted files
- Type errors from new component props
- `.next` cache referencing deleted routes (fix with `rm -rf .next`)

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve build errors from workspace transformation"
```

---

## Summary of Changes

| Action | Files |
|--------|-------|
| CREATE | workspace-sidebar.tsx, credits-sheet.tsx, referral-sheet.tsx, settings-sheet.tsx, ui/sheet.tsx |
| REWRITE | app/page.tsx (dashboard → workspace), workspace-header.tsx |
| MODIFY | app-shell.tsx, middleware.ts, payments/callback/route.ts, sidebar.tsx, workspace-layout.tsx, workspace/index.ts |
| DELETE | workspace/page.tsx, credits/page.tsx, settings/page.tsx, batch/page.tsx, dashboard-content.tsx, tool-grid.tsx(?) |
| UPDATE | e2e/login.spec.ts, e2e/tool-pages.spec.ts, e2e/tool-grid.spec.ts, e2e/tool-submit.spec.ts |

**Desktop Layout:**
```
+----------------------------------------------------------+
| WorkspaceHeader [hamburger(mobile)] [logo] [credits] [theme] [avatar] |
+----+----+----------+------------------+------------------+
|Nav |Tool| ToolForm |   Preview        |   Gallery        |
|Side|Icon| Panel    |                  |                  |
|bar |Bar |          |                  |                  |
|(52)|(64)| (280px)  |   (resizable)    |  (resizable)     |
+----+----+----------+------------------+------------------+
```

**Mobile Layout:**
```
+-----------------------------------+
| [hamburger] Renderhane [credits] [theme] [avatar] |
+-----------------------------------+
| [3D] [Image] [Video] [Ecom] [Des]|  <- horizontal tool strip
+-----------------------------------+
|          Preview Area             |
+-----------------------------------+
| [v] Ayarlar (collapsible form)    |
+-----------------------------------+
| [v] Galeri (collapsible gallery)  |
+-----------------------------------+
  Hamburger opens drawer from left:
  [Projects] [Credits] [Referral] [Settings] [Admin]
  [Balance: 125] [user@email] [Logout]
```
