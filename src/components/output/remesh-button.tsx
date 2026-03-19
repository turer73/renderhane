"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface RemeshButtonProps {
  outputId: string;
  onRepaired?: () => void;
}

export function RemeshButton({ outputId, onRepaired }: RemeshButtonProps) {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const [repairing, setRepairing] = useState(false);
  const [segment, setSegment] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((d) => { if (d?.useCase) setSegment(d.useCase); })
      .catch(() => {});
  }, []);

  const format = segment === "3dprint" ? "stl" : segment === "gaming" ? "fbx" : "glb";

  async function handleRemesh() {
    setRepairing(true);
    try {
      // Step 1: Submit to queue (returns immediately)
      const res = await fetch("/api/jobs/remesh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId, format }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || (locale === "tr" ? "Başlatılamadı" : "Failed to start"));
        return;
      }

      const { requestId } = await res.json();
      if (!requestId) {
        toast.error(locale === "tr" ? "İstek oluşturulamadı" : "Request failed");
        return;
      }

      toast.info(locale === "tr" ? "Model yeniden oluşturuluyor..." : "Rebuilding model...");

      // Step 2: Poll for result (every 5s, max 5 minutes)
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));

        const statusRes = await fetch(`/api/jobs/remesh/status?requestId=${requestId}`);
        const statusData = await statusRes.json();

        if (statusData.status === "completed" && statusData.url) {
          const a = document.createElement("a");
          a.href = statusData.url;
          a.download = "renderhane-rebuilt.glb";
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          toast.success(locale === "tr" ? "Model indiriliyor!" : "Downloading model!");
          onRepaired?.();
          return;
        }

        if (statusData.status === "failed") {
          toast.error(statusData.error || (locale === "tr" ? "Başarısız oldu" : "Failed"));
          return;
        }
      }

      toast.error(locale === "tr" ? "Zaman aşımı — lütfen tekrar deneyin" : "Timeout — please try again");
    } catch {
      toast.error(locale === "tr" ? "Bir hata oluştu" : "An error occurred");
    } finally {
      setRepairing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleRemesh}
      disabled={repairing}
      className="gap-1.5"
    >
      {repairing ? (
        <>
          <RefreshCw className="size-3.5 animate-spin" />
          {locale === "tr" ? "Yeniden oluşturuluyor..." : "Rebuilding..."}
        </>
      ) : (
        <>
          <RefreshCw className="size-3.5" />
          {segment === "3dprint"
            ? (locale === "tr" ? "STL Olarak Yeniden Oluştur (Ücretsiz)" : "Rebuild as STL (Free)")
            : segment === "gaming"
              ? (locale === "tr" ? "FBX Olarak Yeniden Oluştur (Ücretsiz)" : "Rebuild as FBX (Free)")
              : (locale === "tr" ? "Tekrar Oluştur (Ücretsiz)" : "Rebuild (Free)")}
        </>
      )}
    </Button>
  );
}
