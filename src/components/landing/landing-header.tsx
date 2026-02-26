"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Box, Globe, Menu, X } from "lucide-react";
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
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2 font-bold text-lg tracking-tight"
        >
          <Box className="size-6 text-primary" />
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
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={switchLanguage}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t("footer.language")}
          >
            <Globe className="size-4" />
            <span className="uppercase">{otherLocale}</span>
          </button>

          <Button variant="ghost" size="sm" asChild>
            <Link href={`/${locale}/login`}>{tc("login")}</Link>
          </Button>

          <Button size="sm" asChild>
            <Link href={`/${locale}/login`}>{tc("tryIt")}</Link>
          </Button>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
          aria-label="Menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border/40 bg-background px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-3">
            <button
              onClick={() => {
                setMobileOpen(false);
                switchLanguage();
              }}
              className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Globe className="size-4" />
              <span className="uppercase">{otherLocale}</span>
            </button>
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link href={`/${locale}/login`}>{tc("login")}</Link>
            </Button>
            <Button size="sm" asChild className="w-full">
              <Link href={`/${locale}/login`}>{tc("tryIt")}</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
