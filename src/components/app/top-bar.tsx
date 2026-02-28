"use client";

import { useTranslations } from "next-intl";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Menu, Globe, ArrowLeft } from "lucide-react";

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const t = useTranslations("common");
  const tSidebar = useTranslations("sidebar");
  const tProjects = useTranslations("projects");
  const tCredits = useTranslations("credits");
  const tOutput = useTranslations("output");
  const tAdmin = useTranslations("admin");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const pathname = usePathname();

  // Dynamic page title based on route
  function getPageTitle(): string {
    const base = `/${locale}/app`;

    if (pathname === base || pathname === `${base}/`) {
      return t("upload");
    }
    if (pathname === `${base}/projects`) {
      return tProjects("title");
    }
    if (pathname.startsWith(`${base}/project/`)) {
      return tProjects("title");
    }
    if (pathname === `${base}/credits`) {
      return tCredits("purchaseTitle");
    }
    if (pathname.startsWith(`${base}/output/`)) {
      return tOutput("title");
    }
    if (pathname === `${base}/admin`) {
      return tAdmin("title");
    }
    return t("appName");
  }

  // Alternate locale
  const altLocale = locale === "tr" ? "en" : "tr";
  const altLabel = locale === "tr" ? "EN" : "TR";
  const altHref = pathname.replace(`/${locale}/`, `/${altLocale}/`);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-md px-4 sm:px-6">
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 lg:hidden"
          onClick={onMenuClick}
          aria-label="Toggle menu"
        >
          <Menu className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right: language + theme + back to home */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Language switcher */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground h-8 px-2"
          asChild
        >
          <Link href={altHref}>
            <Globe className="size-3.5" />
            <span className="text-xs font-medium">{altLabel}</span>
          </Link>
        </Button>

        <ThemeToggle />

        {/* Back to home */}
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex gap-1.5 h-8 text-xs"
          asChild
        >
          <Link href={`/${locale}`}>
            <ArrowLeft className="size-3" />
            {tSidebar("backToHome")}
          </Link>
        </Button>
      </div>
    </header>
  );
}
