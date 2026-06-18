"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  X,
  Sparkles,
  Clock,
  Coins,
  Loader2,
  ImageIcon,
  Type,
  Wand2,
  PenLine,
  Brush,
  Scissors,
  ZoomIn,
  Rocket,
  Palette,
  Eraser,
  Maximize2,
  SunMedium,
  Video,
  Film,
  User,
  Mic,
  ShoppingBag,
  Camera,
  Shirt,
  LayoutGrid,
  QrCode,
  Crown,
  FolderUp,
  FileStack,
} from "lucide-react";
import { showToast } from "./workspace-toast";
import type { PromptContext } from "@/lib/prompts/presets";
import { smartDefaultsFor, primaryToolTarget } from "@/lib/analysis/product-intel";

/* ═══════════════════════════════════════════════
   AI Model & Tab configs
   ═══════════════════════════════════════════════ */

const AI_MODELS_3D = [
  { id: "trellis-v1", name: "TRELLIS v1", credits: 5, time: "~15 sn", tier: "fast" },
  { id: "tripo-2.5", name: "Tripo 2.5", credits: 10, time: "~30 sn", tier: "fast" },
  { id: "meshy-6", name: "Meshy 6", credits: 18, time: "~2 dk", tier: "standard" },
  { id: "hunyuan3d-v3", name: "Hunyuan3D V3", credits: 20, time: "~3 dk", tier: "standard" },
  { id: "rodin", name: "Rodin Premium", credits: 35, time: "~2 dk", tier: "premium" },
];

const IMAGE_TOOL_INFO: Record<string, { model: string; credits: number; time: string }> = {
  "bg-remove": { model: "birefnet v2", credits: 1, time: "~5 sn" },
  "enhance": { model: "Aura SR", credits: 4, time: "~10 sn" },
  "text-to-image": { model: "FLUX 2 Pro", credits: 4, time: "~8 sn" },
  "image-edit": { model: "FLUX Kontext", credits: 6, time: "~10 sn" },
  "object-removal": { model: "Object Removal", credits: 3, time: "~5 sn" },
};

/* Model pickers — default option keeps today's behavior (no modelKey sent);
   Nano Banana Pro routes explicitly via modelKey to the premium fal.ai model. */
interface PickerModel { id: string; name: string; credits: number; time: string; modelKey?: string; tier?: string; }

const EDIT_MODELS: PickerModel[] = [
  { id: "flux-kontext", name: "FLUX Kontext", credits: 6, time: "~10 sn" },
  { id: "nano-banana-pro-edit", name: "Nano Banana Pro — En Kaliteli", credits: 18, time: "~20 sn", modelKey: "nano-banana-pro-edit", tier: "premium" },
];

const TEXT_MODELS: PickerModel[] = [
  { id: "flux-2-pro", name: "FLUX 2 Pro", credits: 4, time: "~8 sn" },
  { id: "nano-banana-pro", name: "Nano Banana Pro — En Kaliteli", credits: 18, time: "~12 sn", modelKey: "nano-banana-pro", tier: "premium" },
];

const SCENE_MODELS: PickerModel[] = [
  { id: "bria-product-shot", name: "Bria Product Shot", credits: 8, time: "~15 sn" },
  { id: "nano-banana-pro-edit", name: "Nano Banana Pro — En Kaliteli", credits: 18, time: "~20 sn", modelKey: "nano-banana-pro-edit", tier: "premium" },
];

const VIDEO_MODELS = [
  { id: "wan-v2.6", name: "Wan 2.6", credits: 20, time: "~2 dk", tier: "fast" },
  { id: "kling-3.0", name: "Kling 3.0 Pro", credits: 25, time: "~2 dk", tier: "premium" },
];

const VIDEO_TOOL_INFO: Record<string, { model: string; credits: number; time: string }> = {
  "image-to-video": { model: "Wan 2.6", credits: 20, time: "~2 dk" },
  "text-to-video": { model: "Kling 3.0 Pro", credits: 25, time: "~2 dk" },
  "talking-avatar": { model: "OmniHuman v1.5", credits: 25, time: "~2 dk" },
};

const TABS_VIDEO = [
  { id: "image-to-video", label: "Görsel", icon: Film },
  { id: "text-to-video", label: "Metin", icon: Type },
  { id: "talking-avatar", label: "Avatar", icon: User },
];

const ECOMMERCE_TOOL_INFO: Record<string, { model: string; credits: number; time: string }> = {
  "scene": { model: "Bria Product Shot", credits: 8, time: "~15 sn" },
  "aplus": { model: "Bria Product Shot HD", credits: 8, time: "~20 sn" },
  "virtual-tryon": { model: "IDM-VTON", credits: 10, time: "~25 sn" },
};

const TABS_ECOMMERCE = [
  { id: "scene", label: "Sahne", icon: Camera },
  { id: "aplus", label: "A+", icon: LayoutGrid },
  { id: "virtual-tryon", label: "Deneme", icon: Shirt },
];

const DESIGN_TOOL_INFO: Record<string, { model: string; credits: number; time: string }> = {
  "logo": { model: "Recraft V4", credits: 8, time: "~10 sn" },
  "qr-code": { model: "AI Sanatsal QR", credits: 6, time: "~10 sn" },
};

const TABS_DESIGN = [
  { id: "logo", label: "Logo", icon: Crown },
  { id: "qr-code", label: "QR Kod", icon: QrCode },
];

/* ── Logo tool structured input options ─────────────────── */
const LOGO_INDUSTRIES = [
  { value: "technology", label: "Teknoloji" },
  { value: "food-beverage", label: "Gıda & İçecek" },
  { value: "fashion", label: "Moda & Giyim" },
  { value: "healthcare", label: "Sağlık & Medikal" },
  { value: "finance", label: "Finans & Bankacılık" },
  { value: "education", label: "Eğitim" },
  { value: "real-estate", label: "Gayrimenkul" },
  { value: "sports", label: "Spor & Fitness" },
  { value: "travel", label: "Seyahat & Turizm" },
  { value: "entertainment", label: "Eğlence & Medya" },
  { value: "beauty", label: "Güzellik & Bakım" },
  { value: "automotive", label: "Otomotiv" },
  { value: "agriculture", label: "Tarım & Gıda Üretimi" },
  { value: "construction", label: "İnşaat & Mimarlık" },
  { value: "other", label: "Diğer" },
];

const LOGO_STYLES = [
  { value: "minimal", label: "Minimalist", recraftStyle: "logo" as const },
  { value: "modern", label: "Modern", recraftStyle: "logo" as const },
  { value: "vintage", label: "Vintage", recraftStyle: "digital_illustration" as const },
  { value: "playful", label: "Eğlenceli", recraftStyle: "digital_illustration" as const },
  { value: "corporate", label: "Kurumsal", recraftStyle: "logo" as const },
  { value: "luxury", label: "Lüks & Premium", recraftStyle: "logo" as const },
  { value: "handwritten", label: "El Yazısı", recraftStyle: "digital_illustration" as const },
  { value: "geometric", label: "Geometrik", recraftStyle: "logo" as const },
];

const LOGO_COLOR_PALETTE = [
  { hex: "#4f46e5", label: "İndigo" },
  { hex: "#ef4444", label: "Kırmızı" },
  { hex: "#22c55e", label: "Yeşil" },
  { hex: "#f97316", label: "Turuncu" },
  { hex: "#8b5cf6", label: "Mor" },
  { hex: "#ec4899", label: "Pembe" },
  { hex: "#0ea5e9", label: "Mavi" },
  { hex: "#1a1a2e", label: "Koyu" },
  { hex: "#f59e0b", label: "Altın" },
  { hex: "#14b8a6", label: "Teal" },
];

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

