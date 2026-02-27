"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
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

  const companyLinks = [
    { label: t("footer.about"), href: "#" },
    { label: t("footer.blog"), href: `/${locale}/blog` },
    { label: t("footer.careers"), href: "#" },
    { label: t("footer.contact"), href: "mailto:info@renderhane.com" },
  ];

  const legalLinks = [
    { label: t("footer.privacy"), href: `/${locale}/privacy` },
    { label: t("footer.terms"), href: `/${locale}/terms` },
    { label: t("footer.kvkk"), href: `/${locale}/kvkk` },
  ];

  return (
    <footer className="border-t border-slate-800 bg-slate-900 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
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

        <Separator className="my-8 bg-slate-800" />

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
