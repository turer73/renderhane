"use client";

import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { getOrderedTools, type SegmentId } from "@/lib/tools/registry";

interface ToolGridProps {
  segment: SegmentId | null;
}

export function ToolGrid({ segment }: ToolGridProps) {
  const t = useTranslations("tools");
  const tDesc = useTranslations("toolDescriptions");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const router = useRouter();

  const tools = getOrderedTools(segment);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => {
            if (tool.ready) {
              router.push(`/${locale}${tool.href}`);
            }
          }}
          disabled={!tool.ready}
          className={`group relative flex flex-col gap-2 rounded-2xl border bg-gradient-to-br p-4 text-left transition-all ${tool.gradient} ${tool.border} ${
            tool.ready
              ? "cursor-pointer active:scale-[0.98] hover:shadow-lg"
              : "cursor-default opacity-60"
          }`}
        >
          {/* Coming Soon Badge */}
          {!tool.ready && (
            <span className="absolute -top-2 -right-2 rounded-full bg-slate-600 px-2 py-0.5 text-[10px] font-medium text-white">
              {locale === "tr" ? "Yakında" : "Soon"}
            </span>
          )}

          {/* Icon */}
          <span className="text-2xl">{tool.icon}</span>

          {/* Name */}
          <span className="text-sm font-semibold leading-tight">
            {t(tool.i18nKey)}
          </span>

          {/* Description */}
          <span className="text-xs leading-snug text-muted-foreground line-clamp-2">
            {tDesc(tool.descriptionKey)}
          </span>

          {/* Credit Cost */}
          <span className="mt-auto text-xs font-medium text-muted-foreground">
            {typeof tool.creditCost === "number" && tool.creditCost === 0
              ? (locale === "tr" ? "Ücretsiz" : "Free")
              : `${tool.creditCost} ${locale === "tr" ? "kredi" : "credits"}`}
          </span>
        </button>
      ))}
    </div>
  );
}
