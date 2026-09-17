"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Globe, Mail, ArrowUp } from "lucide-react";
import { FREE_TOOLS, freeToolHref } from "@/lib/tools/free-tools";

export function Footer() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const locale = params.locale as string;

  const otherLocale = locale === "tr" ? "en" : "tr";

  function switchLanguage() {
    router.replace(pathname, { locale: otherLocale });
  }

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const productLinks = [
    { label: t("nav.features"), action: () => scrollTo("features") },
    { label: t("nav.pricing"), action: () => scrollTo("pricing") },
    { label: t("nav.demo"), action: () => scrollTo("demo") },
  ];

  const toolLinks = [
    ...FREE_TOOLS.map((tool) => ({
      label: t(tool.i18nKey),
      href: freeToolHref(locale, tool),
    })),
    { label: t("footer.apiAccess"), href: `/${locale}/app/settings` },
    { label: t("footer.shopifyIntegration"), href: `/${locale}/app` },
    { label: t("footer.blenderPlugin"), href: "https://github.com/turer73/renderhane/tree/master/plugins/blender" },
  ];

  const companyLinks = [
    { label: t("footer.about"), href: `/${locale}/hakkimizda` },
    { label: t("footer.blog"), href: `/${locale}/blog` },
    { label: t("footer.contact"), href: `/${locale}/iletisim` },
  ];

  const legalLinks = [
    { label: t("footer.privacy"), href: `/${locale}/privacy` },
    { label: t("footer.terms"), href: `/${locale}/terms` },
    { label: t("footer.kvkk"), href: `/${locale}/kvkk` },
    { label: t("footer.cookiePolicy"), href: `/${locale}/cookie-policy` },
  ];

  const columns = [
    { title: t("footer.product"), links: productLinks, actions: true },
    { title: t("footer.tools"), links: toolLinks, actions: false },
    { title: t("footer.company"), links: companyLinks, actions: false },
    { title: t("footer.legal"), links: legalLinks, actions: false },
  ];

  return (
    <footer className="bg-white text-[#111328] dark:bg-[#141126] dark:text-slate-200">
      <div
        aria-hidden="true"
        className="h-1 bg-gradient-to-r from-[#9875ff] via-[#6743e8] to-[#17133e]"
      />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:gap-8 lg:grid-cols-6">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center gap-2.5 font-bold text-lg tracking-tight"
              aria-label="Renderhane"
            >
              <Image
                src="/logo/rhl-mark.svg"
                width={26}
                height={24}
                alt="Renderhane"
                unoptimized
                className="size-6"
              />
              <span>{tc("appName")}</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#626577] dark:text-slate-400">
              {t("footer.description")}
            </p>
            <a
              href="mailto:info@renderhane.com"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#e7e7ee] bg-[#f6f5ff] px-3 py-1.5 text-sm text-[#6743e8] transition-colors hover:bg-[#efeaff] dark:border-white/10 dark:bg-white/5 dark:text-[#a78fff] dark:hover:bg-white/10"
            >
              <Mail className="size-3.5" />
              info@renderhane.com
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#626577] dark:text-slate-400">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) =>
                  "action" in link ? (
                    <li key={link.label}>
                      <button
                        onClick={link.action}
                        className="rounded px-1 py-0.5 text-sm text-[#111328] transition-colors hover:bg-[#f1efff] hover:text-[#6743e8] dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                      >
                        {link.label}
                      </button>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="rounded px-1 py-0.5 text-sm text-[#111328] transition-colors hover:bg-[#f1efff] hover:text-[#6743e8] dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                        {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="my-8 h-px bg-[#e7e7ee] dark:bg-white/10" />

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-[#626577] dark:text-slate-400">
            &copy; {new Date().getFullYear()} {tc("appName")}. {t("footer.allRights")}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={switchLanguage}
              className="flex items-center gap-1.5 rounded-full border border-[#e7e7ee] px-3 py-1.5 text-sm text-[#626577] transition-colors hover:border-[#6743e8] hover:text-[#6743e8] dark:border-white/10 dark:text-slate-300 dark:hover:border-white/30 dark:hover:text-white"
            >
              <Globe className="size-4" />
              <span>
                {t("footer.language")}: <span className="font-medium uppercase">{otherLocale}</span>
              </span>
            </button>
            <button
              onClick={scrollTop}
              aria-label="Yukarı dön"
              className="flex size-9 items-center justify-center rounded-full bg-[#6743e8] text-white transition-colors hover:bg-[#5636cf]"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
