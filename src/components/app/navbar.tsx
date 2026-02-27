"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  Home,
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
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Logo → Landing page */}
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 text-lg font-bold tracking-tight transition-colors hover:text-primary"
            title={t("appName")}
          >
            <Home className="size-4 text-muted-foreground" />
            <span className="hidden sm:inline">{t("appName")}</span>
          </Link>

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          {/* Nav Links */}
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive(link.href, link.exact)
                    ? "bg-primary/10 font-medium text-primary"
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
                  <AvatarFallback className="text-xs">
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
