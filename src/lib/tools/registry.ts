/**
 * Tool Registry — Single source of truth for all Renderhane tools.
 *
 * Dashboard grid, segment filtering, SEO, and pricing all derive from this.
 * To add a new tool: add an entry here + create its page under /app/tools/<id>/.
 */

export type ToolId =
  | "bg-remove"
  | "scene"
  | "aplus"
  | "3d-model"
  | "enhance"
  | "video"
  | "image-edit"
  | "social-kit"
  | "text-to-image"
  | "talking-avatar"
  | "logo"
  | "qr-code";

export type InputType =
  | "single-image"       // 1 image upload
  | "multi-image"        // 1-4 images (3D models)
  | "image-text"         // image + text prompt (scene, edit)
  | "text-only"          // text prompt only (text-to-image, logo)
  | "image-text-audio"   // image + text/audio (talking avatar)
  | "pipeline";          // multi-step automated (social kit)

export type SegmentId = "ecommerce" | "gaming" | "3dprint";

export interface ToolDefinition {
  id: ToolId;
  /** i18n key under "tools" namespace — e.g. tools.bgRemove */
  i18nKey: string;
  icon: string;
  /** Tailwind gradient classes for the card */
  gradient: string;
  /** Border color classes */
  border: string;
  /** Credit cost (shown on card). For tiered tools, show the minimum. */
  creditCost: number | string;
  /** What kind of input this tool needs */
  inputType: InputType;
  /** Which segments see this tool */
  segments: SegmentId[];
  /** Route path (relative to /app/tools/) */
  href: string;
  /** Whether this tool is implemented and ready */
  ready: boolean;
  /** Short description i18n key under "toolDescriptions" namespace */
  descriptionKey: string;
}

