"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
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
  Video,
  Film,
  User,
  Mic,
  Camera,
  Shirt,
  LayoutGrid,
  QrCode,
  Crown,
  FolderUp,
} from "lucide-react";
import { showToast } from "./workspace-toast";
import type { PromptContext } from "@/lib/prompts/presets";
import { smartDefaultsFor, primaryToolTarget } from "@/lib/analysis/product-intel";
import { parseSRT, estimateSrtCredits } from "@/lib/voiceover/srt";
import { MAX_AVATAR_SCRIPT_CHARS, type ModelTier, type ToolType } from "@/lib/fal/models";
import { getSelectionImageInputLimits, type ImageInputLimits } from "@/lib/media/image-input-contract";
import {
  checkImageFacts,
  issueMessage,
  limitsSummary,
  pickText,
  unverifiedLimitsNote,
  type ImageFacts,
  type ImageInputIssue,
  type ImagePosition,
} from "@/lib/media/image-limit-check";
import { describeTransform } from "@/lib/media/optimize-image";
import { useLocale } from "next-intl";
import { useImagePreparation } from "@/hooks/use-image-preparation";
import { ImagePrepareDialog } from "@/components/media/image-prepare-dialog";
import { ImageInputErrorDialog } from "@/components/media/image-input-error-dialog";
import {
  SRT_VOICES,
  SRT_EMOTIONS,
  SRT_ENGINES,
  SRT_MODES,
  XAI_VOICES,
  DEFAULT_SRT_VOICE,
  DEFAULT_XAI_VOICE,
  DEFAULT_SRT_EMOTION,
  DEFAULT_SRT_SPEED,
  MAX_SYNC_CHARS,
  MAX_SYNC_CUES,
} from "@/lib/voiceover/voices";
import { SrtVoiceoverResult, type SrtVoiceoverTrack } from "./srt-voiceover-result";
import { useLocaleText, type LocaleText } from "@/hooks/use-locale-text";

/* ═══════════════════════════════════════════════
   AI Model & Tab configs
   ═══════════════════════════════════════════════ */

/** "~12 sn" / "~2 dk" style estimates, shown as "~12 s" / "~2 min" in English. */
function timeLabel(l: LocaleText, time: string): string {
  return l(time, time.replace(/ sn$/, " s").replace(/ dk$/, " min"));
}

const AI_MODELS_3D = [
  { id: "trellis-v1", name: "TRELLIS v1", credits: 5, time: "~15 sn", tier: "fast" },
  { id: "tripo-2.5", name: "Tripo 2.5", credits: 30, time: "~30 sn", tier: "fast" },
  { id: "meshy-6", name: "Meshy 6", credits: 55, time: "~2 dk", tier: "standard" },
  { id: "meshy-v7", name: "Meshy 7 — Premium", credits: 80, time: "~3 dk", tier: "premium" },
  { id: "meshy-v71", name: "Meshy 7.1 — Premium", credits: 80, time: "~3 dk", tier: "premium" },
  { id: "hunyuan3d-v3", name: "Hunyuan3D V3", credits: 28, time: "~3 dk", tier: "standard" },
  { id: "rodin", name: "Rodin Premium", credits: 35, time: "~2 dk", tier: "premium" },
];

const IMAGE_TOOL_INFO: Record<string, { model: string; credits: number; time: string }> = {
  "bg-remove": { model: "Bria RMBG", credits: 1, time: "~5 sn" },
  "enhance": { model: "Recraft Crisp", credits: 3, time: "~10 sn" },
  "text-to-image": { model: "FLUX 2 Pro", credits: 4, time: "~8 sn" },
  "image-edit": { model: "FLUX Kontext", credits: 6, time: "~10 sn" },
  "object-removal": { model: "Object Removal", credits: 3, time: "~5 sn" },
};

/* Model pickers — default option keeps today's behavior (no modelKey sent);
   Nano Banana Pro routes explicitly via modelKey to the premium fal.ai model. */
interface PickerModel { id: string; name: string; nameEn?: string; credits: number; time: string; modelKey?: string; tier?: string; }

const EDIT_MODELS: PickerModel[] = [
  { id: "flux-kontext", name: "FLUX Kontext", credits: 6, time: "~10 sn" },
  { id: "nano-banana-pro-edit", name: "Nano Banana Pro — En Kaliteli", nameEn: "Nano Banana Pro — Best Quality", credits: 18, time: "~20 sn", modelKey: "nano-banana-pro-edit", tier: "premium" },
];

const TEXT_MODELS: PickerModel[] = [
  { id: "flux-2-pro", name: "FLUX 2 Pro", credits: 4, time: "~8 sn", modelKey: "flux-pro", tier: "standard" },
  { id: "qwen-image-3", name: "Qwen Image 3 — Tipografi", nameEn: "Qwen Image 3 — Typography", credits: 5, time: "~12 sn", modelKey: "qwen-image-3", tier: "standard" },
  { id: "gpt-image-25-flare", name: "GPT-Image 2.5 — En İyi Yazı", nameEn: "GPT-Image 2.5 — Best Text", credits: 8, time: "~15 sn", modelKey: "gpt-image-25-flare", tier: "premium" },
  { id: "nano-banana-pro", name: "Nano Banana Pro — En Kaliteli", nameEn: "Nano Banana Pro — Best Quality", credits: 18, time: "~12 sn", modelKey: "nano-banana-pro", tier: "premium" },
];

const SCENE_MODELS: PickerModel[] = [
  { id: "bria-product-shot", name: "Bria Product Shot", credits: 8, time: "~15 sn" },
  { id: "nano-banana-pro-edit", name: "Nano Banana Pro — En Kaliteli", nameEn: "Nano Banana Pro — Best Quality", credits: 18, time: "~20 sn", modelKey: "nano-banana-pro-edit", tier: "premium" },
];

const VIDEO_MODELS = [
  { id: "wan-v2.6", name: "Wan 2.7", credits: 35, time: "~2 dk", tier: "fast" },
  { id: "wan-3", name: "Wan 3.0 — Sesli", nameEn: "Wan 3.0 — With Audio", credits: 40, time: "~2 dk", tier: "premium" },
  { id: "kling-o3", name: "Kling O3 Pro", credits: 40, time: "~2 dk", tier: "premium" },
];

const AVATAR_MODELS: PickerModel[] = [
  { id: "omnihuman", name: "OmniHuman v1.5", credits: 100, time: "~2 dk", modelKey: "omnihuman", tier: "standard" },
  { id: "kling-avatar-v2-std", name: "Kling Avatar v2 — Ekonomik", nameEn: "Kling Avatar v2 — Economy", credits: 35, time: "~2 dk", modelKey: "kling-avatar-v2-std", tier: "standard" },
  { id: "kling-avatar-v2-pro", name: "Kling Avatar v2 Pro", credits: 75, time: "~2 dk", modelKey: "kling-avatar-v2-pro", tier: "standard" },
  { id: "sync-lipsync-v3", name: "Sync v3 Lip-Sync", credits: 85, time: "~2 dk", modelKey: "sync-lipsync-v3", tier: "standard" },
];

const VIDEO_TOOL_INFO: Record<string, { model: string; credits: number; time: string }> = {
  "image-to-video": { model: "Wan 2.7", credits: 35, time: "~2 dk" },
  "text-to-video": { model: "Kling O3 Pro", credits: 40, time: "~2 dk" },
  "talking-avatar": { model: "OmniHuman v1.5", credits: 100, time: "~2 dk" },
  "srt-voiceover": { model: "MiniMax 2.8", credits: 4, time: "~1 dk" },
};

const TABS_VIDEO = [
  { id: "image-to-video", label: "Görsel", labelEn: "Image", icon: Film },
  { id: "text-to-video", label: "Metin", labelEn: "Text", icon: Type },
  { id: "talking-avatar", label: "Avatar", labelEn: "Avatar", icon: User },
  { id: "srt-voiceover", label: "Seslendir", labelEn: "Voiceover", icon: Mic },
];

const ECOMMERCE_TOOL_INFO: Record<string, { model: string; credits: number; time: string }> = {
  "scene": { model: "Bria Product Shot", credits: 8, time: "~15 sn" },
  "aplus": { model: "Bria Product Shot HD", credits: 8, time: "~20 sn" },
  "virtual-tryon": { model: "FASHN v1.6", credits: 10, time: "~15 sn" },
};

const TABS_ECOMMERCE = [
  { id: "scene", label: "Sahne", labelEn: "Scene", icon: Camera },
  { id: "aplus", label: "A+", labelEn: "A+", icon: LayoutGrid },
  { id: "virtual-tryon", label: "Deneme", labelEn: "Try-On", icon: Shirt },
];

const DESIGN_TOOL_INFO: Record<string, { model: string; credits: number; time: string }> = {
  "logo": { model: "Recraft V4", credits: 8, time: "~10 sn" },
  "qr-code": { model: "AI Sanatsal QR", credits: 6, time: "~10 sn" },
};

const TABS_DESIGN = [
  { id: "logo", label: "Logo", labelEn: "Logo", icon: Crown },
  { id: "qr-code", label: "QR Kod", labelEn: "QR Code", icon: QrCode },
];

/* ── Logo tool structured input options ─────────────────── */
const LOGO_INDUSTRIES = [
  { value: "technology", label: "Teknoloji", labelEn: "Technology" },
  { value: "food-beverage", label: "Gıda & İçecek", labelEn: "Food & Beverage" },
  { value: "fashion", label: "Moda & Giyim", labelEn: "Fashion & Apparel" },
  { value: "healthcare", label: "Sağlık & Medikal", labelEn: "Healthcare & Medical" },
  { value: "finance", label: "Finans & Bankacılık", labelEn: "Finance & Banking" },
  { value: "education", label: "Eğitim", labelEn: "Education" },
  { value: "real-estate", label: "Gayrimenkul", labelEn: "Real Estate" },
  { value: "sports", label: "Spor & Fitness", labelEn: "Sports & Fitness" },
  { value: "travel", label: "Seyahat & Turizm", labelEn: "Travel & Tourism" },
  { value: "entertainment", label: "Eğlence & Medya", labelEn: "Entertainment & Media" },
  { value: "beauty", label: "Güzellik & Bakım", labelEn: "Beauty & Care" },
  { value: "automotive", label: "Otomotiv", labelEn: "Automotive" },
  { value: "agriculture", label: "Tarım & Gıda Üretimi", labelEn: "Agriculture & Food Production" },
  { value: "construction", label: "İnşaat & Mimarlık", labelEn: "Construction & Architecture" },
  { value: "other", label: "Diğer", labelEn: "Other" },
];

