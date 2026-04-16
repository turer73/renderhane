"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { ChevronDown, Settings2, LayoutGrid } from "lucide-react";

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
  outputType: "glb" | "image" | "video" | null;
  tool: string;
  errorMessage: string | null;
}

const STAGES_3D = [
  { at: 0, label: "Görüntü analiz ediliyor..." },
  { at: 20, label: "3D nokta bulutu oluşturuluyor..." },
  { at: 45, label: "Mesh oluşturuluyor..." },
  { at: 65, label: "Texture oluşturuluyor..." },
  { at: 85, label: "Model optimize ediliyor..." },
  { at: 95, label: "Son rötuşlar..." },
];

const STAGES_VIDEO = [
  { at: 0, label: "Görüntü analiz ediliyor..." },
  { at: 15, label: "Hareket vektörleri hesaplanıyor..." },
  { at: 35, label: "Çerçeveler oluşturuluyor..." },
  { at: 55, label: "Video sentezleniyor..." },
  { at: 75, label: "Kalite iyileştiriliyor..." },
  { at: 90, label: "Video kodlanıyor..." },
  { at: 97, label: "Son paketleme..." },
];

const STAGES_IMAGE = [
  { at: 0, label: "Görsel analiz ediliyor..." },
  { at: 20, label: "AI modeli çalışıyor..." },
  { at: 50, label: "Piksel işleme yapılıyor..." },
  { at: 75, label: "Kalite kontrol ediliyor..." },
  { at: 90, label: "Çıktı hazırlanıyor..." },
  { at: 97, label: "Son dokunuşlar..." },
];

const STAGES_ECOMMERCE = [
  { at: 0, label: "Ürün segmentasyonu yapılıyor..." },
  { at: 20, label: "Arkaplan kaldırılıyor..." },
  { at: 40, label: "Sahne oluşturuluyor..." },
  { at: 60, label: "Aydınlatma ayarlanıyor..." },
  { at: 80, label: "Gölgeler ekleniyor..." },
  { at: 95, label: "Son dokunuşlar..." },
];

const STAGES_DESIGN = [
  { at: 0, label: "Konsept analiz ediliyor..." },
  { at: 25, label: "Tasarım varyasyonları oluşturuluyor..." },
  { at: 50, label: "Renk ve tipografi ayarlanıyor..." },
  { at: 75, label: "Detaylar ince ayarlanıyor..." },
  { at: 95, label: "Son dokunuşlar..." },
];

const STAGES_BATCH = [
  { at: 0, label: "Görseller yükleniyor..." },
  { at: 15, label: "Kuyruk hazırlanıyor..." },
  { at: 30, label: "Görseller işleniyor... (1/N)" },
  { at: 60, label: "Görseller işleniyor... (N/2/N)" },
  { at: 85, label: "Sonuçlar paketleniyor..." },
  { at: 95, label: "Tamamlanıyor..." },
];

const STAGES_BY_TOOL: Record<string, typeof STAGES_3D> = {
  "3d-model": STAGES_3D,
  "image": STAGES_IMAGE,
  "video": STAGES_VIDEO,
  "ecommerce": STAGES_ECOMMERCE,
  "design": STAGES_DESIGN,
  "batch": STAGES_BATCH,
};

/** Get estimated stage label based on tool type and progress percentage */
function getStageLabel(tool: string, progress: number, status: string): string {
  if (status === "completed") return "Tamamlandı!";
  if (status === "failed") return "Başarısız";
  if (status === "pending") return "Kuyrukta bekliyor...";
  const stages = STAGES_BY_TOOL[tool] ?? STAGES_3D;
  return [...stages].reverse().find((s) => progress >= s.at)?.label ?? stages[0].label;
}


interface WorkspaceLayoutProps {
  activeTool: string;
  onToolChange: (tool: string) => void;
  /** If set, pre-select this tab on first mount (deep link from dashboard) */
  initialTab?: string;
}

export function WorkspaceLayout({
  activeTool,
  onToolChange,
  initialTab,
}: WorkspaceLayoutProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobMeta, setActiveJobMeta] = useState<{ name: string; model: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [mobileGalleryOpen, setMobileGalleryOpen] = useState(false);
  const startTimeRef = useRef<number>(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [estimatedProgress, setEstimatedProgress] = useState(0);

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
    setEstimatedProgress(0);
  }

  // Derive initial progress from job status during render
  const [prevJobState, setPrevJobState] = useState<{ id: string | null; status: string | undefined }>({ id: null, status: undefined });
  const currentJobId = polledJob?.id ?? null;
  const currentJobStatus = polledJob?.status;
  if (prevJobState.id !== currentJobId || prevJobState.status !== currentJobStatus) {
    setPrevJobState({ id: currentJobId, status: currentJobStatus });
    if (currentJobStatus === "processing" || currentJobStatus === "pending") {
      setEstimatedProgress(currentJobStatus === "pending" ? 5 : 15);
    } else if (currentJobStatus === "completed") {
      setEstimatedProgress(100);
    } else {
      setEstimatedProgress(0);
    }
  }

  // Progress animation interval + cleanup (ref access is safe inside effects)
  useEffect(() => {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }

    if (polledJob?.status === "processing" || polledJob?.status === "pending") {
      startTimeRef.current = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        // Asymptotic progress: approaches 95% but never reaches 100%
        const progress = Math.min(95, Math.round(15 + (80 * (1 - Math.exp(-elapsed / 30)))));
        setEstimatedProgress(progress);
      }, 500);
    }

    return () => {
      if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
    };
  }, [activeTool, activeJobId, polledJob?.status]);

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
    progress: estimatedProgress,
    stage: getStageLabel(activeTool, estimatedProgress, polledJob.status),
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
    progress: 2,
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
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        ...(payload.imageUrls ? { imageUrls: payload.imageUrls } : {}),
        ...(payload.prompt ? { prompt: payload.prompt } : {}),
        ...(payload.autoEnhance ? { autoEnhance: true } : {}),
        ...(payload.extraParams ? { extraParams: payload.extraParams } : {}),
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

  return (
    <>
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
        <WorkspacePreview activeTool={activeTool} activeJob={activeJob} />
      </div>

      {/* Collapsible Form */}
      <div className="px-2 pt-2">
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
            <ToolFormPanel activeTool={activeTool} onGenerate={handleGenerate} initialTab={initialTab} />
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
        <ToolFormPanel activeTool={activeTool} onGenerate={handleGenerate} initialTab={initialTab} />
      </div>

      {/* Right: Preview + Gallery (resizable) */}
      <PanelGroup orientation="horizontal" className="flex-1 min-w-0">
        <Panel defaultSize="55%" minSize="30%">
          <WorkspacePreview activeTool={activeTool} activeJob={activeJob} />
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
