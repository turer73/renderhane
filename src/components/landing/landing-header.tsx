"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Globe, Menu, X, ArrowRight, ChevronDown } from "lucide-react";
import { FREE_TOOLS, freeToolHref } from "@/lib/tools/free-tools";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useCallback, useEffect, useRef, useState } from "react";

export function LandingHeader() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const locale = params.locale as string;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const savedOverflow = useRef<{ html: string; body: string } | null>(null);
  // Signed-in visitors get one button to the app instead of login + sign-up.
  const signedIn = useAuthStatus();

  const closeMobile = useCallback(() => {
    if (dialog.current?.open) dialog.current.close();
    setMobileOpen(false);
  }, []);

  // Dialog acilis/kapanis + kaydirma kilidi. Sitede kaydirici body oldugundan
  // (html/body height:100%) kilit her ikisine de uygulanir.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (mobileOpen && !d.open && typeof d.showModal === "function") {
      savedOverflow.current = {
        html: document.documentElement.style.overflow,
        body: document.body.style.overflow,
      };
      d.showModal();
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      d.querySelector<HTMLElement>("[data-menu-close]")?.focus({ preventScroll: true });
    } else if (!mobileOpen && d.open) {
      d.close();
    }
  }, [mobileOpen]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const restore = () => {
      if (savedOverflow.current) {
        document.documentElement.style.overflow = savedOverflow.current.html;
        document.body.style.overflow = savedOverflow.current.body;
        savedOverflow.current = null;
      }
      setMobileOpen(false);
    };
    d.addEventListener("close", restore);
    return () => d.removeEventListener("close", restore);
  }, []);
  // Masaustune gecince cekmeceyi kapat.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) closeMobile();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [closeMobile]);
  useEffect(
    () => () => {
      if (savedOverflow.current) {
        document.documentElement.style.overflow = savedOverflow.current.html;
        document.body.style.overflow = savedOverflow.current.body;
      }
    },
    []
  );
  // Sekme tuzagi: odak diyalog icinde kalir.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const d = dialog.current;
    if (!d) return;
    const items = [...d.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")].filter(
      (el) => el.getClientRects().length > 0
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const otherLocale = locale === "tr" ? "en" : "tr";

  const freeTools = FREE_TOOLS.map((tool) => ({
    label: t(tool.i18nKey),
    href: freeToolHref(locale, tool),
    icon: tool.icon,
  }));

  function switchLanguage() {
    router.replace(pathname, { locale: otherLocale });
  }

  function scrollTo(id: string) {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else {
      // Ana sayfa DIŞINDAYIZ (blog/araçlar/legal vb.) → bölüm bu sayfada yok. Ana sayfaya
      // git + hash; tarayıcı yüklenince #id bölümüne kaydırır (önceden: ölü tık, hiçbir şey olmazdı).
      router.push(`/#${id}`, { locale });
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
          <Image
            src="/logo/rhl-mark.svg"
            width={24}
            height={22}
            alt="Renderhane"
            priority
            unoptimized
            className="size-6"
          />
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

          {/* Free Tools dropdown */}
          <div
            className="relative"
            onMouseEnter={() => setToolsOpen(true)}
            onMouseLeave={() => setToolsOpen(false)}
          >
            <button
              className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("nav.tools")}
              <ChevronDown className="size-3.5" />
            </button>
            {toolsOpen && (
              // top-full + pt-1 (margin DEĞİL padding): buton↔panel arası boşluk artık HOVER-EDİLEBİLİR
              // → fareyi öğeye götürünce onMouseLeave tetiklenip menü kapanmıyor (seçim kolaylaştı).
              <div className="absolute left-0 top-full z-50 w-56 pt-1">
                <div className="rounded-xl border border-border/60 bg-background/95 p-2 shadow-xl backdrop-blur-md">
                  {freeTools.map((tool) => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setToolsOpen(false)}
                    >
                      <tool.icon className="size-4 text-indigo-500" />
                      {tool.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

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

          {!signedIn && (
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link href={`/${locale}/login`}>{tc("login")}</Link>
            </Button>
          )}

          <Button
            size="sm"
            asChild
            className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 hover:shadow-indigo-200 dark:hover:shadow-indigo-900/50 hover:shadow-lg transition-all"
          >
            <Link
              href={signedIn ? `/${locale}/app` : `/${locale}/login`}
              className="flex items-center gap-2"
            >
              {signedIn ? tc("goToApp") : tc("tryIt")} <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile buttons */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={switchLanguage}
            className="flex min-h-[44px] items-center gap-1 p-2 text-xs font-bold text-muted-foreground"
          >
            <Globe className="size-4" /> {otherLocale.toUpperCase()}
          </button>
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md p-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Menu"
            aria-expanded={mobileOpen}
            aria-controls="landing-mobile-menu"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu — diyalog cekmece (odak tuzagi + kaydirma kilidi) */}
      <dialog
        ref={dialog}
        id="landing-mobile-menu"
        aria-label={t("nav.tools")}
        className="m-0 ml-auto h-full max-h-none w-[min(420px,100%)] border-0 border-l border-border/40 bg-background p-0 text-foreground backdrop:bg-black/40 backdrop:backdrop-blur-[3px] open:flex open:flex-col"
        onClick={(e) => {
          if (e.target === dialog.current) closeMobile();
        }}
        onKeyDown={trapTab}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-4">
          <span className="text-sm font-bold tracking-tight">{tc("appName")}</span>
          <button
            type="button"
            data-menu-close
            onClick={closeMobile}
            aria-label="Close"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav
          aria-label="Mobile"
          className="flex flex-col gap-1 overflow-y-auto px-5 py-4"
          onClick={(e) => {
            if ((e.target as Element).closest("a,button")) closeMobile();
          }}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="rounded-lg bg-muted/50 px-4 py-3 text-left text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </button>
          ))}
          <p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
            {t("nav.tools")}
          </p>
          {freeTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 text-left text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <tool.icon className="size-4 shrink-0 text-indigo-500" />
              {tool.label}
            </Link>
          ))}
          <Link
            href={`/${locale}/blog`}
            className="rounded-lg bg-muted/50 px-4 py-3 text-left text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {t("footer.blog")}
          </Link>
        </nav>
        <div
          className="mt-auto flex flex-col gap-2 border-t border-border/40 px-5 pt-4"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          {!signedIn && (
            <Button variant="outline" size="sm" asChild className="w-full min-h-[48px]">
              <Link href={`/${locale}/login`}>{tc("login")}</Link>
            </Button>
          )}
          <Button size="sm" asChild className="w-full min-h-[48px] bg-indigo-600 text-white hover:bg-indigo-700">
            <Link href={signedIn ? `/${locale}/app` : `/${locale}/login`}>
              {signedIn ? tc("goToApp") : tc("tryIt")}
            </Link>
          </Button>
        </div>
      </dialog>
    </header>
  );
}
