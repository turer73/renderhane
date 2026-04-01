"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Box, Globe, Mail } from "lucide-react";

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

  const productLinks = [
    { label: t("nav.features"), action: () => scrollTo("features") },
    { label: t("nav.pricing"), action: () => scrollTo("pricing") },
    { label: t("nav.demo"), action: () => scrollTo("demo") },
  ];

  const toolLinks = [
    { label: t("footer.bgRemoveFree"), href: `/${locale}/araclar/arka-plan-kaldirma` },
    { label: t("footer.qrCodeFree"), href: `/${locale}/araclar/qr-kod` },
    { label: t("footer.apiAccess"), href: `/${locale}/app/settings` },
    { label: t("footer.shopifyIntegration"), href: `/${locale}/app` },
    { label: t("footer.blenderPlugin"), href: "https://github.com/turer73/renderhane/tree/master/plugins/blender" },
  ];

  const companyLinks = [
    { label: t("footer.blog"), href: `/${locale}/blog` },
    { label: t("footer.contact"), href: "mailto:info@renderhane.com" },
  ];

  const legalLinks = [
    { label: t("footer.privacy"), href: `/${locale}/privacy` },
    { label: t("footer.terms"), href: `/${locale}/terms` },
    { label: t("footer.kvkk"), href: `/${locale}/kvkk` },
    { label: t("footer.cookiePolicy"), href: `/${locale}/cookie-policy` },
  ];

  return (
    <footer className="border-t border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-950 dark:from-slate-950 dark:to-black">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8 lg:grid-cols-6">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <Link
              href={`/${locale}`}
              className="flex items-center gap-2 font-bold text-lg tracking-tight text-white"
            >
              <Box className="size-5 text-indigo-400" />
              <span>{tc("appName")}</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
              {t("footer.description")}
            </p>
            <a
              href="mailto:info@renderhane.com"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
            >
              <Mail className="size-3.5" />
              info@renderhane.com
            </a>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-white">
              {t("footer.product")}
            </h4>
            <ul className="mt-4 space-y-3">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={link.action}
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Tools & Integrations */}
          <div>
            <h4 className="text-sm font-semibold text-white">
              {t("footer.tools")}
            </h4>
            <ul className="mt-4 space-y-3">
              {toolLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                    {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-white">
              {t("footer.company")}
            </h4>
            <ul className="mt-4 space-y-3">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-white">
              {t("footer.legal")}
            </h4>
            <ul className="mt-4 space-y-3">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} {tc("appName")}. {t("footer.allRights")}
          </p>

          {/* Language switcher */}
          <button
            onClick={switchLanguage}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <Globe className="size-4" />
            <span>
              {t("footer.language")}: <span className="font-medium uppercase">{otherLocale}</span>
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}