const LOGO_STYLES = [
  { value: "minimal", label: "Minimalist", labelEn: "Minimalist", recraftStyle: "logo" as const },
  { value: "modern", label: "Modern", labelEn: "Modern", recraftStyle: "logo" as const },
  { value: "vintage", label: "Vintage", labelEn: "Vintage", recraftStyle: "digital_illustration" as const },
  { value: "playful", label: "Eğlenceli", labelEn: "Playful", recraftStyle: "digital_illustration" as const },
  { value: "corporate", label: "Kurumsal", labelEn: "Corporate", recraftStyle: "logo" as const },
  { value: "luxury", label: "Lüks & Premium", labelEn: "Luxury & Premium", recraftStyle: "logo" as const },
  { value: "handwritten", label: "El Yazısı", labelEn: "Handwritten", recraftStyle: "digital_illustration" as const },
  { value: "geometric", label: "Geometrik", labelEn: "Geometric", recraftStyle: "logo" as const },
];

const LOGO_COLOR_PALETTE = [
  { hex: "#4f46e5", label: "İndigo", labelEn: "Indigo" },
  { hex: "#ef4444", label: "Kırmızı", labelEn: "Red" },
  { hex: "#22c55e", label: "Yeşil", labelEn: "Green" },
  { hex: "#f97316", label: "Turuncu", labelEn: "Orange" },
  { hex: "#8b5cf6", label: "Mor", labelEn: "Purple" },
  { hex: "#ec4899", label: "Pembe", labelEn: "Pink" },
  { hex: "#0ea5e9", label: "Mavi", labelEn: "Blue" },
  { hex: "#1a1a2e", label: "Koyu", labelEn: "Dark" },
  { hex: "#f59e0b", label: "Altın", labelEn: "Gold" },
  { hex: "#14b8a6", label: "Teal", labelEn: "Teal" },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

const TABS_3D = [
  { id: "img-to-3d", label: "Fotoğraf", labelEn: "Photo", icon: ImageIcon },
  { id: "text-to-3d", label: "Metin", labelEn: "Text", icon: Type },
  { id: "texture", label: "Doku", labelEn: "Texture", icon: Wand2 },
];

const TABS_IMAGE = [
  { id: "bg-remove", label: "Arkaplan", labelEn: "Background", icon: Scissors },
  { id: "enhance", label: "İyileştir", labelEn: "Enhance", icon: ZoomIn },
  { id: "text-to-image", label: "Oluştur", labelEn: "Create", icon: PenLine },
  { id: "image-edit", label: "Düzenle", labelEn: "Edit", icon: Brush },
  { id: "object-removal", label: "Nesne Sil", labelEn: "Remove Object", icon: Eraser },
];

const DEFAULT_TABS: Record<string, typeof TABS_3D> = {
  "3d-model": TABS_3D,
  "image": TABS_IMAGE,
  "video": TABS_VIDEO,
  "ecommerce": TABS_ECOMMERCE,
  "design": TABS_DESIGN,
};

const EDIT_ACTIONS = [
  { id: "recolor", label: "Renk Değiştir", labelEn: "Recolor", icon: Palette, desc: "Ürün veya arkaplan rengini değiştir", descEn: "Change the product or background color" },
  { id: "bg-swap", label: "Arkaplan Değiştir", labelEn: "Change Background", icon: ImageIcon, desc: "Arkaplanı kaldır, değiştir veya bulanıklaştır", descEn: "Remove, replace or blur the background" },
  { id: "remove-obj", label: "Nesne Kaldır", labelEn: "Remove Object", icon: Eraser, desc: "İstenmeyen nesneleri otomatik sil", descEn: "Automatically remove unwanted objects" },
  { id: "retouch", label: "Rötuş", labelEn: "Retouch", icon: Sparkles, desc: "Parlaklık, kontrast, netlik düzelt", descEn: "Fix brightness, contrast and sharpness" },
  { id: "style", label: "Stil Uygula", labelEn: "Apply Style", icon: Wand2, desc: "Farklı bir sanat stili transfer et", descEn: "Transfer a different art style" },
  { id: "resize", label: "Boyutla", labelEn: "Resize", icon: Maximize2, desc: "Kırp, ölçekle veya yeniden boyutla", descEn: "Crop, scale or resize" },
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
  "srt-voiceover": "srt-voiceover",
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
  "meshy-v7": "premium",
  "meshy-v71": "premium",
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
  "meshy-v7": "meshy-v7",
  "meshy-v71": "meshy-v71",
  "hunyuan3d-v3": "hunyuan3d-v3",
  "rodin": "hyper3d-rodin",
};

/** Map video model select IDs to API tier */
const VIDEO_MODEL_TO_TIER: Record<string, string> = {
  "wan-v2.6": "fast",
  "wan-3": "premium",
  "kling-o3": "premium",
};

/** Map video model select IDs (image-to-video tab) to MODELS keys. */
const VIDEO_MODEL_TO_KEY: Record<string, string> = {
  "wan-v2.6": "wan-i2v",
  "wan-3": "wan-3",
  "kling-o3": "kling-o3-i2v",
};

const TEXT_ONLY_TABS = ["text-to-3d", "text-to-image", "text-to-video", "logo", "qr-code", "srt-voiceover"];

/**
 * The tool and model a submit from this tab sends an image to, so an upload
 * is prepared for the model that actually receives it. Mirrors the tier and
 * modelKey choices in handleGenerate and handleAvatarGenerate; keep the two
 * in step. Null for tabs without an image input.
 */
function imageSelectionForTab(state: {
  activeTool: string;
  activeTab: string;
  selectedModel: string;
  selectedVideoModel: string;
  editModel: PickerModel;
  sceneModel: PickerModel;
  avatarModel: PickerModel;
}): { tool: ToolType; tier?: ModelTier; modelKey?: string } | null {
  const { activeTab } = state;
  if (TEXT_ONLY_TABS.includes(activeTab)) return null;
  const tool = (TAB_TO_API_TOOL[activeTab] ?? state.activeTool) as ToolType;
  const picked = (model: PickerModel) =>
    model.modelKey ? { tool, tier: model.tier as ModelTier, modelKey: model.modelKey } : { tool };
  if (activeTab === "talking-avatar") return { tool: "talking-avatar", modelKey: state.avatarModel.modelKey };
  if (activeTab === "image-to-video") {
    return {
      tool,
      tier: VIDEO_MODEL_TO_TIER[state.selectedVideoModel] as ModelTier | undefined,
      modelKey: VIDEO_MODEL_TO_KEY[state.selectedVideoModel],
    };
  }
  if (activeTab === "image-edit") return picked(state.editModel);
  if (activeTab === "scene") return picked(state.sceneModel);
  if (activeTab === "img-to-3d" || activeTab === "texture") {
    return {
      tool,
      tier: MODEL_TO_TIER[state.selectedModel] as ModelTier | undefined,
      modelKey: MODEL_TO_KEY[state.selectedModel],
    };
  }
  return { tool };
}

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
  const l = useLocaleText();
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
        let msg = l("İyileştirme başarısız", "Enhancement failed");
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
        showToast(l("Prompt iyileştirildi", "Prompt enhanced"), "success");
      } else {
        showToast(l("İyileştirme sonucu boş döndü", "Enhancement returned an empty result"), "error");
      }
    } catch {
      showToast(l("Bağlantı hatası", "Connection error"), "error");
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
      title={trimmed.length < 4 ? l("Önce kısa bir açıklama yaz", "Write a short description first") : l("AI ile prompt'u zenginleştir", "Enrich the prompt with AI")}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {l("Akıllı İyileştir", "Smart Enhance")}
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
  /** Keep the selected tab in sync with the URL. */
  onTabChange?: (tab: string) => void;
  /** A submission is in flight: generate buttons stay disabled so a second click cannot charge twice. */
  submitting?: boolean;
}

