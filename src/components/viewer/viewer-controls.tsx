"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ModelViewer } from "./model-viewer";
import { toast } from "sonner";

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
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
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
      toast.error(tViewer("downloadError"));
    } finally {
      setDownloading(false);
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
        <Button type="button" size="sm" onClick={handleDownload} disabled={downloading}>
          {downloading ? tViewer("downloading") : `${t("download")} GLB`}
        </Button>
      </div>
    </div>
  );
}
