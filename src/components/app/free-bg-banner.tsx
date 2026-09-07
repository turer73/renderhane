"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { FREE_TOOLS, freeToolHref } from "@/lib/tools/free-tools";

/**
 * Banner showcasing free tools available without registration.
 * Consistent cards side by side, prominent placement in hero.
 */
export function FreeBgBanner() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  const tools = FREE_TOOLS.map((tool) => ({
    href: freeToolHref(locale, tool),
    icon: tool.icon,
    title: tr ? tool.title.tr : tool.title.en,
    subtitle: tr ? tool.subtitle.tr : tool.subtitle.en,
    badge: tr ? tool.badge.tr : tool.badge.en,
    gradient: tool.gradient,
    hoverGradient: tool.hoverGradient,
    iconBg: "bg-white/20",
  }));

  return (
    <div className="space-y-3">
      {/* Section label */}
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
        <Zap className="size-4 text-amber-500" />
        <span>{tr ? "Kayıt olmadan hemen deneyin" : "Try instantly without signup"}</span>
      </div>

      {/* Cards side by side */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={`group relative flex flex-col overflow-hidden rounded-xl bg-gradient-to-br ${tool.gradient} ${tool.hoverGradient} p-4 text-white shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] sm:rounded-2xl sm:p-5`}
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
              <h3 className="text-base font-bold leading-tight sm:text-lg">{tool.title}</h3>
              <p className="mt-1 text-xs text-white/75 sm:text-sm">{tool.subtitle}</p>
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
