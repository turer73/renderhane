"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { ToolIconSidebar } from "./tool-icon-sidebar";
import { ToolFormPanel, type GeneratePayload } from "./tool-form-panel";
import { WorkspacePreview } from "./workspace-preview";
import { ResultGallery } from "./result-gallery";
import { useJobPolling } from "@/hooks/use-job-polling";
import { showToast } from "./workspace-toast";
import { cn } from "@/lib/utils";
import { ChevronDown, Settings2, LayoutGrid, Sparkles, X } from "lucide-react";
import { useParams } from "next/navigation";

export interface GenerationJob {
  id: string;
  name: string;
  model: string;
  credits: number;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  stage: string;
  thumbnail: string | null;
  outputUrl: string | null;
  outputType: "glb" | "image" | "video" | "audio" | null;
  tool: string;
  errorMessage: string | null;
}

function getStageLabel(status: string, locale: string): string {
  const isTr = locale === "tr";
  if (status === "completed") return isTr ? "Tamamlandı" : "Completed";
  if (status === "failed") return isTr ? "Başarısız" : "Failed";
  if (status === "pending") return isTr ? "Kuyrukta bekliyor" : "Waiting in queue";
  return isTr ? "Üretim devam ediyor" : "Generation in progress";
}

interface WorkspaceLayoutProps {
  activeTool: string;
  onToolChange: (tool: string) => void;
  /** If set, pre-select this tab on first mount (deep link from dashboard) */
  initialTab?: string;
  onTabChange?: (tab: string) => void;
}

