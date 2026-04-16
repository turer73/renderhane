"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { showToast } from "./workspace-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Grid3X3,
  LayoutList,
  Download,
  Eye,
  MoreHorizontal,
  Loader2,
  Share2,
  RefreshCw,
  Trash2,
  Copy,
  ImageIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { proxyUrl } from "@/lib/proxy-url";

/** Fetch-based download that works for cross-origin URLs (Supabase, fal.media) */
async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(proxyUrl(url));
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
    // Fallback: open in new tab
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function getFileExt(url: string): string {
  if (url.includes(".glb")) return "glb";
  if (url.includes(".mp4")) return "mp4";
  return "png";
}

/* Placeholder thumbnails removed — gallery only shows real jobs */

/** Fallback thumbnail shown when image URL fails to load (expired / deleted) */
const FALLBACK_THUMB = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="25" y="25" width="70" height="70" rx="12" fill="#2a2a4a" stroke="#3a3a6a" stroke-width="1.5"/><path d="M50 55 L60 45 L70 55" stroke="#5a5a8a" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="60" cy="65" r="2" fill="#5a5a8a"/></svg>')}`;

interface GalleryJob {
  id: string;
  name: string;
  status: "completed" | "processing" | "failed";
  thumbnails: string[];
  createdAt: string;
  credits: number;
  model: string;
  progress?: number;
  outputUrl?: string | null;
  outputType?: "glb" | "image" | "video" | null;
  errorMessage?: string | null;
}

/** Shape returned by the centralized useJobPolling() hook */
interface PolledJobInput {
  id: string;
  tool: string;
  model_id?: string;
  status: "pending" | "processing" | "completed" | "failed";
  credit_cost: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  output_url: string | null;
  output_type: "glb" | "image" | "video" | null;
  source_image: string | null;
}

/** Map API tool names back to workspace tool categories for filtering */
const API_TOOL_TO_CATEGORY: Record<string, string> = {
  "3d-model": "3d-model",
  "bg-remove": "image",
  "enhance": "image",
  "text-to-image": "image",
  "image-edit": "image",
  "video": "video",
  "talking-avatar": "video",
  "scene": "ecommerce",
  "aplus": "ecommerce",
  "virtual-tryon": "ecommerce",
  "logo": "design",
  "qr-code": "design",
};

