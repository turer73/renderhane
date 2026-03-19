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
      const res = await fetch("/api/jobs/remesh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId, format }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const detail = errData?.error || (locale === "tr" ? "Yeniden oluşturma başarısız oldu" : "Rebuild failed");
        toast.error(detail);
        return;
      }

      const data = await res.json();

      if (data.url) {
        // Trigger download of the rebuilt file
        const a = document.createElement("a");
        a.href = data.url;
        a.download = `renderhane-rebuilt.${data.format || "glb"}`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        toast.success(
          locale === "tr"
            ? `${(data.format || "GLB").toUpperCase()} dosyası indiriliyor!`
            : `Downloading ${(data.format || "GLB").toUpperCase()} file!`
        );
      }

      onRepaired?.();
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