export function ToolFormPanel({ activeTool, onGenerate, initialTab, onToolChange, onTabChange, submitting = false }: ToolFormPanelProps) {
  const l = useLocaleText();
  const uiLocale = useLocale();
  const [activeTab, setActiveTab] = useState(() => {
    const tabs = DEFAULT_TABS[activeTool];
    if (initialTab && tabs?.some((tab) => tab.id === initialTab)) return initialTab;
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
  const [selectedAvatarModel, setSelectedAvatarModel] = useState("omnihuman");
  const [avatarScript, setAvatarScript] = useState("");
  const [avatarVoice, setAvatarVoice] = useState(DEFAULT_SRT_VOICE);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [selectedEditModel, setSelectedEditModel] = useState("flux-kontext");
  const [selectedTextModel, setSelectedTextModel] = useState("flux-2-pro");
  const [selectedSceneModel, setSelectedSceneModel] = useState("bria-product-shot");
  // Smart-prompt structured inputs — the site composes the final prompt from these
  const [sceneType, setSceneType] = useState("studio");
  const [aplusTemplate, setAplusTemplate] = useState("feature");
  const [aplusPlatform, setAplusPlatform] = useState("trendyol");
  const [aplusProductDesc, setAplusProductDesc] = useState("");
  // Upload state
  const [, setUploadedFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [promptText, setPromptText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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

  // Image preparation against the selected model's contract. The original
  // file is kept so a model change or retry starts from it, and every upload
  // carries a sequence number so a late response cannot overwrite a newer one.
  const imagePrep = useImagePreparation();
  const modelPhotoPrep = useImagePreparation();
  const { prepare: prepareImage, showIssues: showImageIssues } = imagePrep;
  const { prepare: prepareModelPhoto } = modelPhotoPrep;
  const [imageFieldError, setImageFieldError] = useState<string | null>(null);
  const [modelPhotoFieldError, setModelPhotoFieldError] = useState<string | null>(null);
  const [preparedNote, setPreparedNote] = useState<string | null>(null);
  const originalFileRef = useRef<File | null>(null);
  const uploadedFactsRef = useRef<ImageFacts | null>(null);
  const uploadSeqRef = useRef(0);
  const modelPhotoSeqRef = useRef(0);

  // SRT voiceover (dedicated sync endpoint — generic job akışını kullanmaz)
  const [srtText, setSrtText] = useState("");
  const [srtFileName, setSrtFileName] = useState<string | null>(null);
  const [srtVoice, setSrtVoice] = useState(DEFAULT_SRT_VOICE);
  const [srtXaiVoice, setSrtXaiVoice] = useState(DEFAULT_XAI_VOICE);
  const [srtEngine, setSrtEngine] = useState<"minimax" | "xai">("minimax");
  const [srtMode, setSrtMode] = useState<"single" | "cues">("single");
  const [srtEmotion, setSrtEmotion] = useState<string>(DEFAULT_SRT_EMOTION);
  const [srtSpeed, setSrtSpeed] = useState(DEFAULT_SRT_SPEED);
  const [srtAutoFit, setSrtAutoFit] = useState(true);
  const [srtBusy, setSrtBusy] = useState(false);
  const [srtResult, setSrtResult] = useState<{
    jobId: string;
    creditCost: number;
    tracks: SrtVoiceoverTrack[];
    totalMs: number;
    overflowCount: number;
    refitCount: number;
    mode: "single" | "cues";
    audioUrl: string;
    audioDurationMs: number;
    fitPasses: number;
  } | null>(null);
  const srtFileInputRef = useRef<HTMLInputElement>(null);

  // The URL/parent state is authoritative for external navigation. Keep this
  // one-way so a stale local tab cannot immediately overwrite browser history.
  useEffect(() => {
    const tabs = DEFAULT_TABS[activeTool] ?? [];
    const nextTab = initialTab && tabs.some((tab) => tab.id === initialTab)
      ? initialTab
      : tabs[0]?.id;

    if (nextTab) {
      setActiveTab((current) => current === nextTab ? current : nextTab);
    }
  }, [initialTab, activeTool]);

  const selectTab = useCallback((tab: string) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  }, [onTabChange]);

  // Reset form state when tool category changes.
  useEffect(() => {
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
    // Clear image preparation state; pending work for the old tool is dropped.
    imagePrep.cancel();
    modelPhotoPrep.cancel();
    originalFileRef.current = null;
    uploadedFactsRef.current = null;
    uploadSeqRef.current += 1;
    modelPhotoSeqRef.current += 1;
    setImageFieldError(null);
    setModelPhotoFieldError(null);
    setPreparedNote(null);
    // Clear SRT voiceover state
    setSrtText("");
    setSrtFileName(null);
    setSrtResult(null);
    setSrtBusy(false);
    setSrtAutoFit(true);
    // Clear talking-avatar state
    setAvatarScript("");
    setAvatarBusy(false);
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
  const currentAvatarModel = AVATAR_MODELS.find((m) => m.id === selectedAvatarModel) ?? AVATAR_MODELS[0];
  const currentEditModel = EDIT_MODELS.find((m) => m.id === selectedEditModel) ?? EDIT_MODELS[0];
  const currentTextModel = TEXT_MODELS.find((m) => m.id === selectedTextModel) ?? TEXT_MODELS[0];
  const currentSceneModel = SCENE_MODELS.find((m) => m.id === selectedSceneModel) ?? SCENE_MODELS[0];
  const tabs = DEFAULT_TABS[activeTool];

  const imageLimits = useMemo((): ImageInputLimits | null => {
    const selection = imageSelectionForTab({
      activeTool,
      activeTab,
      selectedModel,
      selectedVideoModel,
      editModel: currentEditModel,
      sceneModel: currentSceneModel,
      avatarModel: currentAvatarModel,
    });
    if (!selection) return null;
    try {
      const limits = getSelectionImageInputLimits({ ...selection, imageCount: activeTab === "virtual-tryon" ? 2 : 1 });
      return limits.inputKind === "image" ? limits : null;
    } catch {
      return null; // the server still checks every image
    }
  }, [activeTool, activeTab, selectedModel, selectedVideoModel, currentEditModel, currentSceneModel, currentAvatarModel]);
  const imageLimitsNote = imageLimits ? unverifiedLimitsNote(imageLimits, uiLocale) : null;
  /** The try-on request sends [model photo, garment]; other tabs send one image. */
  const garmentPosition = useMemo<ImagePosition | null>(
    () => (activeTab === "virtual-tryon" ? { index: 1, count: 2 } : null),
    [activeTab]
  );

  // SRT önizleme — istemcide parse edilir, ücretlendirme öncesi gösterilir
  const srtPreview = useMemo(() => {
    if (activeTab !== "srt-voiceover" || !srtText.trim()) return null;
    try {
      const cues = parseSRT(srtText);
      const chars = cues.reduce((sum, c) => sum + c.text.length, 0);
      return {
        cues: cues.length,
        chars,
        credits: estimateSrtCredits(chars, srtEngine),
        overCap: cues.length > MAX_SYNC_CUES || chars > MAX_SYNC_CHARS,
        error: null as string | null,
      };
    } catch (error) {
      return {
        cues: 0,
        chars: 0,
        credits: 0,
        overCap: false,
        error: error instanceof Error ? error.message : l("Geçersiz SRT", "Invalid SRT"),
      };
    }
  }, [activeTab, srtText, srtEngine, l]);

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
        // text-to-3d her zaman meshy-6-text (55kr) — backend rezervasyonu bu.
        "text-to-3d": { time: "~2 dk", credits: 55 },
        "texture": { time: currentModel3D.time, credits: currentModel3D.credits + enhanceExtra },
      };
      return map[activeTab] ?? { time: currentModel3D.time, credits: currentModel3D.credits + enhanceExtra };
    }
    if (activeTool === "video") {
      if (activeTab === "image-to-video") {
        return { time: currentVideoModel.time, credits: currentVideoModel.credits };
      }
      if (activeTab === "talking-avatar") {
        return { time: currentAvatarModel.time, credits: currentAvatarModel.credits };
      }
      if (activeTab === "srt-voiceover") {
        return { time: "~1 dk", credits: srtPreview?.credits ?? 4 };
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

  /** Preview, upload and analyze the file that will actually be sent. */
  const startUpload = useCallback((f: File) => {
    const seq = ++uploadSeqRef.current;
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
      // A newer file or model choice replaced this upload while it ran.
      if (seq !== uploadSeqRef.current) return;
      setUploadedImageUrl(url);
      setUploading(false);
      if (!url) {
        showToast(l("Görsel yüklenemedi, tekrar dene", "Image upload failed, please try again"), "error");
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
          if (seq !== uploadSeqRef.current) return;
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
      if (seq !== uploadSeqRef.current) return;
      setUploading(false);
      showToast(l("Görsel yüklenemedi, tekrar dene", "Image upload failed, please try again"), "error");
    });
  }, [uploadToSupabase, l]);

  /**
   * Prepare the user's original for the selected model, then upload what
   * fits. A rejected or declined file leaves the previous image in place.
   */
  const prepareAndUpload = useCallback(async (original: File, limits: ImageInputLimits | null) => {
    setImageFieldError(null);
    setPreparedNote(null);
    if (!limits) {
      originalFileRef.current = original;
      uploadedFactsRef.current = null;
      startUpload(original);
      return;
    }
    const result = await prepareImage(original, limits, garmentPosition);
    if (result.kind === "ready") {
      originalFileRef.current = original;
      uploadedFactsRef.current = result.prepared.facts;
      const { transform, advisories } = result.prepared;
      const note = [
        transform ? l(`Görsel bu model için hazırlandı: ${describeTransform(transform, "tr")}.`, `Image prepared for this model: ${describeTransform(transform, "en")}.`) : null,
        ...advisories.map((advisory) => pickText(advisory, uiLocale)),
      ]
        .filter(Boolean)
        .join(" ");
      setPreparedNote(note || null);
      startUpload(result.prepared.file);
    } else if (result.kind === "rejected") {
      setImageFieldError(result.issues[0] ? issueMessage(result.issues[0], uiLocale) : l("Görsel bu model için uygun değil.", "This image is not suitable for this model."));
    } else if (result.kind === "declined") {
      setImageFieldError(l("Hazırlanan görsel kullanılmadı; yeni görsel yüklenmedi. Başka bir görsel seçebilirsiniz.", "The prepared image was not used; no new image was uploaded. You can choose another image."));
    }
  }, [prepareImage, garmentPosition, startUpload, l, uiLocale]);

  const handleFile = useCallback((f: File) => {
    // Some pickers report HEIC/AVIF with an empty type; the bytes decide.
    if (f.type ? !f.type.startsWith("image/") : !imageLimits) return;
    void prepareAndUpload(f, imageLimits);
  }, [prepareAndUpload, imageLimits]);

  // A different model can accept different files. Keep the current upload if
  // it still fits; otherwise prepare again from the user's original.
  useEffect(() => {
    const original = originalFileRef.current;
    if (!original || !imageLimits) return;
    const facts = uploadedFactsRef.current;
    if (facts && checkImageFacts(facts, imageLimits, garmentPosition).length === 0) return;
    void prepareAndUpload(original, imageLimits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageLimits]);

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
  const startModelPhotoUpload = useCallback((f: File) => {
    const seq = ++modelPhotoSeqRef.current;
    setModelPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setModelPhotoUrl(null);
    setModelPhotoUploading(true);
    uploadToSupabase(f).then((url) => {
      if (seq !== modelPhotoSeqRef.current) return;
      setModelPhotoUrl(url);
      setModelPhotoUploading(false);
      if (!url) showToast(l("Model fotoğrafı yüklenemedi", "Model photo upload failed"), "error");
    }).catch(() => {
      if (seq !== modelPhotoSeqRef.current) return;
      setModelPhotoUploading(false);
      showToast(l("Model fotoğrafı yüklenemedi", "Model photo upload failed"), "error");
    });
  }, [uploadToSupabase, l]);

  const handleModelPhoto = useCallback((f: File) => {
    if (f.type ? !f.type.startsWith("image/") : !imageLimits) return;
    setModelPhotoFieldError(null);
    if (!imageLimits) {
      startModelPhotoUpload(f);
      return;
    }
    // The try-on request sends [model photo, garment]: this is image 1 of 2.
    void prepareModelPhoto(f, imageLimits, { index: 0, count: 2 }).then((result) => {
      if (result.kind === "ready") startModelPhotoUpload(result.prepared.file);
      else if (result.kind === "rejected") setModelPhotoFieldError(result.issues[0] ? issueMessage(result.issues[0], uiLocale) : l("Fotoğraf bu model için uygun değil.", "This photo is not suitable for this model."));
      else if (result.kind === "declined") setModelPhotoFieldError(l("Hazırlanan fotoğraf kullanılmadı; yeni fotoğraf yüklenmedi.", "The prepared photo was not used; no new photo was uploaded."));
    });
  }, [imageLimits, prepareModelPhoto, startModelPhotoUpload, l, uiLocale]);

  // A server-side rejection (422) is shown like a local one: modal plus a
  // message under the right field. Nothing was charged; inputs stay.
  const showServerImageIssues = useCallback((issues: ImageInputIssue[]) => {
    if (issues.length === 0) return;
    showImageIssues(issues);
    if (activeTab === "virtual-tryon") {
      const forModelPhoto = issues.find((issue) => issue.index === 0);
      const forGarment = issues.find((issue) => issue.index !== 0);
      setModelPhotoFieldError(forModelPhoto ? issueMessage(forModelPhoto, uiLocale) : null);
      setImageFieldError(forGarment ? issueMessage(forGarment, uiLocale) : null);
    } else {
      setImageFieldError(issueMessage(issues[0], uiLocale));
    }
  }, [activeTab, showImageIssues, uiLocale]);

  useEffect(() => {
    const onImageInputError = (event: Event) => {
      const issues = (event as CustomEvent<unknown>).detail;
      if (Array.isArray(issues)) showServerImageIssues(issues as ImageInputIssue[]);
    };
    window.addEventListener("image-input-error", onImageInputError);
    return () => window.removeEventListener("image-input-error", onImageInputError);
  }, [showServerImageIssues]);

  /** .srt dosyasını oku → textarea'ya koy (en fazla ~20KB ham metin) */
  const handleSrtFile = useCallback((f: File) => {
    if (f.size > 64 * 1024) {
      showToast(l("SRT dosyası çok büyük (en fazla 64KB)", "SRT file is too large (max 64KB)"), "error");
      return;
    }
    f.text().then((text) => {
      setSrtText(text);
      setSrtFileName(f.name);
      setSrtResult(null);
    }).catch(() => showToast(l("Dosya okunamadı", "Could not read the file"), "error"));
  }, [l]);

  const handleSrtGenerate = async () => {
    if (srtBusy) return;
    if (!srtText.trim()) {
      showToast(l("Önce SRT yapıştır veya dosya yükle", "Paste an SRT or upload a file first"), "error");
      return;
    }
    if (srtPreview?.error) {
      showToast(l(`SRT hatası: ${srtPreview.error}`, `SRT error: ${srtPreview.error}`), "error");
      return;
    }
    if (srtPreview?.overCap) {
      showToast(l(`Çok uzun (en fazla ${MAX_SYNC_CUES} replik / ${MAX_SYNC_CHARS} karakter) — dosyayı böl`, `Too long (max ${MAX_SYNC_CUES} cues / ${MAX_SYNC_CHARS} characters) — split the file`), "error");
      return;
    }
    setSrtBusy(true);
    try {
      const res = await fetch("/api/jobs/submit-srt-voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srt: srtText,
          voiceId: srtVoice,
          emotion: srtEmotion,
          speed: srtSpeed,
          autoFit: srtAutoFit && srtEngine === "minimax",
          engine: srtEngine,
          xaiVoiceId: srtXaiVoice,
          mode: srtMode,
        }),
      });
      if (res.status === 402) {
        window.dispatchEvent(new CustomEvent("show-upgrade"));
        showToast(l("Yetersiz kredi. Lütfen kredi satın al.", "Not enough credits. Please buy credits."), "error");
        return;
      }
      if (res.status === 429) {
        showToast(l("Çok hızlı! Lütfen biraz bekle.", "Too fast! Please wait a moment."), "error");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(
          typeof data?.errorTr === "string" && data.errorTr
            ? data.errorTr
            : typeof data?.error === "string" && data.error
              ? data.error
              : l("Seslendirme başlatılamadı. Tekrar dene.", "Could not start the voiceover. Please try again."),
          "error"
        );
        return;
      }
      setSrtResult({
        jobId: data.jobId,
        creditCost: data.creditCost,
        tracks: data.tracks,
        totalMs: data.totalMs,
        overflowCount: data.overflowCount,
        refitCount: typeof data.refitCount === "number" ? data.refitCount : 0,
        mode: data.mode === "cues" ? "cues" : "single",
        audioUrl: typeof data.audioUrl === "string" ? data.audioUrl : "",
        audioDurationMs: typeof data.audioDurationMs === "number" ? data.audioDurationMs : 0,
        fitPasses: typeof data.fitPasses === "number" ? data.fitPasses : 1,
      });
      window.dispatchEvent(new Event("job-submitted"));
      showToast(l(`Seslendirme hazır (${data.creditCost} kredi)`, `Voiceover ready (${data.creditCost} credits)`), "success");
    } catch {
      showToast(l("Bağlantı hatası. İnterneti kontrol et.", "Connection error. Check your internet connection."), "error");
    } finally {
      setSrtBusy(false);
    }
  };

  const handleAvatarGenerate = async () => {
    if (avatarBusy) return;
    if (!uploadedImageUrl) {
      showToast(l("Lütfen önce bir avatar görseli yükle", "Please upload an avatar image first"), "error");
      return;
    }
    const script = avatarScript.trim();
    if (!script) {
      showToast(l("Lütfen konuşma metni yaz", "Please write a script"), "error");
      return;
    }
    if (script.length > MAX_AVATAR_SCRIPT_CHARS) {
      showToast(l(`Metin çok uzun (en fazla ${MAX_AVATAR_SCRIPT_CHARS} karakter)`, `Script is too long (max ${MAX_AVATAR_SCRIPT_CHARS} characters)`), "error");
      return;
    }
    if (uploading) {
      showToast(l("Yükleme devam ediyor, lütfen bekle", "Upload in progress, please wait"), "error");
      return;
    }
    setAvatarBusy(true);
    try {
      const res = await fetch("/api/jobs/submit-talking-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: uploadedImageUrl,
          script,
          voiceId: avatarVoice,
          modelKey: currentAvatarModel.modelKey,
        }),
      });
      if (res.status === 402) {
        window.dispatchEvent(new CustomEvent("show-upgrade"));
        showToast(l("Yetersiz kredi. Lütfen kredi satın al.", "Not enough credits. Please buy credits."), "error");
        return;
      }
      if (res.status === 429) {
        showToast(l("Çok hızlı! Lütfen biraz bekle.", "Too fast! Please wait a moment."), "error");
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.status === 422 && data?.code === "image_input_invalid" && Array.isArray(data.issues)) {
        showServerImageIssues(data.issues as ImageInputIssue[]);
        return;
      }
      if (!res.ok) {
        showToast(
          typeof data?.errorTr === "string" && data.errorTr
            ? data.errorTr
            : typeof data?.error === "string" && data.error
              ? data.error
              : l("Avatar üretimi başlatılamadı. Tekrar dene.", "Could not start avatar generation. Please try again."),
          "error"
        );
        return;
      }
      window.dispatchEvent(new Event("job-submitted"));
      showToast(l("Avatar üretimi başlatıldı!", "Avatar generation started!"), "success");
    } catch {
      showToast(l("Bağlantı hatası. İnterneti kontrol et.", "Connection error. Check your internet connection."), "error");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleGenerate = () => {
    // SRT voiceover uses its dedicated sync endpoint (per-cue TTS + R2),
    // not the generic /api/jobs/submit queue.
    if (activeTab === "srt-voiceover") {
      void handleSrtGenerate();
      return;
    }
    // Talking avatar uses its dedicated TTS -> video endpoint.
    if (activeTab === "talking-avatar") {
      void handleAvatarGenerate();
      return;
    }
    const name = projectName.trim() || l("Yeni Proje", "New Project");
    const apiTool = TAB_TO_API_TOOL[activeTab] ?? activeTool;

    // --- Validation ---
    const needsImage = !TEXT_ONLY_TABS.includes(activeTab);
    const needsPrompt = ["text-to-3d", "text-to-image", "text-to-video", "object-removal"].includes(activeTab);

    if (needsImage && !uploadedImageUrl) {
      showToast(l("Lütfen önce bir görsel yükle", "Please upload an image first"), "error");
      return;
    }
    if (needsPrompt && !promptText.trim()) {
      showToast(l("Lütfen bir açıklama yaz", "Please write a description"), "error");
      return;
    }
    if (activeTab === "virtual-tryon" && !modelPhotoUrl) {
      showToast(l("Lütfen model fotoğrafı da yükle", "Please upload a model photo too"), "error");
      return;
    }
    if (activeTab === "qr-code" && !projectName.trim()) {
      showToast(l("Lütfen QR kodu için bir URL gir", "Please enter a URL for the QR code"), "error");
      return;
    }
    if (activeTab === "logo" && !projectName.trim()) {
      showToast(l("Lütfen marka adı gir", "Please enter a brand name"), "error");
      return;
    }
    if (activeTab === "image-edit" && !editAction) {
      showToast(l("Lütfen bir düzenleme aksiyonu seç", "Please choose an edit action"), "error");
      return;
    }
    if (activeTab === "image-edit" && !promptText.trim()) {
      showToast(l("Lütfen düzenleme açıklaması yaz", "Please describe the edit"), "error");
      return;
    }
    if (uploading || modelPhotoUploading) {
      showToast(l("Yükleme devam ediyor, lütfen bekle", "Upload in progress, please wait"), "error");
      return;
    }
    if (imagePrep.busy || modelPhotoPrep.busy) {
      showToast(l("Görsel hazırlanıyor, lütfen bekle", "Preparing image, please wait"), "error");
      return;
    }

    // Build base payload
    const payload: GeneratePayload = {
      name,
      model: "",
      credits: footerInfo.credits,
      apiTool,
      // Text-only tabs never send an image: one uploaded on another tab of the
      // same tool would otherwise turn text-to-3D/video into image-to-3D/video.
      imageUrl: needsImage ? uploadedImageUrl ?? undefined : undefined,
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

    // QR: gercek hedef URL'yi DATA olarak gonder — server bunu QR matrisine encode
    // eder, stil server-side qrStylePrompt ile eklenir. Onceki "QR code for ${url}.
    // Artistic..." cumlesi oldugu gibi QR'a basiliyordu; taraninca URL yerine bu
    // cumle cikiyor, web akisi islevsel-bozuk QR uretiyordu (Codex PR#24 P1).
    if (activeTab === "qr-code") {
      payload.prompt = projectName.trim() || "https://www.renderhane.com";
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
      // text-to-3d always uses meshy-6-text (standard tier, 55kr backend)
      payload.model = "Meshy 6";
      payload.credits = 55;
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
    if (submitting) return;
    if (!uploadedImageUrl) {
      showToast(l("Lütfen önce bir ürün görseli yükle", "Please upload a product image first"), "error");
      return;
    }
    if (uploading || imagePrep.busy) {
      showToast(l("Yükleme devam ediyor, lütfen bekle", "Upload in progress, please wait"), "error");
      return;
    }
    const caption = analysisResult?.caption ?? "";
    const smart = smartDefaultsFor(caption, analysisResult?.tags ?? []);
    const isAplus = activeTab === "aplus";
    const payload: GeneratePayload = {
      name: projectName.trim() || l(`Akıllı ${isAplus ? "A+" : "Sahne"}`, `Smart ${isAplus ? "A+" : "Scene"}`),
      model: "Nano Banana Pro",
      credits: 18,
      // Nano Banana Pro is a scene model; the A+ template still shapes the
      // prompt through promptContext (the aplus tool only allows Bria).
      apiTool: "scene",
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

  /** Navigate to a code-suggested tool: same group → switch tab; else switch group. */
  const goToTool = (target: { group: string; tab: string }) => {
    if (target.group === activeTool) selectTab(target.tab);
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
            <h3 className="text-sm font-semibold text-foreground">{l("Yakında", "Coming soon")}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {l("Bu araç kategorisi üzerinde çalışıyoruz. Çok yakında kullanıma açılacak!", "We are working on this tool category. It will be available very soon!")}
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
            {/* Native image is intentional for a local object URL preview. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={l("Yüklenen görsel", "Uploaded image")} className="w-full h-full object-contain rounded-lg" />
            <button
              type="button"
              aria-label={l("Görseli kaldır", "Remove image")}
              onClick={(e) => {
                e.stopPropagation();
                if (preview) URL.revokeObjectURL(preview);
                setPreview(null); setUploadedFile(null); setUploadedImageUrl(null); setAnalysisResult(null);
                // Forget the original and any upload still in flight.
                imagePrep.cancel();
                uploadSeqRef.current += 1;
                setUploading(false);
                originalFileRef.current = null;
                uploadedFactsRef.current = null;
                setImageFieldError(null);
                setPreparedNote(null);
              }}
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
                <span className="hidden xs:inline">{l("Galeri", "Gallery")}</span>
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer md:hidden"
              >
                <Camera className="h-4 w-4" />
                <span>{l("Kamera", "Camera")}</span>
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
      {imagePrep.busy && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span>{l("Görsel bu model için hazırlanıyor…", "Preparing image for this model…")}</span>
          <button type="button" onClick={imagePrep.cancel} className="ml-auto underline hover:text-foreground">{l("İptal", "Cancel")}</button>
        </div>
      )}
      {imageFieldError ? (
        <p role="alert" className="mt-2 break-words text-[11px] text-destructive">{imageFieldError}</p>
      ) : preparedNote ? (
        <p className="mt-2 break-words text-[10px] text-muted-foreground">{preparedNote}</p>
      ) : null}
      {imageLimits && (
        <p className="mt-1 break-words text-[10px] text-muted-foreground">
          {l("Bu model:", "This model:")} {limitsSummary(imageLimits, uiLocale)}
          {imageLimitsNote ? ` — ${imageLimitsNote}` : ""}
        </p>
      )}
      {/* AI image analysis badge — silent fail (UX should not block on this) */}
      {(analyzing || analysisResult) && preview && (
        <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
          {analyzing ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>{l("AI görseli analiz ediyor...", "AI is analyzing the image...")}</span>
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
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary" title={l(smart.note, smart.noteEn)}>{l(smart.label, smart.labelEn)}</span>
                    {suggestionRelevant && (
                      <button
                        type="button"
                        onClick={() => goToTool(suggestion!)}
                        className="rounded border border-primary/30 px-1.5 py-0.5 text-[9px] text-primary hover:bg-primary/10"
                      >
                        {l("Öneri:", "Suggestion:")} {l(suggestion!.label, suggestion!.labelEn)} →
                      </button>
                    )}
                    {showSmartGen && (
                      <button
                        type="button"
                        onClick={handleSmartGenerate}
                        disabled={submitting}
                        className="ml-auto disabled:opacity-50 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        <Sparkles className="h-3 w-3" /> {l("Akıllı Üret", "Smart Generate")}
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
      <ImagePrepareDialog pending={imagePrep.pending} onAccept={imagePrep.accept} onDecline={imagePrep.decline} />
      <ImagePrepareDialog pending={modelPhotoPrep.pending} onAccept={modelPhotoPrep.accept} onDecline={modelPhotoPrep.decline} />
      <ImageInputErrorDialog
        issues={imagePrep.issues}
        note={imageLimitsNote}
        onClose={imagePrep.clearIssues}
        onChooseAnother={() => fileInputRef.current?.click()}
      />
      <ImageInputErrorDialog
        issues={modelPhotoPrep.issues}
        note={imageLimitsNote}
        onClose={modelPhotoPrep.clearIssues}
        onChooseAnother={() => modelPhotoInputRef.current?.click()}
      />
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
                selectTab(tab.id);
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
              <span>{l(tab.label, tab.labelEn)}</span>
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
            {renderImageUpload(l("Ürün fotoğrafını yükle", "Upload a product photo"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            <div>
              <Label htmlFor="model-name" className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="model-name" placeholder={l("ör: Ürün kutusu, Vazo, Oyuncak araba", "e.g. Product box, Vase, Toy car")} className="mt-1.5 h-8 text-sm bg-background/50" />
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
                    {model.name} — {model.credits} {l("kr", "cr")}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Gelişmiş Ayarlar", "Advanced Settings")}</Label>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enhance" className="text-xs text-muted-foreground cursor-pointer">{l("Otomatik İyileştirme", "Auto Enhance")}</Label>
                  <p className="text-[10px] text-muted-foreground/50">{l("Girdi görselini iyileştir (+4 kredi)", "Enhance the input image (+4 credits)")}</p>
                </div>
                <Switch id="enhance" checked={autoEnhance} onCheckedChange={setAutoEnhance} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="keep-bg" className="text-xs text-muted-foreground cursor-pointer">{l("Arka Planı Koru", "Keep Background")}</Label>
                  <p className="text-[10px] text-muted-foreground/50">{l("Otomatik arka plan temizlemeyi atla", "Skip automatic background removal")}</p>
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
                <Label className="text-xs font-medium text-muted-foreground">{l("Açıklama", "Description")}</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder={l("Oluşturmak istediğin 3D modeli detaylı anlat...\n\nör: Kırmızı renkli, metal yüzeyli bir oyuncak araba. Parlak boya, gerçekçi tekerlekler.", "Describe the 3D model you want in detail...\n\ne.g. A red toy car with a metal finish. Glossy paint, realistic wheels.")}
                className="mt-1.5 min-h-[140px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label htmlFor="text-model-name" className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="text-model-name" placeholder={l("ör: Kırmızı oyuncak araba", "e.g. Red toy car")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                defaultValue="meshy-6"
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="meshy-6">{l("Meshy 6 — 55 kr", "Meshy 6 — 55 cr")}</option>
              </select>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Stil Ayarları", "Style Settings")}</Label>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Sanat Stili", "Art Style")}</Label>
                <select
                  defaultValue="realistic"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="realistic">{l("Gerçekçi", "Realistic")}</option>
                  <option value="cartoon">{l("Karikatür", "Cartoon")}</option>
                  <option value="lowpoly">{l("Düşük Poli", "Low Poly")}</option>
                  <option value="sculpture">{l("Heykel", "Sculpture")}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Negatif Prompt", "Negative Prompt")}</Label>
                <Switch />
              </div>
            </div>
          </>
        )}

        {/* Doku Üret */}
        {activeTab === "texture" && (
          <>
            {renderImageUpload(l("Doku referans görseli yükle", "Upload a texture reference image"), l("Tıkla, sürükle veya yapıştır • Ürün fotoğrafı veya referans", "Click, drag or paste • Product photo or reference"))}

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">{l("Doku Açıklaması", "Texture Description")}</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder={l("Nasıl bir doku istiyorsun?\n\nör: Paslı metal yüzey, çizikler ve aşınma izleri", "What kind of texture do you want?\n\ne.g. Rusty metal surface with scratches and wear marks")}
                className="mt-1.5 min-h-[100px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={l("ör: Metal doku üretimi", "e.g. Metal texture")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════
            IMAGE TOOL TABS
           ═══════════════════════════════════════ */}

        {/* Arkaplan Kaldır */}
        {activeTab === "bg-remove" && (
          <>
            {renderImageUpload(l("Arkaplanı kaldırılacak görseli yükle", "Upload the image to remove the background from"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={l("ör: Ürün arka plan temizleme", "e.g. Product background cleanup")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Scissors className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">birefnet v2</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{l("1 kredi", "1 credit")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("Yüksek doğrulukla arkaplan kaldırma. Ürün fotoğrafları için ideal.", "High-accuracy background removal. Ideal for product photos.")}
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Seçenekler", "Options")}</Label>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Kenar Yumuşatma", "Edge Smoothing")}</Label>
                <Switch defaultChecked />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Çıktı Formatı", "Output Format")}</Label>
                <select
                  defaultValue="png"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="png">{l("PNG (Şeffaf)", "PNG (Transparent)")}</option>
                  <option value="white">{l("Beyaz Arkaplan", "White Background")}</option>
                  <option value="custom">{l("Özel Renk", "Custom Color")}</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* İyileştir (Enhance / Upscale) */}
        {activeTab === "enhance" && (
          <>
            {renderImageUpload(l("İyileştirilecek görseli yükle", "Upload the image to enhance"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={l("ör: Ürün görseli iyileştirme", "e.g. Product image enhancement")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <ZoomIn className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">Aura SR</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{l("4 kredi", "4 credits")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("AI destekli süper çözünürlük. Düşük kaliteli görselleri netleştir.", "AI-powered super resolution. Sharpen low-quality images.")}
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Ayarlar", "Settings")}</Label>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Büyütme Oranı", "Upscale Factor")}</Label>
                <select
                  defaultValue="2x"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="2x">{l("2× (Önerilen)", "2× (Recommended)")}</option>
                  <option value="4x">{l("4× (Yüksek Kalite)", "4× (High Quality)")}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Gürültü Azaltma", "Noise Reduction")}</Label>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Yüz İyileştirme", "Face Enhancement")}</Label>
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
                <Label className="text-xs font-medium text-muted-foreground">{l("Açıklama", "Description")}</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder={l("Oluşturmak istediğin görseli detaylı anlat...\n\nör: Beyaz arka planda minimalist bir parfüm şişesi, stüdyo ışığı, profesyonel ürün fotoğrafı", "Describe the image you want in detail...\n\ne.g. A minimalist perfume bottle on a white background, studio lighting, professional product photo")}
                className="mt-1.5 min-h-[120px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={l("ör: Parfüm şişesi görseli", "e.g. Perfume bottle image")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                value={selectedTextModel}
                onChange={(e) => setSelectedTextModel(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {TEXT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{l(m.name, m.nameEn ?? m.name)} — {m.credits} {l("kr", "cr")}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Görsel Ayarları", "Image Settings")}</Label>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Stil", "Style")}</Label>
                <select
                  defaultValue="photo"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="photo">{l("Fotogerçekçi", "Photorealistic")}</option>
                  <option value="illustration">{l("İllüstrasyon", "Illustration")}</option>
                  <option value="digital-art">{l("Dijital Sanat", "Digital Art")}</option>
                  <option value="anime">Anime</option>
                  <option value="3d-render">3D Render</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Boyut", "Size")}</Label>
                <select
                  defaultValue="1:1"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="1:1">{l("1:1 Kare (1024×1024)", "1:1 Square (1024×1024)")}</option>
                  <option value="16:9">{l("16:9 Yatay (1024×576)", "16:9 Landscape (1024×576)")}</option>
                  <option value="9:16">{l("9:16 Dikey (576×1024)", "9:16 Portrait (576×1024)")}</option>
                  <option value="4:3">{l("4:3 Yatay (1024×768)", "4:3 Landscape (1024×768)")}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Negatif Prompt", "Negative Prompt")}</Label>
                <Switch />
              </div>
            </div>
          </>
        )}

        {/* Görsel Düzenle — Aksiyon Kartları */}
        {activeTab === "image-edit" && (
          <>
            {renderImageUpload(l("Düzenlenecek görseli yükle", "Upload the image to edit"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                value={selectedEditModel}
                onChange={(e) => setSelectedEditModel(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {EDIT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{l(m.name, m.nameEn ?? m.name)} — {m.credits} {l("kr", "cr")}</option>
                ))}
              </select>
            </div>

            {/* Action cards grid */}
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 block">{l("Ne yapmak istiyorsun?", "What do you want to do?")}</Label>
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
                      <span className="text-[10px] font-medium leading-tight">{l(action.label, action.labelEn)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action-specific options */}
            {editAction === "recolor" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Renk Ayarları", "Color Settings")}</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">{l("Hedef Renk", "Target Color")}</Label>
                  <div className="flex gap-1.5 mt-1.5">
                    {["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#ffffff"].map((c) => (
                      <button key={c} type="button" className={cn("h-6 w-6 rounded-full border-2 hover:scale-110 transition-transform", editColor === c ? "border-primary ring-2 ring-primary/30" : "border-border/50")} style={{ backgroundColor: c }} onClick={() => setEditColor(c)} />
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{l("Uygulama Alanı", "Apply To")}</Label>
                  <select value={editColorArea} onChange={(e) => setEditColorArea(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="product">{l("Sadece Ürün", "Product Only")}</option>
                    <option value="background">{l("Sadece Arkaplan", "Background Only")}</option>
                    <option value="all">{l("Tüm Görsel", "Entire Image")}</option>
                  </select>
                </div>
              </div>
            )}

            {editAction === "bg-swap" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Arkaplan Ayarları", "Background Settings")}</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">{l("Yeni Arkaplan", "New Background")}</Label>
                  <select value={editBgType} onChange={(e) => setEditBgType(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="blur">{l("Bulanıklaştır", "Blur")}</option>
                    <option value="white">{l("Beyaz", "White")}</option>
                    <option value="gradient">{l("Gradyan", "Gradient")}</option>
                    <option value="scene">{l("Sahne Oluştur (AI)", "Generate Scene (AI)")}</option>
                    <option value="transparent">{l("Şeffaf (PNG)", "Transparent (PNG)")}</option>
                  </select>
                </div>
                {/* Scene prompt only when scene is selected */}
                <div>
                  <Label className="text-xs text-muted-foreground">{l("Sahne Açıklaması", "Scene Description")}</Label>
                  <Input value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder={l("ör: Mermer masa üstü, stüdyo ışığı", "e.g. Marble tabletop, studio lighting")} className="mt-1.5 h-8 text-sm bg-background/50" />
                </div>
              </div>
            )}

            {editAction === "remove-obj" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Nesne Kaldırma", "Object Removal")}</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">{l("Neyi kaldıralım?", "What should we remove?")}</Label>
                  <Input value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder={l("ör: Sağ taraftaki gölge, sol alttaki logo", "e.g. The shadow on the right, the logo at bottom left")} className="mt-1.5 h-8 text-sm bg-background/50" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{l("Otomatik Dolgu", "Auto Fill")}</Label>
                  <Switch defaultChecked />
                </div>
              </div>
            )}

            {editAction === "retouch" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Rötuş Seçenekleri", "Retouch Options")}</Label>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{l("Netleştir", "Sharpen")}</Label>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{l("Parlaklık Düzelt", "Fix Brightness")}</Label>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{l("Renk Dengesi", "Color Balance")}</Label>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{l("Gürültü Azalt", "Reduce Noise")}</Label>
                  <Switch />
                </div>
              </div>
            )}

            {editAction === "style" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Stil Seçenekleri", "Style Options")}</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">{l("Sanat Stili", "Art Style")}</Label>
                  <select value={editStyle} onChange={(e) => setEditStyle(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="oil">{l("Yağlıboya", "Oil Painting")}</option>
                    <option value="watercolor">{l("Suluboya", "Watercolor")}</option>
                    <option value="sketch">{l("Karakalem", "Pencil Sketch")}</option>
                    <option value="popart">Pop Art</option>
                    <option value="anime">Anime</option>
                    <option value="pixel">{l("Piksel Sanatı", "Pixel Art")}</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{l("Etki Gücü", "Strength")}</Label>
                  <select value={editStyleStrength} onChange={(e) => setEditStyleStrength(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="light">{l("Hafif — Dokunuş", "Light — Subtle touch")}</option>
                    <option value="medium">{l("Orta — Dengeli", "Medium — Balanced")}</option>
                    <option value="strong">{l("Güçlü — Tam dönüşüm", "Strong — Full transformation")}</option>
                  </select>
                </div>
              </div>
            )}

            {editAction === "resize" && (
              <div className="space-y-3 pt-1 border-t border-border/40 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Boyut Ayarları", "Size Settings")}</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">{l("En Boy Oranı", "Aspect Ratio")}</Label>
                  <select value={editAspect} onChange={(e) => setEditAspect(e.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50">
                    <option value="1:1">{l("1:1 Kare", "1:1 Square")}</option>
                    <option value="4:3">{l("4:3 Yatay", "4:3 Landscape")}</option>
                    <option value="3:4">{l("3:4 Dikey", "3:4 Portrait")}</option>
                    <option value="16:9">{l("16:9 Geniş", "16:9 Wide")}</option>
                    <option value="9:16">{l("9:16 Hikaye", "9:16 Story")}</option>
                    <option value="custom">{l("Özel Boyut", "Custom Size")}</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{l("AI ile Genişlet", "Expand with AI")}</Label>
                  <Switch />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={l("ör: Ürün görseli düzenleme", "e.g. Product image edit")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>
          </>
        )}

        {/* Nesne Silme (Object Removal) */}
        {activeTab === "object-removal" && (
          <>
            {renderImageUpload(l("Nesne silinecek görseli yükle", "Upload the image to remove objects from"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">{l("Neyi silelim?", "What should we remove?")}</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder={l("Silinecek nesneyi tanımla...\n\nör: Sağdaki bardak, arka plandaki logo, yerdeki gölge", "Describe the object to remove...\n\ne.g. The glass on the right, the logo in the background, the shadow on the floor")}
                className="mt-1.5 min-h-[80px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={l("ör: Ürün görseli nesne temizleme", "e.g. Product image object cleanup")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Eraser className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">AI Object Removal</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{l("3 kredi", "3 credits")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("Görseldeki istenmeyen nesneleri AI ile otomatik sil ve arka planı doldur.", "Automatically remove unwanted objects with AI and fill in the background.")}
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
            {renderImageUpload(l("Video oluşturulacak görseli yükle", "Upload the image to turn into a video"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            <div>
              <Label htmlFor="video-name" className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="video-name" placeholder={l("ör: Ürün tanıtım videosu", "e.g. Product promo video")} className="mt-1.5 h-8 text-sm bg-background/50" />
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
                    {l(model.name, model.nameEn ?? model.name)} — {model.credits} {l("kr", "cr")}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Video Ayarları", "Video Settings")}</Label>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Süre", "Duration")}</Label>
                <select
                  defaultValue="5"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="3">{l("3 saniye", "3 seconds")}</option>
                  <option value="5">{l("5 saniye (Önerilen)", "5 seconds (Recommended)")}</option>
                  <option value="10">{l("10 saniye", "10 seconds")}</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Kamera Hareketi", "Camera Motion")}</Label>
                <select
                  defaultValue="orbit"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="static">{l("Sabit", "Static")}</option>
                  <option value="orbit">{l("Yörünge (Dönen)", "Orbit (Rotating)")}</option>
                  <option value="zoom-in">{l("Yakınlaşma", "Zoom In")}</option>
                  <option value="zoom-out">{l("Uzaklaşma", "Zoom Out")}</option>
                  <option value="pan">{l("Kaydırma", "Pan")}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Yüksek Çözünürlük", "High Resolution")}</Label>
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
                <Label className="text-xs font-medium text-muted-foreground">{l("Video Açıklaması", "Video Description")}</Label>
                <EnrichButton tool={TAB_TO_API_TOOL[activeTab] ?? "default"} prompt={promptText} onResult={setPromptText} />
              </div>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder={l("Oluşturmak istediğin videoyu detaylı anlat...\n\nör: Beyaz arka planda dönen bir parfüm şişesi, yumuşak stüdyo ışığı, yavaş hareket", "Describe the video you want in detail...\n\ne.g. A perfume bottle rotating on a white background, soft studio lighting, slow motion")}
                className="mt-1.5 min-h-[120px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div>
              <Label htmlFor="t2v-name" className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="t2v-name" placeholder={l("ör: Parfüm tanıtım videosu", "e.g. Perfume promo video")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Video className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">Kling O3 Pro</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{l("40 kredi", "40 credits")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("Native ses desteği ile metin-video dönüşümü. Multi-shot ve 15 sn'ye kadar.", "Text-to-video with native audio. Multi-shot, up to 15 s.")}
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Video Ayarları", "Video Settings")}</Label>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Süre", "Duration")}</Label>
                <select
                  defaultValue="5"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="3">{l("3 saniye", "3 seconds")}</option>
                  <option value="5">{l("5 saniye (Önerilen)", "5 seconds (Recommended)")}</option>
                  <option value="10">{l("10 saniye", "10 seconds")}</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("En Boy Oranı", "Aspect Ratio")}</Label>
                <select
                  defaultValue="16:9"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="16:9">{l("16:9 Yatay (1280×720)", "16:9 Landscape (1280×720)")}</option>
                  <option value="9:16">{l("9:16 Dikey — Reels/TikTok", "9:16 Portrait — Reels/TikTok")}</option>
                  <option value="1:1">{l("1:1 Kare", "1:1 Square")}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Negatif Prompt", "Negative Prompt")}</Label>
                <Switch />
              </div>
            </div>
          </>
        )}

        {/* Konuşan Avatar */}
        {activeTab === "talking-avatar" && (
          <>
            {renderImageUpload(l("Avatar fotoğrafını yükle", "Upload an avatar photo"), l("Yüz net görünsün • PNG, JPG, WebP", "Face should be clearly visible • PNG, JPG, WebP"))}

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">{l("Konuşma Metni", "Script")}</Label>
                <span className="text-[10px] text-muted-foreground">{avatarScript.trim().length}/{MAX_AVATAR_SCRIPT_CHARS}</span>
              </div>
              <Textarea
                value={avatarScript}
                onChange={(e) => setAvatarScript(e.target.value)}
                placeholder={l("Avatarın söylemesini istediğin metin...\n\nör: Merhaba! Yeni koleksiyonumuz mağazada.", "What should the avatar say...\n\ne.g. Hi! Our new collection is now in store.")}
                className="mt-1.5 min-h-[100px] text-sm bg-background/50 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{l("Ses", "Voice")}</Label>
                <select
                  value={avatarVoice}
                  onChange={(e) => setAvatarVoice(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-2 text-xs text-foreground outline-none focus:border-ring"
                >
                  {SRT_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>{l(v.labelTr, v.labelEn)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Model</Label>
                <select
                  value={selectedAvatarModel}
                  onChange={(e) => setSelectedAvatarModel(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-2 text-xs text-foreground outline-none focus:border-ring"
                >
                  {AVATAR_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{l(m.name, m.nameEn ?? m.name)} — {m.credits} {l("kr", "cr")}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Mic className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">{l(currentAvatarModel.name, currentAvatarModel.nameEn ?? currentAvatarModel.name)}</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{currentAvatarModel.credits} {l("kredi", "credits")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("Metin MiniMax ile doğal sese çevrilir, fotoğrafın konuşur. Sonuç galeride video olarak belirir.", "Your script is turned into a natural voice with MiniMax and your photo speaks it. The result appears in the gallery as a video.")}
              </p>
            </div>
          </>
        )}

        {/* SRT Seslendirme */}
        {activeTab === "srt-voiceover" && (
          <>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">{l("SRT Altyazı", "SRT Subtitles")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => srtFileInputRef.current?.click()}
                >
                  <FolderUp className="h-3 w-3 mr-1" />
                  {srtFileName ?? l("Dosya yükle", "Upload file")}
                </Button>
                <input
                  ref={srtFileInputRef}
                  type="file"
                  accept=".srt,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSrtFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
              <Textarea
                value={srtText}
                onChange={(e) => {
                  setSrtText(e.target.value);
                  setSrtFileName(null);
                  setSrtResult(null);
                }}
                placeholder={l("1\n00:00:01,000 --> 00:00:03,500\nMerhaba, hoş geldiniz.\n\n2\n00:00:04,000 --> 00:00:06,000\nBugün harika bir gün.", "1\n00:00:01,000 --> 00:00:03,500\nHello, welcome.\n\n2\n00:00:04,000 --> 00:00:06,000\nWhat a great day.")}
                className="mt-1.5 min-h-[140px] text-xs font-mono bg-background/50 resize-y"
              />
              {srtPreview && !srtPreview.error && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {srtPreview.cues} {l("replik", "cues")} • {srtPreview.chars} {l("karakter", "characters")} • ~{srtPreview.credits} {l("kredi", "credits")}
                  {srtPreview.overCap && (
                    <span className="text-amber-600"> — {l("anlık işlem için çok uzun, dosyayı böl", "too long for instant processing, split the file")}</span>
                  )}
                </p>
              )}
              {srtPreview?.error && (
                <p className="mt-1 text-[10px] text-destructive">{l("SRT hatası:", "SRT error:")} {srtPreview.error}</p>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">{l("Çıktı", "Output")}</Label>
              <select
                value={srtMode}
                onChange={(e) => setSrtMode(e.target.value as "single" | "cues")}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-2 text-xs text-foreground outline-none focus:border-ring"
              >
                {SRT_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{l(m.labelTr, m.labelEn)}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {srtMode === "single"
                  ? l("Tek çağrı, tek dosya — galeride doğrudan çalar.", "One call, one file — plays directly in the gallery.")
                  : l("Her replik ayrı seslendirilir, zaman çizelgesine dizilir.", "Each cue is voiced separately and placed on the timeline.")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{l("Motor", "Engine")}</Label>
                <select
                  value={srtEngine}
                  onChange={(e) => setSrtEngine(e.target.value as "minimax" | "xai")}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-2 text-xs text-foreground outline-none focus:border-ring"
                >
                  {SRT_ENGINES.map((m) => (
                    <option key={m.id} value={m.id}>{l(m.labelTr, m.labelEn)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Ses", "Voice")}</Label>
                <select
                  value={srtEngine === "xai" ? srtXaiVoice : srtVoice}
                  onChange={(e) => (srtEngine === "xai" ? setSrtXaiVoice(e.target.value) : setSrtVoice(e.target.value))}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-2 text-xs text-foreground outline-none focus:border-ring"
                >
                  {(srtEngine === "xai" ? XAI_VOICES : SRT_VOICES).map((v) => (
                    <option key={v.id} value={v.id}>{l(v.labelTr, v.labelEn)}</option>
                  ))}
                </select>
              </div>
            </div>

            {srtEngine === "minimax" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{l("Duygu", "Emotion")}</Label>
                <select
                  value={srtEmotion}
                  onChange={(e) => setSrtEmotion(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-2 text-xs text-foreground outline-none focus:border-ring"
                >
                  {SRT_EMOTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{l("Hız", "Speed")}</Label>
                  <span className="text-[10px] text-muted-foreground">{srtSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.1}
                  value={srtSpeed}
                  onChange={(e) => setSrtSpeed(Number(e.target.value))}
                  className="mt-1.5 w-full accent-primary"
                />
              </div>
            </div>
            )}

            {srtEngine === "xai" && (
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("Ekonomi modu: duygu/hız ve otomatik sığdırma yok, süre ölçümü yapılmaz.", "Economy mode: no emotion/speed or auto-fit, and durations are not measured.")}
              </p>
            )}

            {srtMode === "cues" && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{l("Zamana otomatik oturt", "Auto-fit to timing")}</Label>
                <p className="text-[10px] text-muted-foreground/70">
                  {srtEngine === "xai" ? l("Yalnızca MiniMax motorunda", "MiniMax engine only") : l("Taşan replik en fazla 1.3x hızlanır", "Overflowing cues speed up by at most 1.3x")}
                </p>
              </div>
              <Switch checked={srtAutoFit && srtEngine === "minimax"} onCheckedChange={setSrtAutoFit} disabled={srtEngine === "xai"} />
            </div>
            )}

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Mic className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">{srtEngine === "xai" ? l("xAI • Ekonomi", "xAI • Economy") : l("MiniMax 2.8 • Türkçe", "MiniMax 2.8 • Turkish")}</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{srtEngine === "xai" ? l("ekonomi", "economy") : l("doğal ses", "natural voice")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {srtMode === "single"
                  ? l("Tek çağrı, tek dosya — galeride doğrudan çalar. Süre SRT'ye oturtulur.", "One call, one file — plays directly in the gallery. Duration is fitted to the SRT.")
                  : l("Her replik ayrı seslendirilir, SRT zamanlarına dizilir. Ses asla kesilmez; slota sığmayan replik işaretlenir.", "Each cue is voiced separately and placed at its SRT time. Audio is never cut; cues that don't fit their slot are flagged.")}
              </p>
            </div>

            {srtResult && (
              <SrtVoiceoverResult
                tracks={srtResult.tracks}
                totalMs={srtResult.totalMs}
                overflowCount={srtResult.overflowCount}
                refitCount={srtResult.refitCount}
                jobId={srtResult.jobId}
                mode={srtResult.mode}
                audioUrl={srtResult.audioUrl}
                audioDurationMs={srtResult.audioDurationMs}
                fitPasses={srtResult.fitPasses}
              />
            )}
          </>
        )}

        {/* ═══════════════════════════════════════
            E-TİCARET TABS
           ═══════════════════════════════════════ */}

        {/* Sahne Oluştur */}
        {activeTab === "scene" && (
          <>
            {renderImageUpload(l("Ürün fotoğrafını yükle", "Upload a product photo"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            <div>
              <Label htmlFor="scene-name" className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="scene-name" placeholder={l("ör: Parfüm stüdyo çekimi", "e.g. Perfume studio shot")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
              <select
                value={selectedSceneModel}
                onChange={(e) => setSelectedSceneModel(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {SCENE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{l(m.name, m.nameEn ?? m.name)} — {m.credits} {l("kr", "cr")}</option>
                ))}
              </select>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Camera className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">{l(currentSceneModel.name, currentSceneModel.nameEn ?? currentSceneModel.name)}</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{currentSceneModel.credits} {l("kredi", "credits")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("Ürünü profesyonel stüdyo sahnelerine yerleştir. E-ticaret katalogları için ideal.", "Place your product in professional studio scenes. Ideal for e-commerce catalogs.")}
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Sahne Ayarları", "Scene Settings")}</Label>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Sahne Türü", "Scene Type")}</Label>
                <select
                  value={sceneType}
                  onChange={(e) => setSceneType(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="studio">{l("Stüdyo", "Studio")}</option>
                  <option value="lifestyle">{l("Yaşam Tarzı", "Lifestyle")}</option>
                  <option value="outdoor">{l("Dış Mekan", "Outdoor")}</option>
                  <option value="minimal">Minimalist</option>
                  <option value="luxury">{l("Lüks", "Luxury")}</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Sahne Açıklaması", "Scene Description")}</Label>
                <Input value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder={l("ör: Mermer masa, yumuşak ışık", "e.g. Marble table, soft light")} className="mt-1.5 h-8 text-sm bg-background/50" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Gölge Ekle", "Add Shadow")}</Label>
                <Switch defaultChecked />
              </div>
            </div>
          </>
        )}

        {/* A+ İçerik */}
        {activeTab === "aplus" && (
          <>
            {renderImageUpload(l("Ana ürün görseli yükle", "Upload the main product image"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            <div>
              <Label htmlFor="aplus-name" className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="aplus-name" placeholder={l("ör: Ürün detay sayfası görseli", "e.g. Product detail page image")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">Bria Product Shot HD</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{l("8 kredi", "8 credits")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("Amazon, Trendyol ve Hepsiburada için zengin A+ içerik görselleri.", "Rich A+ content images for Amazon, Trendyol and Hepsiburada.")}
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("A+ Ayarları", "A+ Settings")}</Label>
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
                  <option value="custom">{l("Özel Boyut", "Custom Size")}</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Şablon", "Template")}</Label>
                <select
                  value={aplusTemplate}
                  onChange={(e) => setAplusTemplate(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="feature">{l("Özellik Vurgulama", "Feature Highlight")}</option>
                  <option value="comparison">{l("Karşılaştırma", "Comparison")}</option>
                  <option value="lifestyle">{l("Yaşam Tarzı", "Lifestyle")}</option>
                  <option value="infographic">{l("İnfografik", "Infographic")}</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Ürün Açıklaması", "Product Description")}</Label>
                <Input value={aplusProductDesc} onChange={(e) => setAplusProductDesc(e.target.value)} placeholder={l("ör: Paslanmaz çelik termos, 500ml", "e.g. Stainless steel thermos, 500ml")} className="mt-1.5 h-8 text-sm bg-background/50" />
              </div>
            </div>
          </>
        )}

        {/* Sanal Deneme */}
        {activeTab === "virtual-tryon" && (
          <>
            {renderImageUpload(l("Kıyafet / aksesuar görseli yükle", "Upload a garment / accessory image"), l("Tıkla, sürükle veya yapıştır • PNG, JPG, WebP", "Click, drag or paste • PNG, JPG, WebP"))}

            {/* Second upload: Model/person photo */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">{l("Model Fotoğrafı", "Model Photo")}</Label>
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
                    {/* Native image is intentional for a local object URL preview. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={modelPhotoPreview} alt={l("Model fotoğrafı", "Model photo")} className="w-full h-full object-contain rounded-lg" />
                    <button
                      type="button"
                      aria-label={l("Model fotoğrafını kaldır", "Remove model photo")}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (modelPhotoPreview) URL.revokeObjectURL(modelPhotoPreview);
                        setModelPhotoPreview(null);
                        setModelPhotoUrl(null);
                        modelPhotoPrep.cancel();
                        modelPhotoSeqRef.current += 1;
                        setModelPhotoUploading(false);
                        setModelPhotoFieldError(null);
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
                        <span className="hidden xs:inline">{l("Galeri", "Gallery")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); modelCameraInputRef.current?.click(); }}
                        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer md:hidden"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        <span>{l("Kamera", "Camera")}</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{l("Kıyafetin giydirilmesini istediğin kişi", "The person who should wear the garment")}</p>
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
                  <span>{l("Yükleniyor...", "Uploading...")}</span>
                </div>
              )}
              {modelPhotoPrep.busy && (
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground" aria-live="polite">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>{l("Fotoğraf hazırlanıyor…", "Preparing photo…")}</span>
                  <button type="button" onClick={modelPhotoPrep.cancel} className="ml-auto underline hover:text-foreground">{l("İptal", "Cancel")}</button>
                </div>
              )}
              {modelPhotoFieldError && (
                <p role="alert" className="mt-1 break-words text-[10px] text-destructive">{modelPhotoFieldError}</p>
              )}
            </div>

            <div>
              <Label htmlFor="tryon-name" className="text-xs font-medium text-muted-foreground">{l("Proje Adı", "Project Name")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} id="tryon-name" placeholder={l("ör: Kış koleksiyonu deneme", "e.g. Winter collection try-on")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Shirt className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">FASHN Try-On</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{l("10 kredi", "10 credits")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("Kıyafet ve aksesuarları model üzerinde sanal olarak dene. Moda e-ticaret için ideal.", "Virtually try garments and accessories on a model. Ideal for fashion e-commerce.")}
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Deneme Ayarları", "Try-On Settings")}</Label>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Kategori", "Category")}</Label>
                <select
                  defaultValue="auto"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="auto">{l("Otomatik", "Automatic")}</option>
                  <option value="upper">{l("Üst Giyim", "Tops")}</option>
                  <option value="lower">{l("Alt Giyim", "Bottoms")}</option>
                  <option value="full">{l("Tam Kıyafet", "Full Outfit")}</option>
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
              <Label htmlFor="logo-brand-name" className="text-xs font-medium text-muted-foreground">{l("Marka / İşletme Adı", "Brand / Business Name")}</Label>
              <Input id="logo-brand-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={l("ör: Renderhane", "e.g. Renderhane")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label htmlFor="logo-slogan" className="text-xs font-medium text-muted-foreground">{l("Slogan (Opsiyonel)", "Tagline (Optional)")}</Label>
              <Input id="logo-slogan" value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder={l("ör: AI ile görsel üretimi", "e.g. AI-powered visuals")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">{l("Sektör / Alan", "Industry")}</Label>
              <select
                value={logoIndustry}
                onChange={(e) => setLogoIndustry(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {LOGO_INDUSTRIES.map((ind) => (
                  <option key={ind.value} value={ind.value}>{l(ind.label, ind.labelEn)}</option>
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
                  {logoFormat === "svg" ? "10" : "8"} {l("kredi", "credits")}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("AI destekli profesyonel logo tasarımı.", "AI-powered professional logo design.")} {logoFormat === "svg" ? l("Vektör SVG formatında, sonsuz ölçeklenebilir.", "Vector SVG, infinitely scalable.") : l("Yüksek çözünürlüklü PNG formatında.", "High-resolution PNG.")}
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("Logo Ayarları", "Logo Settings")}</Label>

              {/* Stil */}
              <div>
                <Label className="text-xs text-muted-foreground">{l("Stil", "Style")}</Label>
                <select
                  value={logoStyle}
                  onChange={(e) => setLogoStyle(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  {LOGO_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>{l(s.label, s.labelEn)}</option>
                  ))}
                </select>
              </div>

              {/* Renk Paleti (max 3) */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{l("Renk Paleti", "Color Palette")}</Label>
                  <span className="text-[10px] text-muted-foreground/50">{logoColors.length}/3 {l("seçili", "selected")}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {LOGO_COLOR_PALETTE.map((c) => {
                    const isSelected = logoColors.includes(c.hex);
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        title={l(c.label, c.labelEn)}
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
                  <button type="button" onClick={() => setLogoColors([])} className="text-[10px] text-muted-foreground/60 hover:text-foreground mt-1 underline">{l("Temizle", "Clear")}</button>
                )}
              </div>

              {/* Çıktı Formatı */}
              <div>
                <Label className="text-xs text-muted-foreground">{l("Çıktı Formatı", "Output Format")}</Label>
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
                    {l("SVG (Vektör)", "SVG (Vector)")}
                  </button>
                </div>
              </div>

              {/* Şeffaf Arkaplan */}
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Şeffaf Arkaplan", "Transparent Background")}</Label>
                <Switch checked={logoTransparentBg} onCheckedChange={setLogoTransparentBg} />
              </div>
            </div>
          </>
        )}

        {/* QR Kod */}
        {activeTab === "qr-code" && (
          <>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">{l("Hedef URL / Metin", "Target URL / Text")}</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={l("ör: https://renderhane.com", "e.g. https://renderhane.com")} className="mt-1.5 h-8 text-sm bg-background/50" />
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <QrCode className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">{l("AI Sanatsal QR", "AI Artistic QR")}</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{l("6 kredi", "6 credits")}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {l("AI ile sanatsal QR kod oluştur. Taranabilirliği koruyarak estetik tasarım.", "Create artistic QR codes with AI. Aesthetic design that stays scannable.")}
              </p>
            </div>

            {renderImageUpload(l("Stil görseli yükle (opsiyonel)", "Upload a style image (optional)"), l("QR kod'un stilini belirleyecek referans görsel", "Reference image that sets the QR code's style"))}

            <div className="space-y-3 pt-1 border-t border-border/40">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{l("QR Ayarları", "QR Settings")}</Label>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Stil Açıklaması", "Style Description")}</Label>
                <Input placeholder={l("ör: Çiçek desenleri, doğa temalı", "e.g. Floral patterns, nature theme")} className="mt-1.5 h-8 text-sm bg-background/50" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{l("Hata Düzeltme", "Error Correction")}</Label>
                <select
                  defaultValue="H"
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background/50 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="L">{l("Düşük (%7)", "Low (7%)")}</option>
                  <option value="M">{l("Orta (%15)", "Medium (15%)")}</option>
                  <option value="Q">{l("Yüksek (%25)", "High (25%)")}</option>
                  <option value="H">{l("En Yüksek (%30) — Önerilen", "Highest (30%) — Recommended")}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{l("Logo Ortada", "Logo in Center")}</Label>
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
            <span>{timeLabel(l, footerInfo.time)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-foreground">{footerInfo.credits} {l("kredi", "credits")}</span>
          </div>
        </div>

        {uploading && (
          <div className="flex items-center gap-1.5 text-[10px] text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{l("Görsel yükleniyor...", "Uploading image...")}</span>
          </div>
        )}

        <Button
          className="w-full h-9 font-semibold"
          size="sm"
          onClick={handleGenerate}
          disabled={submitting || uploading || modelPhotoUploading || imagePrep.busy || modelPhotoPrep.busy || srtBusy || avatarBusy || activeTab.startsWith("batch-")}
        >
          {submitting || uploading || modelPhotoUploading || srtBusy || avatarBusy ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          {activeTab === "srt-voiceover" ? (srtBusy ? l("Seslendiriliyor...", "Voicing...") : l("Seslendir", "Generate Voiceover")) : activeTab === "talking-avatar" ? (avatarBusy ? l("Üretiliyor...", "Generating...") : l("Avatar Üret", "Generate Avatar")) : activeTool === "image" ? l("İşle", "Process") : activeTool === "video" ? l("Video Üret", "Generate Video") : activeTool === "ecommerce" ? l("Oluştur", "Create") : activeTool === "design" ? l("Tasarla", "Design") : activeTool === "batch" ? l("Toplu İşle", "Batch Process") : l("Üret", "Generate")}
        </Button>
      </div>
    </div>
  );
}
