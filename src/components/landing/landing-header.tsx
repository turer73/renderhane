"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Box, Globe, Menu, X, ArrowRight } from "lucide-react";
import { useState } from "react";

export function LandingHeader() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const locale = params.locale as string;
  const [mobileOpen, setMobileOpen] = useState(false);

  const otherLocale = locale === "tr" ? "en" : "tr";

  function switchLanguage() {
    router.replace(pathname, { locale: otherLocale });
  }

  function scrollTo(id: string) {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  const navItems = [
    { label: t("nav.demo"), id: "demo" },
    { label: t("nav.features"), id: "features" },
    { label: t("nav.pricing"), id: "pricing" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2 font-bold text-lg tracking-tight text-foreground"
        >
          <Box className="size-6 text-indigo-600 dark:text-indigo-400" />
          <span>{tc("appName")}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </button>
          ))}
          <Link
            href={`/${locale}/blog`}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("footer.blog")}
          </Link>
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 border-l border-border/40 pl-6 md:flex">
          {/* Language switcher */}
          <button
            onClick={switchLanguage}
            className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("footer.language")}
          >
            <Globe className="size-4" />
            <span className="uppercase">{otherLocale}</span>
          </button>

          {/* Theme toggle */}
          <ThemeToggle />

          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <Link href={`/${locale}/login`}>{tc("login")}</Link>
          </Button>

          <Button
            size="sm"
            asChild
            className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 hover:shadow-indigo-200 dark:hover:shadow-indigo-900/50 hover:shadow-lg transition-all"
          >
            <Link href={`/${locale}/login`} className="flex items-center gap-2">
              {tc("tryIt")} <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile buttons */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={switchLanguage}
            className="flex items-center gap-1 p-2 text-xs font-bold text-muted-foreground"
          >
            <Globe className="size-4" /> {otherLocale.toUpperCase()}
          </button>
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border/40 bg-background px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="rounded-md px-3 py-2.5 text-left text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
            <Link
              href={`/${locale}/blog`}
              className="rounded-md px-3 py-2.5 text-left text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {t("footer.blog")}
            </Link>
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-3">
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link href={`/${locale}/login`}>{tc("login")}</Link>
            </Button>
            <Button
              size="sm"
              asChild
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Link href={`/${locale}/login`}>{tc("tryIt")}</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