/** Human-readable tool display names */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  "3d-model": "3D Model",
  "bg-remove": "Arka Plan Kaldır",
  "enhance": "Görsel İyileştir",
  "text-to-image": "AI Görsel",
  "image-edit": "Görsel Düzenle",
  "video": "Video",
  "talking-avatar": "Konuşan Avatar",
  "scene": "Sahne Üret",
  "aplus": "A+ İçerik",
  "virtual-tryon": "Kıyafet Giydirme",
  "logo": "Logo Üret",
  "qr-code": "QR Kod",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs} sn önce`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

/** Estimate progress for in-flight jobs using exponential curve (plain function — not flagged by purity rule) */
function estimateProgress(createdAt: string): number {
  return Math.min(90, Math.round(10 + (80 * (1 - Math.exp(-(Date.now() - new Date(createdAt).getTime()) / 60000 / 0.5)))));
}

interface ResultGalleryProps {
  activeTool?: string;
  polledJobs?: PolledJobInput[];
  onRefetch?: () => void;
}

export function ResultGallery({ activeTool = "3d-model", polledJobs = [], onRefetch }: ResultGalleryProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  // Convert polled jobs to GalleryJob format, filtered by current tool category
  const jobs: GalleryJob[] = polledJobs
    .filter((j) => {
      const category = API_TOOL_TO_CATEGORY[j.tool] ?? j.tool;
      return category === activeTool;
    })
    .map((j) => {
      // Pick best thumbnail: non-image outputs (GLB, video) can't render as <img>
      const isGlb = j.output_type === "glb" || (j.output_url?.includes(".glb") ?? false);
      const isVideo = j.output_type === "video" || (j.output_url?.includes(".mp4") ?? false);
      const thumbUrl = (isGlb || isVideo)
        ? (j.source_image || FALLBACK_THUMB)
        : (j.output_url || j.source_image || FALLBACK_THUMB);

      return {
        id: j.id,
        name: TOOL_DISPLAY_NAMES[j.tool] ?? j.tool,
        status: j.status === "completed" ? "completed" as const
             : j.status === "failed" ? "failed" as const
             : "processing" as const,
        thumbnails: [thumbUrl],
        createdAt: timeAgo(j.created_at),
        credits: j.credit_cost,
        model: j.model_id ?? (TOOL_DISPLAY_NAMES[j.tool] ?? j.tool),
        progress: (j.status === "processing" || j.status === "pending")
          ? estimateProgress(j.created_at)
          : undefined,
        outputUrl: j.output_url,
        outputType: j.output_type,
        errorMessage: j.error_message,
      };
    });
  const filteredJobs = searchQuery
    ? jobs.filter((j) => j.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : jobs;

  // Tool-specific labels
  const label = activeTool === "image" || activeTool === "ecommerce" ? "görsel" : activeTool === "video" ? "video" : activeTool === "design" ? "tasarım" : activeTool === "batch" ? "iş" : activeTool === "3d-model" ? "proje" : "öğe";

  // Empty state for tools with no jobs
  if (jobs.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-primary/50" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Henüz sonuç yok</p>
            <p className="text-xs text-muted-foreground/60">Bu araçla üretim yaptığında sonuçlar burada görünecek.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={`${jobs.length} ${label} içinde ara...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm bg-background/50"
          />
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{filteredJobs.length} {label}</span>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50">
        <Button
          variant={viewMode === "grid" ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewMode("grid")}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={viewMode === "list" ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewMode("list")}
        >
          <LayoutList className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredJobs.map((job) =>
          viewMode === "grid" ? (
            /* ═══ Grid card ═══ */
            <div
              key={job.id}
              className={cn(
                "rounded-xl p-3 border border-border/50 bg-background/30",
                "hover:border-primary/30 hover:bg-accent/20 transition-colors cursor-pointer"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{job.name}</span>
                  {job.status === "processing" && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      İşleniyor
                    </Badge>
                  )}
                  {job.status === "failed" && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                      Başarısız
                    </Badge>
                  )}
                </div>
                <JobDropdown job={job} onRefetch={onRefetch} />
              </div>

              <div className="flex gap-2">
                {job.thumbnails.map((src, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "group relative h-20 w-20 rounded-lg border border-border/30 overflow-hidden",
                      job.status === "processing" && "opacity-60"
                    )}
                  >
                    <img src={src} alt={`${job.name} #${idx + 1}`} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_THUMB; }} />
                    {job.outputType === "glb" && (
                      <div className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold text-white">3D</div>
                    )}
                    {(job.outputType === "video" || job.outputUrl?.includes(".mp4")) && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rounded-full bg-black/50 p-1.5">
                          <svg className="h-3 w-3 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    )}
                    {job.status === "processing" && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-[shimmer_2s_infinite]" />
                    )}
                    {job.status === "completed" && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:text-white hover:bg-white/20" onClick={() => { const u = job.outputUrl ?? src; if (!u) return; const isGlb = job.outputType === "glb" || u.includes(".glb"); if (isGlb) { window.open(`https://3dviewer.net/#model=${encodeURIComponent(u)}`, "_blank", "noopener,noreferrer"); } else { window.open(u, "_blank", "noopener,noreferrer"); } }}><Eye className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:text-white hover:bg-white/20" onClick={() => { const u = job.outputUrl ?? src; if (u) downloadFile(u, `${job.name.replace(/\s+/g, "_")}.${getFileExt(u)}`); }}><Download className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {job.status === "processing" && job.progress != null && (
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>{activeTool === "image" || activeTool === "ecommerce" ? "Görsel oluşturuluyor..." : activeTool === "video" ? "Video oluşturuluyor..." : activeTool === "design" ? "Tasarım oluşturuluyor..." : activeTool === "batch" ? "Toplu işlem devam ediyor..." : "3D model oluşturuluyor..."}</span>
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${job.progress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span>{job.createdAt}</span>
                  <span className="text-border">•</span>
                  <span>{job.model}</span>
                </div>
                <span>{job.credits} kredi</span>
              </div>
            </div>
          ) : (
            /* ═══ List row ═══ */
            <div
              key={job.id}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 border border-border/50 bg-background/30",
                "hover:border-primary/30 hover:bg-accent/20 transition-colors cursor-pointer"
              )}
            >
              <div className={cn(
                "relative h-10 w-10 rounded-md border border-border/30 overflow-hidden flex-none",
                job.status === "processing" && "opacity-60"
              )}>
                <img src={job.thumbnails[0]} alt={job.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_THUMB; }} />
                {job.status === "processing" && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-[shimmer_2s_infinite]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{job.name}</span>
                  {job.status === "processing" && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary flex-none" />
                  )}
                  {job.status === "failed" && (
                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 flex-none">Hata</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                  <span>{job.model}</span>
                  <span className="text-border">•</span>
                  <span>{job.createdAt}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-none">
                <span className="text-[10px] text-muted-foreground">{job.credits} kr</span>
                {job.status === "completed" && (job.outputUrl ?? job.thumbnails[0]) && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { const u = job.outputUrl ?? job.thumbnails[0]; if (u) downloadFile(u, `${job.name.replace(/\s+/g, "_")}.${getFileExt(u)}`); }}>
                    <Download className="h-3 w-3" />
                  </Button>
                )}
                <JobDropdown job={job} onRefetch={onRefetch} />
              </div>
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
        <span>{filteredJobs.length} {label}</span>
        <span>Toplam {filteredJobs.reduce((s, j) => s + j.credits, 0)} kredi</span>
      </div>
    </div>
  );
}

