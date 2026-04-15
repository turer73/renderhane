"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ToolGrid } from "@/components/app/tool-grid";
import type { SegmentId } from "@/lib/tools/registry";

export function DashboardContent() {
  const t = useTranslations("dashboard");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const [segment, setSegment] = useState<SegmentId | null>(null);

  useEffect(() => {
    fetch("/api/credits/balance")
      .then((res) => res.json())
      .then((data) => {
        if (data?.useCase) setSegment(data.useCase as SegmentId);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Tool Grid — marketplace-style tool selection */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("toolsTitle")}</h2>
        <ToolGrid segment={segment} />
      </section>

      {/* Workspace CTA */}
      <section>
        <Link
          href={`/${locale}/app/workspace`}
          className="group flex items-center gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-5 transition-all hover:border-indigo-400 hover:shadow-lg dark:border-indigo-800 dark:hover:border-indigo-600"
        >
          <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/30 transition-transform group-hover:scale-110">
            <Sparkles className="size-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold">
              {locale === "tr" ? "Workspace" : "Workspace"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {locale === "tr"
                ? "13 AI aracina tek arayuzden erisin"
                : "Access all 13 AI tools from one interface"}
            </p>
          </div>
        </Link>
      </section>
    </div>
  );
}
