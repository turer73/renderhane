"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CreditBadge } from "@/components/app/credit-badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Box,
  Upload,
  FolderOpen,
  Coins,
  BookOpen,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const t = useTranslations("common");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const router = useRouter();
  const pathname = usePathname();
  const [userInitial, setUserInitial] = useState("U");

  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        setUserInitial(user.email[0].toUpperCase());
      }
    }
    fetchUser();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
    router.refresh();
  }

  const navLinks = [
    {
      href: `/${locale}/app`,
      label: t("upload"),
      icon: Upload,
      exact: true,
    },
    {
      href: `/${locale}/app/projects`,
      label: t("projects"),
      icon: FolderOpen,
      exact: false,
    },
  ];

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Logo → Landing page */}
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 text-lg font-bold tracking-tight transition-opacity hover:opacity-80"
            title={t("appName")}
          >
            <Box className="size-5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">{t("appName")}</span>
          </Link>

          <div className="hidden h-6 w-px bg-border/60 sm:block" />

          {/* Nav Links */}
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive(link.href, link.exact)
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <link.icon className="size-3.5" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Right: Credits + User menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          <CreditBadge />
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold dark:bg-indigo-500/20 dark:text-indigo-300">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href={`/${locale}/app/credits`} className="flex items-center gap-2">
                  <Coins className="size-4" />
                  {t("credits")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/${locale}/blog`} className="flex items-center gap-2">
                  <BookOpen className="size-4" />
                  Blog
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" />
                {t("logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
