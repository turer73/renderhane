"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Link as IntlLink, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Globe, Mail, SlidersHorizontal } from "lucide-react";
import { OPEN_COOKIE_SETTINGS_EVENT } from "@/components/cookie-banner";
import { FREE_TOOLS, freeToolHref } from "@/lib/tools/free-tools";

export function Footer() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const params = useParams();
  const pathname = usePathname();
  const locale = params.locale as string;

  const otherLocale = locale === "tr" ? "en" : "tr";

  const productLinks = [
    { label: t("nav.features"), href: `/${locale}#features` },
    { label: t("nav.pricing"), href: `/${locale}#pricing` },
    { label: t("nav.demo"), href: `/${locale}#demo` },
  ];

  const toolLinks = [
    ...FREE_TOOLS.map((tool) => ({
      label: t(tool.i18nKey),
      href: freeToolHref(locale, tool),
    })),
    { label: t("footer.apiAccess"), href: `/${locale}/iletisim#api-ve-entegrasyon` },
    { label: t("footer.shopifyIntegration"), href: `/${locale}/iletisim#api-ve-entegrasyon` },
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
    { title: t("footer.product"), links: productLinks },
    { title: t("footer.tools"), links: toolLinks },
    { title: t("footer.company"), links: companyLinks },
    { title: t("footer.legal"), links: legalLinks },
  ];

  return (
    <footer className="bg-[#081226] text-slate-200">
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
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
              {t("footer.description")}
            </p>
            <a
              href="mailto:info@renderhane.com"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[#a78fff] transition-colors hover:bg-white/10"
            >
              <Mail className="size-3.5" />
              info@renderhane.com
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-slate-100">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="rounded px-1 py-0.5 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                      {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="my-8 h-px bg-white/10" />

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} {tc("appName")}. {t("footer.allRights")}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))}
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-white/30 hover:text-white"
            >
              <SlidersHorizontal className="size-4" />
              <span>{t("footer.cookieSettings")}</span>
            </button>
            <IntlLink
              href={pathname}
              locale={otherLocale}
              hrefLang={otherLocale}
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-white/30 hover:text-white"
            >
              <Globe className="size-4" />
              <span>
                {t("footer.language")}: <span className="font-medium uppercase">{otherLocale}</span>
              </span>
            </IntlLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
