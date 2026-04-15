"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { Sparkles, Download, RotateCcw, Maximize2, FileBox, FileText, Printer, Image, Scissors, ZoomIn, Wand2, Video, ShoppingBag, Palette, Layers, Film, User, Play, Camera, Shirt, LayoutGrid, Crown, QrCode, FolderUp, FileStack, Box, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showToast } from "./workspace-toast";
import { proxyUrl } from "@/lib/proxy-url";
import type { GenerationJob } from "./workspace-layout";

// Lazy-load 3D viewer (Three.js bundle)
const ModelViewer = dynamic(
  () => import("@/components/viewer/model-viewer").then((m) => m.ModelViewer),
  { ssr: false, loading: () => (
    <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-border/30 bg-black/10">
      <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
    </div>
  )}
);

interface WorkspacePreviewProps {
  activeTool: string;
  activeJob?: GenerationJob | null;
}

export function WorkspacePreview({ activeTool, activeJob }: WorkspacePreviewProps) {
  // Failed state
  if (activeJob?.status === "failed") {
    return (
      <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <X className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{activeJob.name}</h3>
            <p className="text-sm text-destructive font-medium">
              {activeJob.errorMessage || "Üretim başarısız oldu"}
            </p>
            <p className="text-xs text-muted-foreground">
              Kredin iade edildi. Tekrar deneyebilirsin.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => showToast("Sol panelden tekrar Üret'e bas", "info")}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Tekrar Dene
          </Button>
        </div>
      </div>
    );
  }

  // Pending state (waiting in queue)
  if (activeJob?.status === "pending") {
    return (
      <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.06)_0%,transparent_70%)] animate-pulse" />
          <div className="relative z-10">
            <div className="h-20 w-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          </div>
          <div className="relative z-10 text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{activeJob.name}</h3>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-sm text-amber-500 font-medium">{activeJob.stage}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Processing state
  if (activeJob?.status === "processing") {
    return (
      <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 p-8">
          {/* Animated background glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08)_0%,transparent_70%)] animate-pulse" />

          {/* Circular progress */}
          <div className="relative z-10">
            <svg width="160" height="160" viewBox="0 0 160 160" className="transform -rotate-90">
              {/* Background ring */}
              <circle cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--border))" strokeWidth="6" opacity="0.3" />
              {/* Progress ring */}
              <circle
                cx="80" cy="80" r="70" fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 70}`}
                strokeDashoffset={`${2 * Math.PI * 70 * (1 - activeJob.progress / 100)}`}
                className="transition-all duration-300 ease-out"
                style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary) / 0.4))" }}
              />
            </svg>
            {/* Percentage text in center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-primary tabular-nums">
                {activeJob.progress}%
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{activeJob.model}</span>
            </div>
          </div>

          {/* Stage info */}
          <div className="relative z-10 text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{activeJob.name}</h3>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm text-primary font-medium">{activeJob.stage}</span>
            </div>
          </div>

          {/* Linear progress bar */}
          <div className="relative z-10 w-full max-w-xs">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300 ease-out"
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
              <span>{activeJob.credits} kredi kullanılacak</span>
              <span>~{Math.max(1, Math.round((100 - activeJob.progress) / 8))} sn kaldı</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Completed state - show result
  if (activeJob?.status === "completed") {
    const outputUrl = activeJob.outputUrl;
    const outputType = activeJob.outputType;
    const isVideo = outputType === "video";
    const isGlb = outputType === "glb";
    const isImageOutput = outputType === "image" || (!isVideo && !isGlb);

    const handleDownload = async () => {
      if (!outputUrl) return;
      showToast("İndirme başlatıldı", "success");
      const ext = outputUrl.includes(".glb") ? "glb" : outputUrl.includes(".mp4") ? "mp4" : "png";
      const filename = `${(activeJob.name || "output").replace(/\s+/g, "_")}.${ext}`;
      try {
        const res = await fetch(proxyUrl(outputUrl));
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(outputUrl, "_blank", "noopener,noreferrer");
      }
    };

    return (
      <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium">{activeJob.name}</span>
            <span className="text-[10px] text-muted-foreground">• {activeJob.model}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
              if (outputUrl) window.open(outputUrl, "_blank");
            }}>
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => showToast("Sol panelden tekrar Üret'e bas", "info")}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Preview area */}
        <div className="relative flex flex-1 items-center justify-center bg-[#0a0a14]">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.06)_0%,transparent_60%)]" />

          {isVideo && outputUrl ? (
            /* Real video player */
            <div className="relative flex flex-col items-center gap-4 animate-in fade-in-0 zoom-in-95 duration-500">
              <div className="relative rounded-xl overflow-hidden border border-border/30 shadow-2xl shadow-primary/10">
                <video
                  src={outputUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="max-w-full max-h-[60vh] rounded-xl"
                />
              </div>
            </div>
          ) : isGlb && outputUrl ? (
            /* GLB 3D model — inline Three.js viewer */
            <div className="w-full h-full animate-in fade-in-0 duration-500">
              <ModelViewer
                url={proxyUrl(outputUrl)}
                className="h-full w-full"
                autoRotate={true}
              />
            </div>
          ) : outputUrl ? (
            /* Real image output */
            <img
              src={outputUrl}
              alt={activeJob.name}
              className="max-w-[90%] max-h-[80%] object-contain rounded-lg animate-in fade-in-0 zoom-in-95 duration-500 cursor-pointer"
              onClick={() => window.open(outputUrl, "_blank")}
            />
          ) : activeJob.thumbnail ? (
            /* Fallback to thumbnail (SVG placeholder) */
            <img
              src={activeJob.thumbnail}
              alt={activeJob.name}
              className="max-w-[80%] max-h-[80%] object-contain animate-in fade-in-0 zoom-in-95 duration-500"
            />
          ) : null}

          {/* Bottom hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/60 backdrop-blur-sm border border-border/30">
            {outputUrl ? (
              <>
                <Download className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Tıklayarak tam boyut aç</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Üretim tamamlandı</span>
              </>
            )}
          </div>
        </div>

        {/* Bottom info */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground">
          <span>{activeJob.credits} kredi kullanıldı</span>
          <span>{isVideo ? "Video" : isGlb ? "GLB 3D Model" : "Görsel"}</span>
        </div>
      </div>
    );
  }

  const es = EMPTY_STATES[activeTool] ?? EMPTY_STATES["3d-model"];

  return (
    <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.04)_0%,transparent_70%)]" />
        <div className="relative z-10">
          {es.icons}
        </div>

        <div className="relative z-10 text-center space-y-2">
          <h2 className="text-xl font-semibold text-primary">
            {es.title}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {es.desc}
          </p>
        </div>

        <Button
          size="lg"
          className="relative z-10 mt-2"
          onClick={() => showToast(es.toast)}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {es.cta}
        </Button>
      </div>
    </div>
  );
}

/* ═══ Empty state configs (static — outside component to avoid re-creation) ═══ */
const EMPTY_STATES: Record<string, { icons: React.ReactNode; title: string; desc: string; cta: string; toast: string }> = {
    "3d-model": {
      icons: (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
            <Box className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
            <div className="h-5 w-5 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center shadow-lg shadow-primary/10">
            <div className="h-6 w-6 bg-primary/60 rotate-45 rounded-sm" />
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
        </div>
      ),
      title: "Ürünlerini 3D'ye Dönüştür",
      desc: "Fotoğraf yükle, AI modeli seç ve saniyeler içinde profesyonel 3D model oluştur. E-ticaret, oyun veya 3D baskı için hazır.",
      cta: "Hemen Başla",
      toast: "Sol panelden fotoğraf yükle veya metin yaz, sonra Üret'e bas!",
    },
    "image": {
      icons: (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
            <Scissors className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
            <ZoomIn className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center shadow-lg shadow-primary/10">
            <Wand2 className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <Image className="h-6 w-6 text-primary" />
          </div>
        </div>
      ),
      title: "Görsellerini AI ile İşle",
      desc: "Arkaplan kaldır, kaliteyi artır, yeni görseller oluştur veya mevcut görselleri düzenle. E-ticaret ve sosyal medya için hazır.",
      cta: "Görsel Yükle",
      toast: "Sol panelden görsel yükle, işlem seç ve İşle'ye bas!",
    },
    "video": {
      icons: (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
            <Film className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
            <Play className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center shadow-lg shadow-primary/10">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <Video className="h-6 w-6 text-primary" />
          </div>
        </div>
      ),
      title: "Ürün Videoları Oluştur",
      desc: "Ürün fotoğraflarından etkileyici videolar üret, metinden video oluştur veya konuşan avatar hazırla. Sosyal medya ve e-ticaret için hazır.",
      cta: "Hemen Başla",
      toast: "Sol panelden görsel yükle veya metin yaz, sonra Video Üret'e bas!",
    },
    "ecommerce": {
      icons: (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
            <Camera className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
            <LayoutGrid className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center shadow-lg shadow-primary/10">
            <Shirt className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <ShoppingBag className="h-6 w-6 text-primary" />
          </div>
        </div>
      ),
      title: "E-ticaret Görselleri Oluştur",
      desc: "Ürün sahneleri oluştur, A+ içerik hazırla ve sanal deneme görselleri üret. Trendyol, Amazon ve Hepsiburada için hazır.",
      cta: "Hemen Başla",
      toast: "Sol panelden ürün görseli yükle, işlem seç ve Oluştur'a bas!",
    },
    "design": {
      icons: (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
            <Crown className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
            <QrCode className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center shadow-lg shadow-primary/10">
            <Palette className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
        </div>
      ),
      title: "AI ile Tasarım Oluştur",
      desc: "Profesyonel logo tasarımı ve sanatsal QR kod oluştur. Marka kimliğini AI ile güçlendir.",
      cta: "Hemen Başla",
      toast: "Sol panelden marka adını yaz veya URL gir, sonra Tasarla'ya bas!",
    },
    "batch": {
      icons: (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
            <FolderUp className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
            <FileStack className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center shadow-lg shadow-primary/10">
            <Scissors className="h-6 w-6 text-primary" />
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <Layers className="h-6 w-6 text-primary" />
          </div>
        </div>
      ),
      title: "Toplu Görsel İşleme",
      desc: "Onlarca görseli aynı anda işle. Toplu arkaplan kaldırma, kalite artırma ve boyutlandırma.",
      cta: "Hemen Başla",
      toast: "Sol panelden görselleri toplu yükle, işlem seç ve Toplu İşle'ye bas!",
    },
  };
