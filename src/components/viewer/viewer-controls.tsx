"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ModelViewer } from "./model-viewer";

interface ViewerControlsProps {
  url: string;
  fileName?: string;
}

export function ViewerWithControls({
  url,
  fileName = "model.glb",
}: ViewerControlsProps) {
  const t = useTranslations("common");
  const tViewer = useTranslations("viewer");
  const [autoRotate, setAutoRotate] = useState(true);

  async function handleDownload() {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      // Download failed silently
    }
  }

  return (
    <div className="space-y-4">
      <ModelViewer url={url} autoRotate={autoRotate} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAutoRotate(!autoRotate)}
          >
            {autoRotate ? tViewer("stopRotation") : tViewer("startRotation")}
          </Button>
        </div>
        <Button type="button" size="sm" onClick={handleDownload}>
          {t("download")} GLB
        </Button>
      </div>
    </div>
  );
}
