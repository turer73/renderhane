"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Trash2,
  ArrowUpDown,
  Box,
  ImageIcon,
  Video,
  Palette,
  LayoutGrid,
  Loader2,
} from "lucide-react";
import { proxyUrl } from "@/lib/proxy-url";
import { DownloadMenu } from "@/components/app/download-menu";

/* Lazy-load 3D thumbnail — only when GLB outputs exist */
const ModelThumbnail = dynamic(
  () =>
    import("@/components/viewer/model-thumbnail").then(
      (m) => m.ModelThumbnail
    ),
  { ssr: false }
);

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface CatalogOutput {
  id: string;
  type: "glb" | "image" | "video";
  falUrl: string | null;
  r2Url: string | null;
  fileSize: number | null;
  createdAt: string;
  jobId: string;
  tool: string;
  modelId: string;
  projectName: string;
  projectId: string;
}

interface OutputCatalogProps {
  outputs: CatalogOutput[];
  locale: string;
}

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

type FilterCategory = "all" | "3d" | "image" | "video" | "design";

const TOOL_TO_CATEGORY: Record<string, FilterCategory> = {
  "3d-model": "3d",
  "bg-remove": "image",
  "enhance": "image",
  "text-to-image": "image",
  "image-edit": "image",
  "inpainting": "image",
  "object-removal": "image",
  "video": "video",
  "talking-avatar": "video",
  "scene": "design",
  "aplus": "design",
  "virtual-tryon": "design",
  "logo": "design",
  "qr-code": "design",
  "social-kit": "design",
};

const FILTER_TABS: {
  key: FilterCategory;
  labelKey: string;
  icon: typeof LayoutGrid;
}[] = [
  { key: "all", labelKey: "filterAll", icon: LayoutGrid },
  { key: "3d", labelKey: "filter3d", icon: Box },
  { key: "image", labelKey: "filterImage", icon: ImageIcon },
  { key: "video", labelKey: "filterVideo", icon: Video },
  { key: "design", labelKey: "filterDesign", icon: Palette },
];