const TABS_3D = [
  { id: "img-to-3d", label: "Fotoğraf", icon: ImageIcon },
  { id: "text-to-3d", label: "Metin", icon: Type },
  { id: "texture", label: "Doku", icon: Wand2 },
];

const TABS_IMAGE = [
  { id: "bg-remove", label: "Arkaplan", icon: Scissors },
  { id: "enhance", label: "İyileştir", icon: ZoomIn },
  { id: "text-to-image", label: "Oluştur", icon: PenLine },
  { id: "image-edit", label: "Düzenle", icon: Brush },
  { id: "object-removal", label: "Nesne Sil", icon: Eraser },
];

const DEFAULT_TABS: Record<string, typeof TABS_3D> = {
  "3d-model": TABS_3D,
  "image": TABS_IMAGE,
  "video": TABS_VIDEO,
  "ecommerce": TABS_ECOMMERCE,
  "design": TABS_DESIGN,
};

const EDIT_ACTIONS = [
  { id: "recolor", label: "Renk Değiştir", icon: Palette, desc: "Ürün veya arkaplan rengini değiştir" },
  { id: "bg-swap", label: "Arkaplan Değiştir", icon: ImageIcon, desc: "Arkaplanı kaldır, değiştir veya bulanıklaştır" },
  { id: "remove-obj", label: "Nesne Kaldır", icon: Eraser, desc: "İstenmeyen nesneleri otomatik sil" },
  { id: "retouch", label: "Rötuş", icon: Sparkles, desc: "Parlaklık, kontrast, netlik düzelt" },
  { id: "style", label: "Stil Uygula", icon: Wand2, desc: "Farklı bir sanat stili transfer et" },
  { id: "resize", label: "Boyutla", icon: Maximize2, desc: "Kırp, ölçekle veya yeniden boyutla" },
];

/* ═══════════════════════════════════════════════
   Tab → API tool name mapping
   ═══════════════════════════════════════════════ */

/** Map workspace tab IDs to API tool names for /api/jobs/submit */
const TAB_TO_API_TOOL: Record<string, string> = {
  // 3D
  "img-to-3d": "3d-model",
  "text-to-3d": "3d-model",
  "texture": "3d-model",
  // Image
  "bg-remove": "bg-remove",
  "enhance": "enhance",
  "text-to-image": "text-to-image",
  "image-edit": "image-edit",
  "object-removal": "object-removal",
  // Video
  "image-to-video": "video",
  "text-to-video": "video",
  "talking-avatar": "talking-avatar",
  // E-commerce
  "scene": "scene",
  "aplus": "aplus",
  "virtual-tryon": "virtual-tryon",
  // Design
  "logo": "logo",
  "qr-code": "qr-code",
};

/** Map 3D model select IDs to API tier */
const MODEL_TO_TIER: Record<string, string> = {
  "trellis-v1": "fast",
  "tripo-2.5": "fast",
  "meshy-6": "standard",
  "hunyuan3d-v3": "standard",
  "rodin": "premium",
};

/** Map 3D model select IDs to MODELS keys (src/lib/fal/models.ts).
 *  Sent as `modelKey` so the API routes to the exact model the user picked,
 *  rather than relying on tier (which collapses Meshy 6 and Hunyuan together). */
const MODEL_TO_KEY: Record<string, string> = {
  "trellis-v1": "trellis-v1",
  "tripo-2.5": "tripo-v25-mv",
  "meshy-6": "meshy-6-image",
  "hunyuan3d-v3": "hunyuan3d-v3",
  "rodin": "hyper3d-rodin",
};

/** Map video model select IDs to API tier */
const VIDEO_MODEL_TO_TIER: Record<string, string> = {
  "wan-v2.6": "fast",
  "kling-3.0": "premium",
};

/** Map video model select IDs (image-to-video tab) to MODELS keys. */
const VIDEO_MODEL_TO_KEY: Record<string, string> = {
  "wan-v2.6": "wan-i2v",
  "kling-3.0": "kling-i2v",
};

/* ═══════════════════════════════════════════════ */

/**
 * "Akıllı İyileştir" — sends the user's raw prompt to /api/prompts/enrich,
 * which uses fal.ai's any-llm endpoint to translate Turkish/casual input
 * into a polished English production prompt. On success, replaces the
 * Textarea content via `onResult`.
 */
function EnrichButton({
  tool,
  prompt,
  onResult,
  className,
}: {
  tool: string;
  prompt: string;
  onResult: (next: string) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const trimmed = prompt.trim();
  const disabled = busy || trimmed.length < 4;

  const handleClick = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch("/api/prompts/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, tool }),
      });
      if (!res.ok) {
        let msg = "İyileştirme başarısız";
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) msg = j.error;
        } catch { /* keep default */ }
        showToast(msg, "error");
        return;
      }
      const data = (await res.json()) as { enrichedPrompt?: string };
      if (data.enrichedPrompt) {
        onResult(data.enrichedPrompt);
        showToast("Prompt iyileştirildi", "success");
      } else {
        showToast("İyileştirme sonucu boş döndü", "error");
      }
    } catch {
      showToast("Bağlantı hatası", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-6 px-2 text-[10px] gap-1 border-primary/30 text-primary hover:bg-primary/10", className)}
      disabled={disabled}
      onClick={handleClick}
      title={trimmed.length < 4 ? "Önce kısa bir açıklama yaz" : "AI ile prompt'u zenginleştir"}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      Akıllı İyileştir
    </Button>
  );
}

export interface GeneratePayload {
  name: string;
  model: string;
  credits: number;
  apiTool: string;
  tier?: string;
  /** Explicit MODELS key — sent when user picks a specific model in the UI. */
  modelKey?: string;
  imageUrl?: string;
  imageUrls?: string[];
  prompt?: string;
  /** Auto-enhance input image via aura-sr before 3D generation (+4 credits) */
  autoEnhance?: boolean;
  /** Opt out of automatic background removal for 3D models (keep original background) */
  skipBgRemove?: boolean;
  /** Tool-specific API params (e.g. Recraft style/colors for logo) */
  extraParams?: Record<string, unknown>;
  /** Structured context for server-side smart prompt composition (scene/aplus/image-edit) */
  promptContext?: PromptContext;
}

interface ToolFormPanelProps {
  activeTool: string;
  onGenerate?: (payload: GeneratePayload) => void;
  /** Pre-select a specific tab on first mount (deep link from dashboard) */
  initialTab?: string;
  /** Switch the active tool group (used by code-only tool suggestions) */
  onToolChange?: (tool: string) => void;
}

