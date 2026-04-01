"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Eraser, QrCode, ArrowRight, Zap } from "lucide-react";

/**
 * Banner showcasing free tools available without registration.
 * Two consistent cards side by side, prominent placement in hero.
 */
export function FreeBgBanner() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  const tools = [
    {
      href: `/${locale}/araclar/arka-plan-kaldirma`,
      icon: Eraser,
      title: tr ? "Arka Plan Kaldır" : "Remove Background",
      subtitle: tr ? "Kayıt olmadan • Günde 3 hak" : "No signup • 3/day free",
      badge: tr ? "Ücretsiz" : "Free",
      gradient: "from-indigo-600 to-purple-600",
      hoverGradient: "hover:from-indigo-700 hover:to-purple-700",
      iconBg: "bg-white/20",
    },
    {
      href: `/${locale}/araclar/qr-kod`,
      icon: QrCode,
      title: tr ? "QR Kod Oluşturucu" : "QR Code Generator",
      subtitle: tr ? "URL, vCard, WiFi, SVG indirme" : "URL, vCard, WiFi, SVG download",
      badge: tr ? "Sınırsız" : "Unlimited",
      gradient: "from-emerald-600 to-teal-600",
      hoverGradient: "hover:from-emerald-700 hover:to-teal-700",
      iconBg: "bg-white/20",
    },
  ];

  return (
    <div className="space-y-3">
      {/* Section label */}
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
        <Zap className="size-4 text-amber-500" />
        <span>{tr ? "Kayıt olmadan hemen deneyin" : "Try instantly without signup"}</span>
      </div>

      {/* Two cards side by side */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={`group relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-br ${tool.gradient} ${tool.hoverGradient} p-5 text-white shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]`}
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15),transparent)]" />

            <div className="relative flex items-start justify-between">
              <div className={`flex size-11 items-center justify-center rounded-xl ${tool.iconBg} backdrop-blur-sm`}>
                <tool.icon className="size-5" />
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">
                {tool.badge}
              </span>
            </div>

            <div className="relative mt-4 flex-1">
              <h3 className="text-lg font-bold leading-tight">{tool.title}</h3>
              <p className="mt-1 text-sm text-white/75">{tool.subtitle}</p>
            </div>

            <div className="relative mt-4 flex items-center gap-1.5 text-sm font-semibold text-white/90 transition-colors group-hover:text-white">
              {tr ? "Hemen Dene" : "Try Now"}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
