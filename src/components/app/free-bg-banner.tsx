"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export function FreeBgBanner() {
  const t = useTranslations("referral");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 p-4 text-white shadow-lg">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="font-bold text-sm sm:text-base">{t("freeBgBanner")}</p>
            <p className="text-xs text-white/80 sm:text-sm">{t("freeBgBannerSub")}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/login`}
          className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:bg-white/90"
        >
          {locale === "tr" ? "Başla" : "Start"}
        </Link>
      </div>
    </div>
  );
}
