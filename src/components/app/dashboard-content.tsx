"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PhotoUpload } from "@/components/app/photo-upload";
import { ToolGrid } from "@/components/app/tool-grid";
import type { SegmentId } from "@/lib/tools/registry";

export function DashboardContent() {
  const t = useTranslations("dashboard");
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

      {/* Quick Upload — existing flow for fast access */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("quickUploadTitle")}</h2>
        <PhotoUpload />
      </section>
    </div>
  );
}
