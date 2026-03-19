"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShoppingCart, Gamepad2, Printer, ArrowRight } from "lucide-react";

const SEGMENTS = [
  {
    id: "ecommerce" as const,
    icon: ShoppingCart,
    gradient: "from-indigo-600 to-blue-700",
    bg: "bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40",
    border: "border-indigo-200/60 dark:border-indigo-800/60",
    iconBg: "bg-indigo-100 dark:bg-indigo-500/20",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  },
  {
    id: "gaming" as const,
    icon: Gamepad2,
    gradient: "from-purple-600 to-fuchsia-700",
    bg: "bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-950/40 dark:to-fuchsia-950/40",
    border: "border-purple-200/60 dark:border-purple-800/60",
    iconBg: "bg-purple-100 dark:bg-purple-500/20",
    iconColor: "text-purple-600 dark:text-purple-400",
    badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  },
  {
    id: "3dprint" as const,
    icon: Printer,
    gradient: "from-emerald-600 to-teal-700",
    bg: "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40",
    border: "border-emerald-200/60 dark:border-emerald-800/60",
    iconBg: "bg-emerald-100 dark:bg-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
];

export function SegmentsSection() {
  const t = useTranslations("landing.segments");
  const params = useParams();
  const locale = params.locale as string;

  return (
    <section className="border-t border-border/30 bg-background py-16 transition-colors sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-3">
          {SEGMENTS.map(({ id, icon: Icon, bg, border, iconBg, iconColor, badgeColor }) => (
            <div
              key={id}
              className={`group relative overflow-hidden rounded-3xl border ${border} ${bg} p-6 transition-all duration-300 hover:shadow-xl sm:p-8`}
            >
              <div className={`mb-4 flex size-12 items-center justify-center rounded-xl ${iconBg}`}>
                <Icon className={`size-6 ${iconColor}`} />
              </div>

              <h3 className="text-xl font-bold text-foreground">
                {t(`${id}.title`)}
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`${id}.description`)}
              </p>

              <ul className="mt-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 ${iconColor}`}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span className="text-muted-foreground">
                      {t(`${id}.benefit${i}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <Link
                  href={`/${locale}/login`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all ${badgeColor} hover:opacity-80`}
                >
                  {t("cta")}
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