/** Human-readable tool names (Turkish) */
const TOOL_LABELS: Record<string, string> = {
  "3d-model": "3D Model",
  "bg-remove": "Arka Plan Kaldır",
  enhance: "Görsel İyileştir",
  "text-to-image": "AI Görsel",
  "image-edit": "Görsel Düzenle",
  "object-removal": "Nesne Sil",
  inpainting: "Inpainting",
  video: "Video",
  "talking-avatar": "Konuşan Avatar",
  scene: "Sahne Üret",
  aplus: "A+ İçerik",
  "virtual-tryon": "Kıyafet Giydirme",
  logo: "Logo Üret",
  "qr-code": "QR Kod",
  "social-kit": "Sosyal Kit",
};

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function getOutputUrl(o: CatalogOutput): string {
  return o.r2Url || o.falUrl || "";
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ────────────────────────────────────────────
// Component
// ────────────────────────────────────────────

export function OutputCatalog({ outputs: initialOutputs, locale }: OutputCatalogProps) {
  const t = useTranslations("projects");
  const params = useParams<{ locale: string }>();
  const loc = params.locale || locale;

  // State
  const [outputs, setOutputs] = useState(initialOutputs);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(false); // false = newest first
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<CatalogOutput | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered + sorted outputs
  const filteredOutputs = useMemo(() => {
    let list = outputs;

    // Category filter
    if (activeFilter !== "all") {
      list = list.filter(
        (o) => (TOOL_TO_CATEGORY[o.tool] ?? "design") === activeFilter
      );
    }

    // Search by project name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((o) => o.projectName.toLowerCase().includes(q));
    }

    // Sort
    list = [...list].sort((a, b) => {
      const diff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortAsc ? -diff : diff;
    });

    return list;
  }, [outputs, activeFilter, searchQuery, sortAsc]);

  // Category counts (from full list, not filtered)
  const categoryCounts = useMemo(() => {
    const counts: Record<FilterCategory, number> = {
      all: outputs.length,
      "3d": 0,
      image: 0,
      video: 0,
      design: 0,
    };
    for (const o of outputs) {
      const cat = TOOL_TO_CATEGORY[o.tool] ?? "design";
      counts[cat]++;
    }
    return counts;
  }, [outputs]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    // Optimistic removal
    const prev = outputs;
    setOutputs((list) => list.filter((o) => o.id !== deleteTarget.id));
    setDeleteTarget(null);

    try {
      const res = await fetch(`/api/jobs/${deleteTarget.jobId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      toast.success(t("deleteSuccess"));
    } catch {
      // Rollback
      setOutputs(prev);
      toast.error(t("deleteError"));
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, outputs, t]);

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(loc, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // ── Empty state ──
  if (outputs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-20">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mb-4 text-muted-foreground/30"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        <p className="text-center text-sm text-muted-foreground mb-4">
          {t("empty")}
        </p>
        <Button asChild>
          <Link href={`/${loc}/app`}>{t("goToStudio")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Toolbar: Filters + Search + Sort ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const count = categoryCounts[tab.key];
            const isActive = activeFilter === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(tab.labelKey)}
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56 sm:flex-initial">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSortAsc((v) => !v)}
            className="h-8 gap-1.5 text-xs"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortAsc ? t("sortOldest") : t("sortNewest")}
          </Button>
        </div>
      </div>

      {/* ── Results count ── */}
      <p className="text-xs text-muted-foreground">
        {t("totalOutputs", { count: filteredOutputs.length })}
      </p>

      {/* ── Empty filter/search state ── */}
      {filteredOutputs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 py-14">
          <Search className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {searchQuery.trim() ? t("emptySearch") : t("emptyFilter")}
          </p>
        </div>
      )}

      {/* ── Output Grid ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filteredOutputs.map((output) => {
          const url = getOutputUrl(output);
          const category = TOOL_TO_CATEGORY[output.tool] ?? "design";
          const toolLabel = TOOL_LABELS[output.tool] ?? output.tool;

          return (
            <Card
              key={output.id}
              className="group overflow-hidden border-border/50 shadow-sm transition-all hover:border-primary/30 hover:shadow-md p-0"
            >
              {/* Thumbnail area */}
              <Link
                href={`/${loc}/app/output/${output.id}`}
                className="relative block aspect-square w-full overflow-hidden bg-muted"
              >
                {/* Image outputs */}
                {output.type === "image" &&
                url &&
                !failedImages.has(output.id) ? (
                  <Image
                    src={proxyUrl(url)}
                    alt={output.projectName}
                    fill
                    unoptimized
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    onError={() =>
                      setFailedImages((prev) => new Set(prev).add(output.id))
                    }
                  />
                ) : output.type === "glb" && url ? (
                  /* 3D Model outputs */
                  <div className="relative h-full w-full bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-900 dark:to-slate-800">
                    <ModelThumbnail url={proxyUrl(url)} />
                  </div>
                ) : output.type === "video" && url ? (
                  /* Video outputs */
                  <div className="relative h-full w-full bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-900 dark:to-slate-800">
                    <video
                      src={proxyUrl(url)}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                      onMouseEnter={(e) =>
                        e.currentTarget.play().catch(() => {})
                      }
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  </div>
                ) : (
                  /* Placeholder */
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                    {failedImages.has(output.id) && (
                      <span className="text-[10px] text-muted-foreground/50">
                        {t("imageExpired")}
                      </span>
                    )}
                  </div>
                )}

                {/* Type badge overlay */}
                <div className="absolute bottom-2 left-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm",
                      category === "3d"
                        ? "bg-blue-600/80"
                        : category === "video"
                          ? "bg-purple-600/80"
                          : category === "design"
                            ? "bg-amber-600/80"
                            : "bg-black/60"
                    )}
                  >
                    {output.type === "glb"
                      ? "3D"
                      : output.type === "video"
                        ? "Video"
                        : toolLabel}
                  </span>
                </div>
              </Link>

              {/* Card footer: info + actions */}
              <div className="flex items-center justify-between gap-1 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {output.projectName}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{formatDate(output.createdAt)}</span>
                    {output.fileSize && (
                      <>
                        <span>&middot;</span>
                        <span>{formatFileSize(output.fileSize)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Download */}
                  {url && (
                    <DownloadMenu
                      url={proxyUrl(url)}
                      outputType={output.type}
                      compact
                    />
                  )}
                  {/* Delete */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      setDeleteTarget(output);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                {deleteTarget.type === "glb" ? (
                  <Box className="h-5 w-5 text-blue-500" />
                ) : deleteTarget.type === "video" ? (
                  <Video className="h-5 w-5 text-purple-500" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {deleteTarget.projectName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {TOOL_LABELS[deleteTarget.tool] ?? deleteTarget.tool} &middot;{" "}
                  {formatDate(deleteTarget.createdAt)}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              {t("deleteCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