export function WorkspaceLayout({
  activeTool,
  onToolChange,
  initialTab,
  onTabChange,
}: WorkspaceLayoutProps) {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "tr";
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobMeta, setActiveJobMeta] = useState<{ name: string; model: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mobileFormOpen, setMobileFormOpen] = useState(true);
  const [mobileGalleryOpen, setMobileGalleryOpen] = useState(false);
  const [lastPayload, setLastPayload] = useState<GeneratePayload | null>(null);
  /** The prompt the site auto-composed (scene/aplus/image-edit) — shown for transparency. */
  const [smartPrompt, setSmartPrompt] = useState<string | null>(null);

  // Access centralized job polling
  const { jobs, refetch } = useJobPolling();

  // Find active polled job by ID
  const polledJob = activeJobId ? jobs.find((j) => j.id === activeJobId) : null;

  // Reset state when tool changes — useState pattern (React-recommended: refs can't be
  // accessed during render with React compiler, and useEffect setState causes cascading renders)
  const [prevTool, setPrevTool] = useState(activeTool);
  if (prevTool !== activeTool) {
    setPrevTool(activeTool);
    setActiveJobId(null);
    setActiveJobMeta(null);
  }

  // Notify on completion
  useEffect(() => {
    if (polledJob?.status === "completed") {
      showToast("Üretim tamamlandı!", "success");
    } else if (polledJob?.status === "failed") {
      showToast(polledJob.error_message || "Üretim başarısız oldu", "error");
    }
  }, [polledJob?.status, polledJob?.error_message]);

  // Build GenerationJob from polled data + local meta
  const activeJob: GenerationJob | null = polledJob && activeJobMeta ? {
    id: polledJob.id,
    name: activeJobMeta.name,
    model: activeJobMeta.model,
    credits: polledJob.credit_cost,
    status: polledJob.status,
    progress: polledJob.status === "completed" ? 100 : 0,
    stage: getStageLabel(polledJob.status, locale),
    thumbnail: polledJob.output_url,
    outputUrl: polledJob.output_url,
    outputType: polledJob.output_type,
    tool: polledJob.tool,
    errorMessage: polledJob.error_message,
  } : submitting ? {
    id: "submitting",
    name: activeJobMeta?.name ?? "Yeni Proje",
    model: activeJobMeta?.model ?? "",
    credits: 0,
    status: "pending",
    progress: 0,
    stage: "İş gönderiliyor...",
    thumbnail: null,
    outputUrl: null,
    outputType: null,
    tool: activeTool,
    errorMessage: null,
  } : null;

  const handleGenerate = useCallback(async (payload: GeneratePayload) => {
    setSubmitting(true);
    setActiveJobMeta({ name: payload.name, model: payload.model });

    try {
      const body: Record<string, unknown> = {
        tool: payload.apiTool,
        ...(payload.tier ? { tier: payload.tier } : {}),
        ...(payload.modelKey ? { modelKey: payload.modelKey } : {}),
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        ...(payload.imageUrls ? { imageUrls: payload.imageUrls } : {}),
        ...(payload.prompt ? { prompt: payload.prompt } : {}),
        ...(payload.autoEnhance ? { autoEnhance: true } : {}),
        ...(payload.skipBgRemove ? { skipBgRemove: true } : {}),
        ...(payload.extraParams ? { extraParams: payload.extraParams } : {}),
        ...(payload.promptContext ? { promptContext: payload.promptContext } : {}),
      };

      const res = await fetch("/api/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 402) {
        window.dispatchEvent(new CustomEvent("show-upgrade"));
        showToast("Yetersiz kredi. Lütfen kredi satın al.", "error");
        setSubmitting(false);
        setActiveJobMeta(null);
        return;
      }

      if (res.status === 429) {
        showToast("Çok hızlı! Lütfen biraz bekle.", "error");
        setSubmitting(false);
        setActiveJobMeta(null);
        return;
      }

      if (!res.ok) {
        let errorText = "Üretim başlatılamadı. Tekrar dene.";
        try {
          const errBody = await res.json();
          if (errBody?.error) errorText = errBody.error;
        } catch { /* use generic */ }
        showToast(errorText, "error");
        setSubmitting(false);
        setActiveJobMeta(null);
        return;
      }

      const data = await res.json();
      setActiveJobId(data.jobId);
      setSubmitting(false);
      setLastPayload(payload);
      setSmartPrompt(typeof data.composedPrompt === "string" ? data.composedPrompt : null);

      // Trigger credit refresh + polling refetch
      window.dispatchEvent(new Event("job-submitted"));
      refetch();
      showToast("Üretim başlatıldı!", "success");
    } catch {
      showToast("Bağlantı hatası. İnterneti kontrol et.", "error");
      setSubmitting(false);
      setActiveJobMeta(null);
    }
  }, [refetch]);

  const handleStart = useCallback(() => {
    setMobileFormOpen(true);
    setMobileGalleryOpen(false);
    requestAnimationFrame(() => {
      document.querySelector("[data-mobile-tool-form]")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  /** Re-run the last successful job with the same parameters (1x). */
  const handleRetry = useCallback(() => {
    if (!lastPayload) {
      showToast("Önce bir üretim tamamla", "info");
      return;
    }
    handleGenerate(lastPayload);
  }, [lastPayload, handleGenerate]);

  /** Submit 3 parallel variations of the last successful job (different seeds). */
  const handleVariation = useCallback(async () => {
    if (!lastPayload) {
      showToast("Önce bir üretim tamamla", "info");
      return;
    }
    const cost = lastPayload.credits * 3;
    const ok = window.confirm(
      `3 varyasyon üretilecek (toplam ${cost} kredi). Her biri farklı bir sonuç verecek. Devam edilsin mi?`
    );
    if (!ok) return;

    showToast(`${cost} kredi ile 3 varyasyon başlatılıyor...`, "info");
    // Stagger 200ms apart to avoid burst rate limit, but still mostly parallel.
    for (let i = 0; i < 3; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 200));
      handleGenerate(lastPayload);
    }
  }, [lastPayload, handleGenerate]);

  return (
    <>
    {/* Smart-prompt transparency banner — what the site auto-composed */}
    {smartPrompt && (
      <div className="fixed bottom-4 left-1/2 z-50 w-[92%] max-w-xl -translate-x-1/2 rounded-xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-bottom-2">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground">AI hazırladı</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-3">{smartPrompt}</p>
          </div>
          <button
            type="button"
            onClick={() => setSmartPrompt(null)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Kapat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )}

    {/* ═══ Mobile layout (< md) ═══ */}
    <div className="flex md:hidden h-full w-full flex-col overflow-y-auto">
      {/* Horizontal tool strip */}
      <ToolIconSidebar
        activeTool={activeTool}
        onToolChange={onToolChange}
        layout="horizontal"
      />

      {/* Preview */}
      <div className="min-h-[280px] px-2 pt-2">
        <WorkspacePreview activeTool={activeTool} activeJob={activeJob} onStart={handleStart} onRetry={handleRetry} onVariation={handleVariation} />
      </div>

      {/* Collapsible Form */}
      <div data-mobile-tool-form className="scroll-mt-2 px-2 pt-2">
        <button
          onClick={() => { setMobileFormOpen(!mobileFormOpen); if (!mobileFormOpen) setMobileGalleryOpen(false); }}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Ayarlar</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", mobileFormOpen && "rotate-180")} />
        </button>
        {mobileFormOpen && (
          <div className="mt-1 overflow-hidden rounded-2xl border border-border bg-card animate-in slide-in-from-top-2 duration-200">
            <ToolFormPanel activeTool={activeTool} onGenerate={handleGenerate} initialTab={initialTab} onToolChange={onToolChange} onTabChange={onTabChange} />
          </div>
        )}
      </div>

      {/* Collapsible Gallery */}
      <div className="px-2 py-2">
        <button
          onClick={() => { setMobileGalleryOpen(!mobileGalleryOpen); if (!mobileGalleryOpen) setMobileFormOpen(false); }}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Galeri</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", mobileGalleryOpen && "rotate-180")} />
        </button>
        {mobileGalleryOpen && (
          <div className="mt-1 h-[300px] overflow-hidden rounded-2xl border border-border bg-card animate-in slide-in-from-top-2 duration-200">
            <ResultGallery activeTool={activeTool} polledJobs={jobs} onRefetch={refetch} />
          </div>
        )}
      </div>
    </div>

    {/* ═══ Desktop layout (≥ md) ═══ */}
    <div className="hidden md:flex h-full w-full gap-3 px-2 pb-2">
      {/* Left: Icon Sidebar + Form Panel */}
      <div className="flex w-[344px] flex-none overflow-hidden rounded-2xl border border-border bg-card">
        <ToolIconSidebar
          activeTool={activeTool}
          onToolChange={onToolChange}
        />
        <ToolFormPanel activeTool={activeTool} onGenerate={handleGenerate} initialTab={initialTab} onToolChange={onToolChange} />
      </div>

      {/* Right: Preview + Gallery (resizable) */}
      <PanelGroup orientation="horizontal" className="flex-1 min-w-0">
        <Panel defaultSize="55%" minSize="30%">
          <WorkspacePreview activeTool={activeTool} activeJob={activeJob} onRetry={handleRetry} onVariation={handleVariation} />
        </Panel>

        <PanelResizeHandle
          className={cn(
            "group relative w-[6px] mx-0.5 flex items-center justify-center",
            "transition-colors duration-200"
          )}
        >
          {/* Visible track */}
          <div className={cn(
            "absolute inset-y-[20%] w-[2px] rounded-full",
            "bg-border/40 group-hover:bg-primary/60 group-active:bg-primary",
            "transition-colors duration-200"
          )} />
          {/* Grip dots */}
          <div className="relative flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="h-1 w-1 rounded-full bg-primary/60" />
            <div className="h-1 w-1 rounded-full bg-primary/60" />
            <div className="h-1 w-1 rounded-full bg-primary/60" />
          </div>
        </PanelResizeHandle>

        <Panel defaultSize="45%" minSize="25%">
          <ResultGallery activeTool={activeTool} polledJobs={jobs} onRefetch={refetch} />
        </Panel>
      </PanelGroup>
    </div>
    </>
  );
}
