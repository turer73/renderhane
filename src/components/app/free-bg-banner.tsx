"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Sparkles, QrCode } from "lucide-react";

/**
 * Banner showcasing free tools available without registration.
 * Links directly to public tool pages so users experience value first.
 */
export function FreeBgBanner() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <div className="space-y-3">
      {/* BG Remove — primary CTA */}
      <Link
        href={`/${locale}/araclar/arka-plan-kaldirma`}
        className="group relative block overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 p-4 text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.01]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm sm:text-base">
              {tr ? "✨ Arka Plan Kaldır — Ücretsiz Dene" : "✨ Remove Background — Try Free"}
            </p>
            <p className="text-xs text-white/80 sm:text-sm">
              {tr ? "Kayıt olmadan hemen dene • Günde 3 hak" : "Try instantly without signup • 3/day free"}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-600 transition-colors group-hover:bg-white/90">
            {tr ? "Dene" : "Try"}
          </span>
        </div>
      </Link>

      {/* QR Code — secondary CTA */}
      <Link
        href={`/${locale}/araclar/qr-kod`}
        className="group relative block overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-3 transition-all hover:shadow-md hover:scale-[1.01] dark:border-emerald-800 dark:from-emerald-500/10 dark:to-teal-500/10"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
            <QrCode className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-300">
              {tr ? "🔲 QR Kod Oluşturucu — Tamamen Ücretsiz" : "🔲 QR Code Generator — Totally Free"}
            </p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
              {tr ? "URL, vCard, WiFi, telefon + SVG indirme" : "URL, vCard, WiFi, phone + SVG download"}
            </p>
          </div>
        </div>
      </Link>
    </div>
  );
}