export const TOOLS: ToolDefinition[] = [
  // ── Mevcut Araçlar (6) ──────────────────────
  {
    id: "bg-remove",
    i18nKey: "bgRemove",
    icon: "✂️",
    gradient: "from-rose-500/10 to-rose-500/5",
    border: "border-rose-200 hover:border-rose-400 dark:border-rose-800 dark:hover:border-rose-600",
    creditCost: 1,
    inputType: "single-image",
    segments: ["ecommerce", "gaming", "3dprint"],
    href: "/app/tools/bg-remove",
    ready: true,
    descriptionKey: "bgRemoveDesc",
  },
  {
    id: "scene",
    i18nKey: "scene",
    icon: "🎨",
    gradient: "from-violet-500/10 to-violet-500/5",
    border: "border-violet-200 hover:border-violet-400 dark:border-violet-800 dark:hover:border-violet-600",
    creditCost: 8,
    inputType: "image-text",
    segments: ["ecommerce"],
    href: "/app/tools/scene",
    ready: true,
    descriptionKey: "sceneDesc",
  },
  {
    id: "aplus",
    i18nKey: "aplus",
    icon: "⭐",
    gradient: "from-amber-500/10 to-amber-500/5",
    border: "border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-600",
    creditCost: 32,
    inputType: "single-image",
    segments: ["ecommerce"],
    href: "/app/tools/aplus",
    ready: true,
    descriptionKey: "aplusDesc",
  },
  {
    id: "3d-model",
    i18nKey: "3dModel",
    icon: "📦",
    gradient: "from-blue-500/10 to-blue-500/5",
    border: "border-blue-200 hover:border-blue-400 dark:border-blue-800 dark:hover:border-blue-600",
    creditCost: "5-30",
    inputType: "multi-image",
    segments: ["ecommerce", "gaming", "3dprint"],
    href: "/app/tools/3d-model",
    ready: true,
    descriptionKey: "3dModelDesc",
  },
  {
    id: "enhance",
    i18nKey: "enhance",
    icon: "✨",
    gradient: "from-cyan-500/10 to-cyan-500/5",
    border: "border-cyan-200 hover:border-cyan-400 dark:border-cyan-800 dark:hover:border-cyan-600",
    creditCost: 4,
    inputType: "single-image",
    segments: ["ecommerce", "gaming", "3dprint"],
    href: "/app/tools/enhance",
    ready: true,
    descriptionKey: "enhanceDesc",
  },
  {
    id: "video",
    i18nKey: "video",
    icon: "🎬",
    gradient: "from-pink-500/10 to-pink-500/5",
    border: "border-pink-200 hover:border-pink-400 dark:border-pink-800 dark:hover:border-pink-600",
    creditCost: 20,
    inputType: "image-text",
    segments: ["ecommerce"],
    href: "/app/tools/video",
    ready: true,
    descriptionKey: "videoDesc",
  },

  // ── Yeni Araçlar (6) ───────────────────────
  {
    id: "image-edit",
    i18nKey: "imageEdit",
    icon: "🖌️",
    gradient: "from-orange-500/10 to-orange-500/5",
    border: "border-orange-200 hover:border-orange-400 dark:border-orange-800 dark:hover:border-orange-600",
    creditCost: 6,
    inputType: "image-text",
    segments: ["ecommerce", "gaming", "3dprint"],
    href: "/app/tools/image-edit",
    ready: false,
    descriptionKey: "imageEditDesc",
  },
  {
    id: "social-kit",
    i18nKey: "socialKit",
    icon: "📱",
    gradient: "from-indigo-500/10 to-indigo-500/5",
    border: "border-indigo-200 hover:border-indigo-400 dark:border-indigo-800 dark:hover:border-indigo-600",
    creditCost: 40,
    inputType: "pipeline",
    segments: ["ecommerce"],
    href: "/app/tools/social-kit",
    ready: false,
    descriptionKey: "socialKitDesc",
  },
  {
    id: "text-to-image",
    i18nKey: "textToImage",
    icon: "🖼️",
    gradient: "from-emerald-500/10 to-emerald-500/5",
    border: "border-emerald-200 hover:border-emerald-400 dark:border-emerald-800 dark:hover:border-emerald-600",
    creditCost: 4,
    inputType: "text-only",
    segments: ["ecommerce", "gaming", "3dprint"],
    href: "/app/tools/text-to-image",
    ready: false,
    descriptionKey: "textToImageDesc",
  },
  {
    id: "talking-avatar",
    i18nKey: "talkingAvatar",
    icon: "🗣️",
    gradient: "from-purple-500/10 to-purple-500/5",
    border: "border-purple-200 hover:border-purple-400 dark:border-purple-800 dark:hover:border-purple-600",
    creditCost: 25,
    inputType: "image-text-audio",
    segments: ["ecommerce"],
    href: "/app/tools/talking-avatar",
    ready: false,
    descriptionKey: "talkingAvatarDesc",
  },
  {
    id: "logo",
    i18nKey: "logo",
    icon: "💎",
    gradient: "from-teal-500/10 to-teal-500/5",
    border: "border-teal-200 hover:border-teal-400 dark:border-teal-800 dark:hover:border-teal-600",
    creditCost: 8,
    inputType: "text-only",
    segments: ["ecommerce", "gaming", "3dprint"],
    href: "/app/tools/logo",
    ready: false,
    descriptionKey: "logoDesc",
  },
  {
    id: "qr-code",
    i18nKey: "qrCode",
    icon: "📷",
    gradient: "from-slate-500/10 to-slate-500/5",
    border: "border-slate-200 hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600",
    creditCost: "0-6",
    inputType: "text-only",
    segments: ["ecommerce"],
    href: "/app/tools/qr-code",
    ready: false,
    descriptionKey: "qrCodeDesc",
  },
];

/** Get tools visible to a specific segment */
export function getToolsForSegment(segment: SegmentId | null): ToolDefinition[] {
  if (!segment) return TOOLS;
  return TOOLS.filter((t) => t.segments.includes(segment));
}

/** Get only ready (implemented) tools */
export function getReadyTools(): ToolDefinition[] {
  return TOOLS.filter((t) => t.ready);
}

/** Get tools filtered by segment + ready state */
export function getVisibleTools(segment: SegmentId | null, showComingSoon = true): ToolDefinition[] {
  const segmentTools = getToolsForSegment(segment);
  if (showComingSoon) return segmentTools;
  return segmentTools.filter((t) => t.ready);
}

/** Segment display order — ready tools first, coming soon last */
export function getOrderedTools(segment: SegmentId | null): ToolDefinition[] {
  const tools = getToolsForSegment(segment);
  const ready = tools.filter((t) => t.ready);
  const coming = tools.filter((t) => !t.ready);
  return [...ready, ...coming];
}