/* ═══ Shared dropdown menu ═══ */
function JobDropdown({ job, onRefetch }: { job: GalleryJob; onRefetch?: () => void }) {
  const url = job.outputUrl ?? job.thumbnails[0];
  const hasOutput = job.status === "completed" && !!url;

  const handleDownload = async () => {
    if (!url) { showToast("İndirilebilir dosya yok", "error"); return; }
    showToast("İndirme başlatıldı", "success");
    await downloadFile(url, `${job.name.replace(/\s+/g, "_")}.${getFileExt(url)}`);
  };

  const handleCopyLink = async () => {
    if (!url) { showToast("Kopyalanacak link yok", "error"); return; }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link kopyalandı", "success");
    } catch {
      showToast("Link kopyalanamadı", "error");
    }
  };

  const handlePreview = () => {
    if (!url) { showToast("Önizlenecek dosya yok", "error"); return; }
    const isGlb = job.outputType === "glb" || url.includes(".glb");
    if (isGlb) {
      // Open 3D model in Google Model Viewer (free, no login needed)
      window.open(
        `https://3dviewer.net/#model=${encodeURIComponent(url)}`,
        "_blank",
        "noopener,noreferrer"
      );
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleShare = async () => {
    if (!url) { showToast("Paylaşılacak dosya yok", "error"); return; }
    // Web Share API (mobile-friendly)
    if (navigator.share) {
      try {
        await navigator.share({ title: job.name, url });
        return;
      } catch {
        // User cancelled or API failed — fall through to clipboard
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link panoya kopyalandı", "success");
    } catch {
      showToast("Paylaşım başarısız", "error");
    }
  };

  const handleRegenerate = async () => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/regenerate`, { method: "POST" });
      if (res.status === 402) {
        window.dispatchEvent(new CustomEvent("show-upgrade"));
        showToast("Yetersiz kredi", "error");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showToast(body?.error ?? "Yeniden üretim başarısız", "error");
        return;
      }
      showToast("Yeniden üretim başlatıldı!", "success");
      window.dispatchEvent(new Event("job-submitted"));
      onRefetch?.();
    } catch {
      showToast("Bağlantı hatası", "error");
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showToast(body?.error ?? "Silme başarısız", "error");
        return;
      }
      showToast("Proje silindi", "success");
      onRefetch?.();
    } catch {
      showToast("Bağlantı hatası", "error");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={handlePreview} disabled={!hasOutput}>
          <Eye className="h-3.5 w-3.5 mr-2" />Önizle
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload} disabled={!hasOutput}>
          <Download className="h-3.5 w-3.5 mr-2" />İndir
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink} disabled={!hasOutput}>
          <Copy className="h-3.5 w-3.5 mr-2" />Linki Kopyala
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShare} disabled={!hasOutput}>
          <Share2 className="h-3.5 w-3.5 mr-2" />Paylaş
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleRegenerate}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" />Yeniden Üret
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete} disabled={job.status === "processing"}>
          <Trash2 className="h-3.5 w-3.5 mr-2" />Sil
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