export function ToolFormPanel({ activeTool, onGenerate, initialTab, onToolChange }: ToolFormPanelProps) {
  const initialTabRef = useRef(initialTab);
  const [activeTab, setActiveTab] = useState(() => {
    // If deep-linked to a specific tab, use it
    if (initialTab) {
      const allTabs = Object.values(DEFAULT_TABS).flat();
      if (allTabs.some((t) => t.id === initialTab)) return initialTab;
    }
    const tabs = DEFAULT_TABS[activeTool];
    return tabs ? tabs[0].id : "img-to-3d";
  });
  const [selectedModel, setSelectedModel] = useState("trellis-v1");
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [keepBackground, setKeepBackground] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editAction, setEditAction] = useState<string | null>(null);
  const [editColor, setEditColor] = useState("#ef4444");
  const [editColorArea, setEditColorArea] = useState("product");
  const [editBgType, setEditBgType] = useState("blur");
  const [editStyle, setEditStyle] = useState("oil");
  const [editStyleStrength, setEditStyleStrength] = useState("medium");
  const [editAspect, setEditAspect] = useState("1:1");
  const [selectedVideoModel, setSelectedVideoModel] = useState("wan-v2.6");
  const [selectedEditModel, setSelectedEditModel] = useState("flux-kontext");
  const [selectedTextModel, setSelectedTextModel] = useState("flux-2-pro");
  const [selectedSceneModel, setSelectedSceneModel] = useState("bria-product-shot");
  // Smart-prompt structured inputs — the site composes the final prompt from these
  const [sceneType, setSceneType] = useState("studio");
  const [aplusTemplate, setAplusTemplate] = useState("feature");
  const [aplusPlatform, setAplusPlatform] = useState("trendyol");
  const [aplusProductDesc, setAplusProductDesc] = useState("");
  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [promptText, setPromptText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const modelCameraInputRef = useRef<HTMLInputElement>(null);

  // Logo-specific state
  const [logoIndustry, setLogoIndustry] = useState("technology");
  const [logoStyle, setLogoStyle] = useState("minimal");
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const [logoFormat, setLogoFormat] = useState<"png" | "svg">("png");
  const [logoTransparentBg, setLogoTransparentBg] = useState(true);

  // AI image analysis (Florence-2 caption + tag-based tool suggestion)
  interface ImageAnalysis { caption: string; tags: string[]; suggestedTools: string[] }
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Virtual try-on: second image (model/person photo)
  const [modelPhotoPreview, setModelPhotoPreview] = useState<string | null>(null);
  const [modelPhotoUrl, setModelPhotoUrl] = useState<string | null>(null);
  const [modelPhotoUploading, setModelPhotoUploading] = useState(false);
  const modelPhotoInputRef = useRef<HTMLInputElement>(null);

  // Reset active tab when tool category changes
  useEffect(() => {
    // On first mount with deep-linked tab, skip reset
    if (initialTabRef.current) {
      initialTabRef.current = undefined;
      return;
    }
    const tabs = DEFAULT_TABS[activeTool];
    if (tabs) {
      setActiveTab(tabs[0].id);
    }
    // Clear preview and edit action when switching tools
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }
    setEditAction(null);
    setProjectName("");
    setUploadedFile(null);
    setUploadedImageUrl(null);
    setUploading(false);
    setPromptText("");
    // Clear logo state
    setLogoIndustry("technology");
    setLogoStyle("minimal");
    setLogoColors([]);
    setLogoFormat("png");
    setLogoTransparentBg(true);
    // Clear model photo state (virtual try-on)
    if (modelPhotoPreview) URL.revokeObjectURL(modelPhotoPreview);
    setModelPhotoPreview(null);
    setModelPhotoUrl(null);
    setModelPhotoUploading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  // Cleanup blob URL on unmount to prevent memory leak
  const previewRef = useRef(preview);
  previewRef.current = preview;
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const currentModel3D = AI_MODELS_3D.find((m) => m.id === selectedModel) ?? AI_MODELS_3D[0];
  const currentVideoModel = VIDEO_MODELS.find((m) => m.id === selectedVideoModel) ?? VIDEO_MODELS[0];
  const currentEditModel = EDIT_MODELS.find((m) => m.id === selectedEditModel) ?? EDIT_MODELS[0];
  const currentTextModel = TEXT_MODELS.find((m) => m.id === selectedTextModel) ?? TEXT_MODELS[0];
  const currentSceneModel = SCENE_MODELS.find((m) => m.id === selectedSceneModel) ?? SCENE_MODELS[0];
  const tabs = DEFAULT_TABS[activeTool];

  // Footer info based on tool + tab
  const footerInfo = (() => {
    if (activeTool === "image") {
      if (activeTab === "image-edit") return { time: currentEditModel.time, credits: currentEditModel.credits };
      if (activeTab === "text-to-image") return { time: currentTextModel.time, credits: currentTextModel.credits };
      const info = IMAGE_TOOL_INFO[activeTab];
      return info ? { time: info.time, credits: info.credits } : { time: "~10 sn", credits: 5 };
    }
    if (activeTool === "3d-model") {
      const enhanceExtra = (autoEnhance && activeTab === "img-to-3d") ? 4 : 0;
      const map: Record<string, { time: string; credits: number }> = {
        "img-to-3d": { time: currentModel3D.time, credits: currentModel3D.credits + enhanceExtra },
        "text-to-3d": { time: "~2 dk", credits: 22 },
        "texture": { time: "~1 dk", credits: 8 },
      };
      return map[activeTab] ?? { time: currentModel3D.time, credits: currentModel3D.credits + enhanceExtra };
    }
    if (activeTool === "video") {
      if (activeTab === "image-to-video") {
        return { time: currentVideoModel.time, credits: currentVideoModel.credits };
      }
      const info = VIDEO_TOOL_INFO[activeTab];
      return info ? { time: info.time, credits: info.credits } : { time: "~30 sn", credits: 20 };
    }
    if (activeTool === "ecommerce") {
      if (activeTab === "scene") return { time: currentSceneModel.time, credits: currentSceneModel.credits };
      const info = ECOMMERCE_TOOL_INFO[activeTab];
      return info ? { time: info.time, credits: info.credits } : { time: "~15 sn", credits: 8 };
    }
    if (activeTool === "design") {
      if (activeTab === "logo") {
        const isSvg = logoFormat === "svg";
        return { time: isSvg ? "~12 sn" : "~10 sn", credits: isSvg ? 10 : 8 };
      }
      const info = DESIGN_TOOL_INFO[activeTab];
      return info ? { time: info.time, credits: info.credits } : { time: "~10 sn", credits: 6 };
    }
    return { time: "—", credits: 0 };
  })();

  /** Upload a file to Supabase Storage and get a signed URL for job submission */
  const uploadToSupabase = useCallback(async (f: File): Promise<string | null> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const timestamp = Date.now();
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${timestamp}-${safeName}`;

    const { error } = await supabase.storage
      .from("uploads")
      .upload(path, f, { contentType: f.type });
    if (error) return null;

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("uploads")
      .createSignedUrl(path, 3600);
    if (signedUrlError || !signedUrlData?.signedUrl) return null;
    return signedUrlData.signedUrl;
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return;
    // Set blob preview immediately
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    // Store file for later upload + clear stale URL
    setUploadedFile(f);
    setUploadedImageUrl(null);
    setAnalysisResult(null);
    // Start background upload
    setUploading(true);
    uploadToSupabase(f).then((url) => {
      setUploadedImageUrl(url);
      setUploading(false);
      if (!url) {
        showToast("Görsel yüklenemedi, tekrar dene", "error");
        return;
      }
      // Background AI analysis — silent fail (UX should not block on this)
      setAnalyzing(true);
      fetch("/api/analyze/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      })
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as ImageAnalysis;
        })
        .then((data) => {
          if (data && data.caption) {
            setAnalysisResult(data);
            // Code-only smart default: auto-pick the best scene preset for the
            // detected product type (user can still override the dropdown).
            setSceneType(smartDefaultsFor(data.caption, data.tags ?? []).sceneType);
          }
        })
        .catch(() => { /* silent */ })
        .finally(() => setAnalyzing(false));
    }).catch(() => {
      setUploading(false);
      showToast("Görsel yüklenemedi, tekrar dene", "error");
    });
  }, [uploadToSupabase]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) handleFile(f);
          break;
        }
      }
    },
    [handleFile]
  );

  /** Upload model/person photo for virtual try-on (second image) */
  const handleModelPhoto = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return;
    setModelPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setModelPhotoUrl(null);
    setModelPhotoUploading(true);
    uploadToSupabase(f).then((url) => {
      setModelPhotoUrl(url);
      setModelPhotoUploading(false);
      if (!url) showToast("Model fotoğrafı yüklenemedi", "error");
    }).catch(() => {
      setModelPhotoUploading(false);
      showToast("Model fotoğrafı yüklenemedi", "error");
    });
  }, [uploadToSupabase]);

  const handleGenerate = () => {
    const name = projectName.trim() || "Yeni Proje";
    const apiTool = TAB_TO_API_TOOL[activeTab] ?? activeTool;

    // --- Validation ---
    const textOnlyTabs = ["text-to-3d", "text-to-image", "text-to-video", "logo", "qr-code"];
    const needsImage = !textOnlyTabs.includes(activeTab);
    const needsPrompt = ["text-to-3d", "text-to-image", "text-to-video", "object-removal"].includes(activeTab);

    if (needsImage && !uploadedImageUrl) {
      showToast("Lütfen önce bir görsel yükle", "error");
      return;
    }
    if (needsPrompt && !promptText.trim()) {
      showToast("Lütfen bir açıklama yaz", "error");
      return;
    }
    if (activeTab === "virtual-tryon" && !modelPhotoUrl) {
      showToast("Lütfen model fotoğrafı da yükle", "error");
      return;
    }
    if (activeTab === "qr-code" && !projectName.trim()) {
      showToast("Lütfen QR kodu için bir URL gir", "error");
      return;
    }
    if (activeTab === "logo" && !projectName.trim()) {
      showToast("Lütfen marka adı gir", "error");
      return;
    }
    if (activeTab === "image-edit" && !editAction) {
      showToast("Lütfen bir düzenleme aksiyonu seç", "error");
      return;
    }
    if (activeTab === "image-edit" && !promptText.trim()) {
      showToast("Lütfen düzenleme açıklaması yaz", "error");
      return;
    }
    if (uploading || modelPhotoUploading) {
      showToast("Yükleme devam ediyor, lütfen bekle", "error");
      return;
    }

    // Build base payload
    const payload: GeneratePayload = {
      name,
      model: "",
      credits: footerInfo.credits,
      apiTool,
      imageUrl: uploadedImageUrl ?? undefined,
      prompt: promptText.trim() || undefined,
    };

    // Multi-image tools: send imageUrls array instead of imageUrl
    if (activeTab === "img-to-3d" || activeTab === "texture") {
      if (uploadedImageUrl) {
        payload.imageUrls = [uploadedImageUrl];
        payload.imageUrl = undefined;
      }
    } else if (activeTab === "virtual-tryon") {
      if (modelPhotoUrl && uploadedImageUrl) {
        payload.imageUrls = [modelPhotoUrl, uploadedImageUrl];
        payload.imageUrl = undefined;
      }
    }

    // Logo: compose enriched prompt with industry, style, color, background preferences
    if (activeTab === "logo") {
      const brand = projectName.trim();
      const slogan = promptText.trim();
      const industryObj = LOGO_INDUSTRIES.find(i => i.value === logoIndustry);
      const styleObj = LOGO_STYLES.find(s => s.value === logoStyle);

      const parts = [`Logo for "${brand || "Brand"}"`];
      if (industryObj && logoIndustry !== "other") parts.push(`in the ${logoIndustry.replace("-", " & ")} industry`);
      if (slogan) parts.push(`Tagline: "${slogan}"`);
      parts.push(`${styleObj?.label ?? "Minimalist"} style, professional, clean design`);
      if (logoColors.length > 0) parts.push(`using colors: ${logoColors.join(", ")}`);
      if (logoTransparentBg) parts.push("on a transparent background");

      payload.prompt = parts.join(". ") + ".";

      // Build extraParams for Recraft V4 API-level params
      const extraParams: Record<string, unknown> = {
        style: styleObj?.recraftStyle ?? "logo",
        outputFormat: logoFormat,
      };
      if (logoColors.length > 0) {
        extraParams.colors = logoColors.map(hex => ({ rgb: hexToRgb(hex) }));
      }
      payload.extraParams = extraParams;
    }

    // QR: send URL as prompt
    if (activeTab === "qr-code") {
      const targetUrl = projectName.trim();
      payload.prompt = `QR code for ${targetUrl || "https://example.com"}. Artistic, visually appealing, scannable.`;
    }

    // image-edit: compose prompt from editAction + sub-options + user text
    if (activeTab === "image-edit" && editAction) {
      const actionLabel = EDIT_ACTIONS.find((a) => a.id === editAction)?.label ?? editAction;
      let composed = `[${actionLabel}] `;
      if (editAction === "recolor") composed += `Target color: ${editColor}, area: ${editColorArea}. `;
      if (editAction === "bg-swap") composed += `Background: ${editBgType}. `;
      if (editAction === "style") composed += `Style: ${editStyle}, strength: ${editStyleStrength}. `;
      if (editAction === "resize") composed += `Aspect: ${editAspect}. `;
      composed += promptText.trim();
      payload.prompt = composed;
    }

    if (activeTool === "image") {
      if (activeTab === "image-edit") {
        payload.model = currentEditModel.name;
        payload.credits = currentEditModel.credits;
        if (currentEditModel.modelKey) { payload.modelKey = currentEditModel.modelKey; payload.tier = currentEditModel.tier; }
      } else if (activeTab === "text-to-image") {
        payload.model = currentTextModel.name;
        payload.credits = currentTextModel.credits;
        if (currentTextModel.modelKey) { payload.modelKey = currentTextModel.modelKey; payload.tier = currentTextModel.tier; }
      } else {
        const info = IMAGE_TOOL_INFO[activeTab];
        payload.model = info?.model ?? "AI Model";
        payload.credits = info?.credits ?? 5;
      }
    } else if (activeTool === "video") {
      if (activeTab === "image-to-video") {
        payload.model = currentVideoModel.name;
        payload.credits = currentVideoModel.credits;
        payload.tier = VIDEO_MODEL_TO_TIER[selectedVideoModel];
        payload.modelKey = VIDEO_MODEL_TO_KEY[selectedVideoModel];
      } else {
        const info = VIDEO_TOOL_INFO[activeTab];
        payload.model = info?.model ?? "AI Model";
        payload.credits = info?.credits ?? 20;
      }
    } else if (activeTool === "ecommerce") {
      if (activeTab === "scene") {
        payload.model = currentSceneModel.name;
        payload.credits = currentSceneModel.credits;
        if (currentSceneModel.modelKey) { payload.modelKey = currentSceneModel.modelKey; payload.tier = currentSceneModel.tier; }
      } else {
        const info = ECOMMERCE_TOOL_INFO[activeTab];
        payload.model = info?.model ?? "AI Model";
        payload.credits = info?.credits ?? 8;
      }
    } else if (activeTool === "design") {
      if (activeTab === "logo") {
        const isSvg = logoFormat === "svg";
        payload.model = isSvg ? "Recraft V4 SVG" : "Recraft V4";
        payload.credits = isSvg ? 10 : 8;
      } else {
        const info = DESIGN_TOOL_INFO[activeTab];
        payload.model = info?.model ?? "AI Model";
        payload.credits = info?.credits ?? 6;
      }
    } else if (activeTab === "text-to-3d") {
      // text-to-3d always uses meshy-6-text (standard tier)
      payload.model = "Meshy 6";
      payload.credits = 22;
      payload.tier = "standard";
    } else {
      // 3D model (img-to-3d, texture)
      payload.model = currentModel3D.name;
      payload.credits = currentModel3D.credits;
      payload.tier = MODEL_TO_TIER[selectedModel];
      payload.modelKey = MODEL_TO_KEY[selectedModel];
      if (autoEnhance && activeTab === "img-to-3d") {
        payload.autoEnhance = true;
        payload.credits += 4;
      }
      if (keepBackground && activeTab === "img-to-3d") {
        payload.skipBgRemove = true;
      }
    }

    // Smart prompt context — the site composes the final prompt server-side from
    // these structured inputs + the auto-detected product caption + user notes.
    const caption = analysisResult?.caption?.trim() || undefined;
    if (activeTab === "scene") {
      payload.promptContext = { kind: "scene", sceneType, caption };
    } else if (activeTab === "aplus") {
      payload.promptContext = { kind: "aplus", template: aplusTemplate, platform: aplusPlatform, caption };
      payload.prompt = aplusProductDesc.trim() || undefined;
    } else if (activeTab === "image-edit") {
      payload.promptContext = { kind: "image-edit", action: editAction ?? undefined, caption };
    }

    onGenerate?.(payload);
  };

  /** One-click "Akıllı Üret": the site detects the product type, picks the best
   *  scene preset + Nano Banana Pro, and generates — details chosen by the site. */
  const handleSmartGenerate = () => {
    if (!uploadedImageUrl) {
      showToast("Lütfen önce bir ürün görseli yükle", "error");
      return;
    }
    if (uploading) {
      showToast("Yükleme devam ediyor, lütfen bekle", "error");
      return;
    }
    const caption = analysisResult?.caption ?? "";
    const smart = smartDefaultsFor(caption, analysisResult?.tags ?? []);
    const isAplus = activeTab === "aplus";
    const payload: GeneratePayload = {
      name: projectName.trim() || `Akıllı ${isAplus ? "A+" : "Sahne"}`,
      model: "Nano Banana Pro",
      credits: 18,
      apiTool: isAplus ? "aplus" : "scene",
      imageUrl: uploadedImageUrl,
      modelKey: "nano-banana-pro-edit",
      tier: "premium",
      promptContext: isAplus
        ? { kind: "aplus", template: aplusTemplate, platform: aplusPlatform, caption }
        : { kind: "scene", sceneType: smart.sceneType, caption },
      prompt: isAplus ? (aplusProductDesc.trim() || undefined) : (promptText.trim() || undefined),
    };
    onGenerate?.(payload);
  };

  /** Navigate to a code-suggested tool: same group → switch tab; else switch group
   *  (the group's reset effect lands on its default tab). */
  const goToTool = (target: { group: string; tab: string }) => {
    if (target.group === activeTool) setActiveTab(target.tab);
    else onToolChange?.(target.group);
  };

  /* ═══ "Yakında" placeholder for unimplemented tools ═══ */
  if (!tabs) {
    return (
      <div className="flex w-full md:w-[280px] flex-col bg-card/50 md:rounded-l-2xl">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Rocket className="h-8 w-8 text-primary/60" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">Yakında</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Bu araç kategorisi üzerinde çalışıyoruz. Çok yakında kullanıma açılacak!
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ═══ Image upload zone (shared between tabs that need it) ═══ */
  const renderImageUpload = (label: string, hint: string) => (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all min-h-[140px]",
          dragOver
            ? "border-primary bg-primary/5"
            : preview
              ? "border-transparent"
              : "border-border"
        )}
      >
        {preview ? (
          <div className="relative w-full h-[140px]">
            <img src={preview} alt="Yüklenen görsel" className="w-full h-full object-contain rounded-lg" />
            <button
              onClick={(e) => { e.stopPropagation(); if (preview) URL.revokeObjectURL(preview); setPreview(null); setUploadedFile(null); setUploadedImageUrl(null); setAnalysisResult(null); }}
              className="absolute top-1 right-1 rounded-full bg-background/80 p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            {/* Two action buttons: Gallery + Camera */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <FolderUp className="h-4 w-4" />
                <span className="hidden xs:inline">Galeri</span>
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer md:hidden"
              >
                <Camera className="h-4 w-4" />
                <span>Kamera</span>
              </button>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-medium text-foreground/70">{label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
            </div>
          </div>
        )}
        {/* Gallery file input (no capture — shows file picker / gallery) */}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        {/* Camera capture input (capture=environment — opens rear camera directly) */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>
      {/* AI image analysis badge — silent fail (UX should not block on this) */}
      {(analyzing || analysisResult) && preview && (
        <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
          {analyzing ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>AI görseli analiz ediyor...</span>
            </div>
          ) : analysisResult ? (
            <div className="space-y-1">
              <div className="flex items-start gap-1.5">
                <Wand2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-foreground/80 leading-tight line-clamp-2">{analysisResult.caption}</p>
              </div>
              {analysisResult.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-4">
                  {analysisResult.tags.slice(0, 5).map((t) => (
                    <span key={t} className="rounded bg-primary/10 px-1 py-0.5 text-[9px] text-primary/80">{t}</span>
                  ))}
                </div>
              )}
              {/* Code-only intelligence: detected product type + tool suggestion + one-click smart generate */}
              {(() => {
                const smart = smartDefaultsFor(analysisResult.caption, analysisResult.tags);
                const suggestion = primaryToolTarget(analysisResult.suggestedTools);
                const showSmartGen = activeTab === "scene" || activeTab === "aplus";
                const suggestionRelevant = suggestion && !(suggestion.group === activeTool && suggestion.tab === activeTab);
                return (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-4">
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary" title={smart.note}>{smart.label}</span>
                    {suggestionRelevant && (
                      <button
                        type="button"
                        onClick={() => goToTool(suggestion!)}
                        className="rounded border border-primary/30 px-1.5 py-0.5 text-[9px] text-primary hover:bg-primary/10"
                      >
                        Öneri: {suggestion!.label} →
                      </button>
                    )}
                    {showSmartGen && (
                      <button
                        type="button"
                        onClick={handleSmartGenerate}
                        className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        <Sparkles className="h-3 w-3" /> Akıllı Üret
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="flex w-full md:w-[280px] flex-col bg-card/50 md:rounded-l-2xl"
      onPaste={handlePaste}
    >
      {/* Tabs — compact mode when 4+ tabs */}
      {(() => { const compact = tabs.length > 3; return (
      <div className={cn("flex p-3 pb-2 border-b border-border/40", compact ? "gap-1" : "gap-1.5")}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setPromptText("");
                // Clear upload state on intra-tool tab switch
                if (preview) URL.revokeObjectURL(preview);
                setPreview(null);
                setUploadedFile(null);
                setUploadedImageUrl(null);
                setUploading(false);
                if (modelPhotoPreview) URL.revokeObjectURL(modelPhotoPreview);
                setModelPhotoPreview(null);
                setModelPhotoUrl(null);
                setModelPhotoUploading(false);
              }}
              className={cn(
                "flex-1 flex items-center justify-center rounded-lg font-medium cursor-pointer transition-all duration-200",
                compact ? "gap-1 px-1 py-1.5 text-[10px]" : "gap-1.5 px-2 py-2 text-[11px]",
                isActive
                  ? "bg-primary/15 text-primary shadow-sm shadow-primary/10 border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
              )}
            >
              <Icon className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      ); })()}

      {/* Form content */}
      <div className="flex flex-col gap-4 p-3 flex-1 overflow-y-auto">

        {/* ═══════════════════════════════════════
            3D MODEL TABS
           ═══════════════════════════════════════ */}

        {/* Fotoğraf → 3D */}
        {activeTab === "img-to-3d" && (
          <>
            {renderImageUpload("Ürün fotoğrafını yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            <div>
              <Label htmlFor="model-name" className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="model-name" placeholder="ör: Ürün kutusu, Vazo, Oyuncak araba" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {AI_MODELS_3D.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} — {model.credits} kr
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Gelişmiş Ayarlar</Label>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enhance" className="text-xs text-muted-foreground cursor-pointer">Otomatik İyileştirme</Label>
                  <p className="text-[10px] text-muted-foreground/50">Girdi görselini iyileştir (+4 kredi)</p>
                </div>
                <Switch id="enhance" checked={autoEnhance} onCheckedChange={setAutoEnhance} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="keep-bg" className="text-xs text-muted-foreground cursor-pointer">Arka Planı Koru</Label>
                  <p className="text-[10px] text-muted-foreground/50">Otomatik arka plan temizlemeyi atla</p>
                </div>
                <Switch id="keep-bg" checked={keepBackground} onCheckedChange={setKeepBackground} />
              </div>
            </div>
          </>
        )}

        {/* Metin → 3D */}
        {activeTab === "text-to-3d" && (
          <>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Açıklama</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Oluşturmak istediğin 3D modeli detaylı anlat...&#10;&#10;ör: Kırmızı renkli, metal yüzeyli bir oyuncak araba. Parlak boya, gerçekçi tekerlekler."
                className="mt-1.5 min-h-[140px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label htmlFor="text-model-name" className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="text-model-name" placeholder="ör: Kırmızı oyuncak araba" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                defaultValue="meshy-6"
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="meshy-6">Meshy 6 — 22 kr</option>
              </select>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Stil Ayarları</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Sanat Stili</Label>
                <select
                  defaultValue="realistic"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="realistic">Gerçekçi</option>
                  <option value="cartoon">Karikatür</option>
                  <option value="lowpoly">Düşük Poli</option>
                  <option value="sculpture">Heykel</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Negatif Prompt</Label>
                <Switch />
              </div>
            </div>
          </>
        )}

        {/* Doku Üret */}
        {activeTab === "texture" && (
          <>
            {renderImageUpload("Doku referans görseli yükle", "Tıkla, sürükle veya yapıştır • Ürün fotoğrafı veya referans")}

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Doku Açıklaması</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Nasıl bir doku istiyorsun?&#10;&#10;ör: Paslı metal yüzey, çizikler ve aşınma izleri"
                className="mt-1.5 min-h-[100px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ör: Metal doku üretimi" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════
            IMAGE TOOL TABS
           ═══════════════════════════════════════ */}

        {/* Arkaplan Kaldır */}
        {activeTab === "bg-remove" && (
          <>
            {renderImageUpload("Arkaplanı kaldırılacak görseli yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ör: Ürün arka plan temizleme" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Scissors className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">birefnet v2</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">1 kredi</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Yüksek doğrulukla arkaplan kaldırma. Ürün fotoğrafları için ideal.
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Seçenekler</Label>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Kenar Yumuşatma</Label>
                <Switch defaultChecked />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Çıktı Formatı</Label>
                <select
                  defaultValue="png"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="png">PNG (Şeffaf)</option>
                  <option value="white">Beyaz Arkaplan</option>
                  <option value="custom">Özel Renk</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* İyileştir (Enhance / Upscale) */}
        {activeTab === "enhance" && (
          <>
            {renderImageUpload("İyileştirilecek görseli yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ör: Ürün görseli iyileştirme" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <ZoomIn className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">Aura SR</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">4 kredi</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                AI destekli süper çözünürlük. Düşük kaliteli görselleri netleştir.
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Ayarlar</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Büyütme Oranı</Label>
                <select
                  defaultValue="2x"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="2x">2× (Önerilen)</option>
                  <option value="4x">4× (Yüksek Kalite)</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Gürültü Azaltma</Label>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Yüz İyileştirme</Label>
                <Switch />
              </div>
            </div>
          </>
        )}

        {/* Metin → Görsel (Text to Image) */}
        {activeTab === "text-to-image" && (
          <>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Açıklama</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Oluşturmak istediğin görseli detaylı anlat...&#10;&#10;ör: Beyaz arka planda minimalist bir parfüm şişesi, stüdyo ışığı, profesyonel ürün fotoğrafı"
                className="mt-1.5 min-h-[120px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ör: Parfüm şişesi görseli" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                value={selectedTextModel}
                onChange={(e) => setSelectedTextModel(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {TEXT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {m.credits} kr</option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Görsel Ayarları</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Stil</Label>
                <select
                  defaultValue="photo"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="photo">Fotogerçekçi</option>
                  <option value="illustration">İllüstrasyon</option>
                  <option value="digital-art">Dijital Sanat</option>
                  <option value="anime">Anime</option>
                  <option value="3d-render">3D Render</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Boyut</Label>
                <select
                  defaultValue="1:1"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="1:1">1:1 Kare (1024×1024)</option>
                  <option value="16:9">16:9 Yatay (1024×576)</option>
                  <option value="9:16">9:16 Dikey (576×1024)</option>
                  <option value="4:3">4:3 Yatay (1024×768)</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Negatif Prompt</Label>
                <Switch />
              </div>
            </div>
          </>
        )}

        {/* Görsel Düzenle — Aksiyon Kartları */}
        {activeTab === "image-edit" && (
          <>
            {renderImageUpload("Düzenlenecek görseli yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                value={selectedEditModel}
                onChange={(e) => setSelectedEditModel(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {EDIT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {m.credits} kr</option>
                ))}
              </select>
            </div>

            {/* Action cards grid */}
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 block">Ne yapmak istiyorsun?</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {EDIT_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  const isSelected = editAction === action.id;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => setEditAction(isSelected ? null : action.id)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center transition-all duration-200 cursor-pointer border",
                        isSelected
                          ? "bg-primary/15 border-primary/40 text-primary shadow-sm shadow-primary/10"
                          : "bg-background/30 border-border/30 text-muted-foreground hover:border-primary/30 hover:bg-accent/20 hover:text-foreground"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", isSelected && "drop-shadow-[0_0_4px_rgba(99,102,241,0.4)]")} />
                      <span className="text-[10px] font-medium leading-tight">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action-specific options */}
            {editAction === "recolor" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Renk Ayarları</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">Hedef Renk</Label>
                  <div className="flex gap-1.5 mt-1.5">
                    {["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#ffffff"].map((c) => (
                      <button key={c} type="button" className={cn("h-6 w-6 rounded-full border-2 hover:scale-110 transition-transform", editColor === c ? "border-primary ring-2 ring-primary/30" : "border-border/50")} style={{ backgroundColor: c }} onClick={() => setEditColor(c)} />
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Uygulama Alanı</Label>
                  <select value={editColorArea} onChange={(e) => setEditColorArea(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="product">Sadece Ürün</option>
                    <option value="background">Sadece Arkaplan</option>
                    <option value="all">Tüm Görsel</option>
                  </select>
                </div>
              </div>
            )}

            {editAction === "bg-swap" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Arkaplan Ayarları</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">Yeni Arkaplan</Label>
                  <select value={editBgType} onChange={(e) => setEditBgType(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="blur">Bulanıklaştır</option>
                    <option value="white">Beyaz</option>
                    <option value="gradient">Gradyan</option>
                    <option value="scene">Sahne Oluştur (AI)</option>
                    <option value="transparent">Şeffaf (PNG)</option>
                  </select>
                </div>
                {/* Scene prompt only when scene is selected */}
                <div>
                  <Label className="text-xs text-muted-foreground">Sahne Açıklaması</Label>
                  <Input value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="ör: Mermer masa üstü, stüdyo ışığı" className="mt-1.5 h-8 text-sm bg-background/50" />
                </div>
              </div>
            )}

            {editAction === "remove-obj" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Nesne Kaldırma</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">Neyi kaldıralım?</Label>
                  <Input value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="ör: Sağ taraftaki gölge, sol alttaki logo" className="mt-1.5 h-8 text-sm bg-background/50" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Otomatik Dolgu</Label>
                  <Switch defaultChecked />
                </div>
              </div>
            )}

            {editAction === "retouch" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Rötuş Seçenekleri</Label>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Netleştir</Label>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Parlaklık Düzelt</Label>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Renk Dengesi</Label>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Gürültü Azalt</Label>
                  <Switch />
                </div>
              </div>
            )}

            {editAction === "style" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Stil Seçenekleri</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">Sanat Stili</Label>
                  <select value={editStyle} onChange={(e) => setEditStyle(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="oil">Yağlıboya</option>
                    <option value="watercolor">Suluboya</option>
                    <option value="sketch">Karakalem</option>
                    <option value="popart">Pop Art</option>
                    <option value="anime">Anime</option>
                    <option value="pixel">Piksel Sanatı</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Etki Gücü</Label>
                  <select value={editStyleStrength} onChange={(e) => setEditStyleStrength(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="light">Hafif — Dokunuş</option>
                    <option value="medium">Orta — Dengeli</option>
                    <option value="strong">Güçlü — Tam dönüşüm</option>
                  </select>
                </div>
              </div>
            )}

            {editAction === "resize" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Boyut Ayarları</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">En Boy Oranı</Label>
                  <select value={editAspect} onChange={(e) => setEditAspect(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="1:1">1:1 Kare</option>
                    <option value="4:3">4:3 Yatay</option>
                    <option value="3:4">3:4 Dikey</option>
                    <option value="16:9">16:9 Geniş</option>
                    <option value="9:16">9:16 Hikaye</option>
                    <option value="custom">Özel Boyut</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">AI ile Genişlet</Label>
                  <Switch />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ör: Ürün görseli düzenleme" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>
          </>
        )}

        {/* Nesne Silme (Object Removal) */}
        {activeTab === "object-removal" && (
          <>
            {renderImageUpload("Nesne silinecek görseli yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Neyi silelim?</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Silinecek nesneyi tanımla...&#10;&#10;ör: Sağdaki bardak, arka plandaki logo, yerdeki gölge"
                className="mt-1.5 min-h-[80px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ör: Ürün görseli nesne temizleme" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Eraser className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">AI Object Removal</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">3 kredi</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Görseldeki istenmeyen nesneleri AI ile otomatik sil ve arka planı doldur.
              </p>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════
            VIDEO TABS
           ═══════════════════════════════════════ */}

        {/* Görsel → Video */}
        {activeTab === "image-to-video" && (
          <>
            {renderImageUpload("Video oluşturulacak görseli yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            <div>
              <Label htmlFor="video-name" className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="video-name" placeholder="ör: Ürün tanıtım videosu" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                value={selectedVideoModel}
                onChange={(e) => setSelectedVideoModel(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {VIDEO_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} — {model.credits} kr
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Video Ayarları</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Süre</Label>
                <select
                  defaultValue="5"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="3">3 saniye</option>
                  <option value="5">5 saniye (Önerilen)</option>
                  <option value="10">10 saniye</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Kamera Hareketi</Label>
                <select
                  defaultValue="orbit"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="static">Sabit</option>
                  <option value="orbit">Yörünge (Dönen)</option>
                  <option value="zoom-in">Yakınlaşma</option>
                  <option value="zoom-out">Uzaklaşma</option>
                  <option value="pan">Kaydırma</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Yüksek Çözünürlük</Label>
                <Switch defaultChecked />
              </div>
            </div>
          </>
        )}

        {/* Metin → Video */}
        {activeTab === "text-to-video" && (
          <>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Video Açıklaması</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Oluşturmak istediğin videoyu detaylı anlat...&#10;&#10;ör: Beyaz arka planda dönen bir parfüm şişesi, yumuşak stüdyo ışığı, yavaş hareket"
                className="mt-1.5 min-h-[120px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label htmlFor="t2v-name" className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="t2v-name" placeholder="ör: Parfüm tanıtım videosu" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Video className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">Kling 3.0 Pro</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">25 kredi</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Native ses desteği ile metin-video dönüşümü. Multi-shot ve 15 sn&apos;ye kadar.
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Video Ayarları</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Süre</Label>
                <select
                  defaultValue="5"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="3">3 saniye</option>
                  <option value="5">5 saniye (Önerilen)</option>
                  <option value="10">10 saniye</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">En Boy Oranı</Label>
                <select
                  defaultValue="16:9"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="16:9">16:9 Yatay (1280×720)</option>
                  <option value="9:16">9:16 Dikey — Reels/TikTok</option>
                  <option value="1:1">1:1 Kare</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Negatif Prompt</Label>
                <Switch />
              </div>
            </div>
          </>
        )}

        {/* Konuşan Avatar */}
        {activeTab === "talking-avatar" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Mic className="h-7 w-7 text-primary/60" />
            </div>
            <div className="space-y-1.5 px-4">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Konuşan Avatar</h3>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Yakında</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Metin-ses dönüşümü (TTS) pipeline&apos;ı hazırlanıyor. Fotoğraftan konuşan avatar videosu oluşturma özelliği yakında aktif olacak.
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            E-TİCARET TABS
           ═══════════════════════════════════════ */}

        {/* Sahne Oluştur */}
        {activeTab === "scene" && (
          <>
            {renderImageUpload("Ürün fotoğrafını yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            <div>
              <Label htmlFor="scene-name" className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="scene-name" placeholder="ör: Parfüm stüdyo çekimi" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                value={selectedSceneModel}
                onChange={(e) => setSelectedSceneModel(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {SCENE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {m.credits} kr</option>
                ))}
              </select>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Camera className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">{currentSceneModel.name}</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{currentSceneModel.credits} kredi</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Ürünü profesyonel stüdyo sahnelerine yerleştir. E-ticaret katalogları için ideal.
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Sahne Ayarları</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Sahne Türü</Label>
                <select
                  value={sceneType}
                  onChange={(e) => setSceneType(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="studio">Stüdyo</option>
                  <option value="lifestyle">Yaşam Tarzı</option>
                  <option value="outdoor">Dış Mekan</option>
                  <option value="minimal">Minimalist</option>
                  <option value="luxury">Lüks</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Sahne Açıklaması</Label>
                <Input value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="ör: Mermer masa, yumuşak ışık" className="mt-1.5 h-8 text-sm bg-background/50" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Gölge Ekle</Label>
                <Switch defaultChecked />
              </div>
            </div>
          </>
        )}

        {/* A+ İçerik */}
        {activeTab === "aplus" && (
          <>
            {renderImageUpload("Ana ürün görseli yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            <div>
              <Label htmlFor="aplus-name" className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="aplus-name" placeholder="ör: Ürün detay sayfası görseli" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">Bria Product Shot HD</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">8 kredi</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Amazon, Trendyol ve Hepsiburada için zengin A+ içerik görselleri.
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">A+ Ayarları</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Platform</Label>
                <select
                  value={aplusPlatform}
                  onChange={(e) => setAplusPlatform(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="trendyol">Trendyol</option>
                  <option value="hepsiburada">Hepsiburada</option>
                  <option value="amazon">Amazon</option>
                  <option value="n11">n11</option>
                  <option value="custom">Özel Boyut</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Şablon</Label>
                <select
                  value={aplusTemplate}
                  onChange={(e) => setAplusTemplate(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="feature">Özellik Vurgulama</option>
                  <option value="comparison">Karşılaştırma</option>
                  <option value="lifestyle">Yaşam Tarzı</option>
                  <option value="infographic">İnfografik</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Ürün Açıklaması</Label>
                <Input value={aplusProductDesc} onChange={(e) => setAplusProductDesc(e.target.value)} placeholder="ör: Paslanmaz çelik termos, 500ml" className="mt-1.5 h-8 text-sm bg-background/50" />
              </div>
            </div>
          </>
        )}

        {/* Sanal Deneme */}
        {activeTab === "virtual-tryon" && (
          <>
            {renderImageUpload("Kıyafet / aksesuar görseli yükle", "Tıkla, sürükle veya yapıştır • PNG, JPG, WebP")}

            {/* Second upload: Model/person photo */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Model Fotoğrafı</Label>
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all min-h-[100px]",
                  modelPhotoPreview
                    ? "border-transparent"
                    : "border-border"
                )}
              >
                {modelPhotoPreview ? (
                  <div className="relative w-full h-[100px]">
                    <img src={modelPhotoPreview} alt="Model fotoğrafı" className="w-full h-full object-contain rounded-lg" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (modelPhotoPreview) URL.revokeObjectURL(modelPhotoPreview);
                        setModelPhotoPreview(null);
                        setModelPhotoUrl(null);
                      }}
                      className="absolute top-1 right-1 rounded-full bg-background/80 p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); modelPhotoInputRef.current?.click(); }}
                        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                      >
                        <FolderUp className="h-3.5 w-3.5" />
                        <span className="hidden xs:inline">Galeri</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); modelCameraInputRef.current?.click(); }}
                        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer md:hidden"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        <span>Kamera</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Kıyafetin giydirilmesini istediğin kişi</p>
                  </div>
                )}
                <input ref={modelPhotoInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleModelPhoto(f); e.target.value = ""; }}
                />
                <input ref={modelCameraInputRef} type="file" accept="image/*" capture="user" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleModelPhoto(f); e.target.value = ""; }}
                />
              </div>
              {modelPhotoUploading && (
                <div className="flex items-center gap-1.5 text-[10px] text-primary mt-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Yükleniyor...</span>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="tryon-name" className="text-xs font-medium text-muted-foreground">Proje Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="tryon-name" placeholder="ör: Kış koleksiyonu deneme" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Shirt className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">FASHN Try-On</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">10 kredi</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Kıyafet ve aksesuarları model üzerinde sanal olarak dene. Moda e-ticaret için ideal.
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Deneme Ayarları</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Kategori</Label>
                <select
                  defaultValue="auto"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="auto">Otomatik</option>
                  <option value="upper">Üst Giyim</option>
                  <option value="lower">Alt Giyim</option>
                  <option value="full">Tam Kıyafet</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════
            TASARIM TABS
           ═══════════════════════════════════════ */}

        {/* Logo Oluştur */}
        {activeTab === "logo" && (
          <>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Marka / İşletme Adı</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ör: Renderhane" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Slogan (Opsiyonel)</Label>
              <Input value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="ör: AI ile görsel üretimi" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Sektör / Alan</Label>
              <select
                value={logoIndustry}
                onChange={(e) => setLogoIndustry(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {LOGO_INDUSTRIES.map((ind) => (
                  <option key={ind.value} value={ind.value}>{ind.label}</option>
                ))}
              </select>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Crown className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">
                  {logoFormat === "svg" ? "Recraft V4 SVG" : "Recraft V4"}
                </span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">
                  {logoFormat === "svg" ? "10" : "8"} kredi
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                AI destekli profesyonel logo tasarımı. {logoFormat === "svg" ? "Vektör SVG formatında, sonsuz ölçeklenebilir." : "Yüksek çözünürlüklü PNG formatında."}
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Logo Ayarları</Label>

              {/* Stil */}
              <div>
                <Label className="text-xs text-muted-foreground">Stil</Label>
                <select
                  value={logoStyle}
                  onChange={(e) => setLogoStyle(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  {LOGO_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Renk Paleti (max 3) */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Renk Paleti</Label>
                  <span className="text-[10px] text-muted-foreground/50">{logoColors.length}/3 seçili</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {LOGO_COLOR_PALETTE.map((c) => {
                    const isSelected = logoColors.includes(c.hex);
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.label}
                        className={`h-7 w-7 rounded-full border-2 transition-all ${isSelected ? "border-foreground scale-110 ring-2 ring-primary/30" : "border-border/50 hover:scale-110"} ${!isSelected && logoColors.length >= 3 ? "opacity-40 cursor-not-allowed" : ""}`}
                        style={{ backgroundColor: c.hex }}
                        onClick={() => {
                          if (isSelected) {
                            setLogoColors(logoColors.filter(x => x !== c.hex));
                          } else if (logoColors.length < 3) {
                            setLogoColors([...logoColors, c.hex]);
                          }
                        }}
                      />
                    );
                  })}
                </div>
                {logoColors.length > 0 && (
                  <button type="button" onClick={() => setLogoColors([])} className="text-[10px] text-muted-foreground/60 hover:text-foreground mt-1 underline">Temizle</button>
                )}
              </div>

              {/* Çıktı Formatı */}
              <div>
                <Label className="text-xs text-muted-foreground">Çıktı Formatı</Label>
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors ${logoFormat === "png" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/50 text-muted-foreground hover:border-primary/40"}`}
                    onClick={() => setLogoFormat("png")}
                  >
                    PNG (Raster)
                  </button>
                  <button
                    type="button"
                    className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors ${logoFormat === "svg" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/50 text-muted-foreground hover:border-primary/40"}`}
                    onClick={() => setLogoFormat("svg")}
                  >
                    SVG (Vektör)
                  </button>
                </div>
              </div>

              {/* Şeffaf Arkaplan */}
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Şeffaf Arkaplan</Label>
                <Switch checked={logoTransparentBg} onCheckedChange={setLogoTransparentBg} />
              </div>
            </div>
          </>
        )}

        {/* QR Kod */}
        {activeTab === "qr-code" && (
          <>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Hedef URL / Metin</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ör: https://renderhane.com" className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <QrCode className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">AI Sanatsal QR</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">6 kredi</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                AI ile sanatsal QR kod oluştur. Taranabilirliği koruyarak estetik tasarım.
              </p>
            </div>

            {renderImageUpload("Stil görseli yükle (opsiyonel)", "QR kod'un stilini belirleyecek referans görsel")}

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">QR Ayarları</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Stil Açıklaması</Label>
                <Input placeholder="ör: Çiçek desenleri, doğa temalı" className="mt-1.5 h-8 text-sm bg-background/50" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Hata Düzeltme</Label>
                <select
                  defaultValue="H"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="L">Düşük (%7)</option>
                  <option value="M">Orta (%15)</option>
                  <option value="Q">Yüksek (%25)</option>
                  <option value="H">En Yüksek (%30) — Önerilen</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Logo Ortada</Label>
                <Switch />
              </div>
            </div>
          </>
        )}

        {/* Batch processing removed — will be added when backend is ready */}



        {/* Spacer */}
        <div className="flex-1" />
      </div>

      {/* Footer: Time + Credits + Submit */}
      <div className="border-t border-border p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{footerInfo.time}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-foreground">{footerInfo.credits} kredi</span>
          </div>
        </div>

        {uploading && (
          <div className="flex items-center gap-1.5 text-[10px] text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Görsel yükleniyor...</span>
          </div>
        )}

        <Button
          className="w-full h-9 font-semibold"
          size="sm"
          onClick={handleGenerate}
          disabled={uploading || modelPhotoUploading || activeTab === "talking-avatar" || activeTab.startsWith("batch-")}
        >
          {uploading || modelPhotoUploading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          {activeTool === "image" ? "İşle" : activeTool === "video" ? "Video Üret" : activeTool === "ecommerce" ? "Oluştur" : activeTool === "design" ? "Tasarla" : activeTool === "batch" ? "Toplu İşle" : "Üret"}
        </Button>
      </div>
    </div>
  );
}
