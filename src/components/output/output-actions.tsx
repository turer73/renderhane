"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScenePresets } from "@/components/app/scene-presets";
import { TOOL_KEYS, TOOL_CREDITS, TOOLS_WITH_PROMPT, type ToolType } from "@/lib/fal/models";

const TOOL_STYLES: Record<string, { icon: string; color: string; border: string; hover: string }> = {
  "bg-remove": { icon: "🧹", color: "from-rose-500/10 to-rose-500/5", border: "border-rose-200 dark:border-rose-800", hover: "hover:border-rose-400 dark:hover:border-rose-600" },
  "enhance": { icon: "✨", color: "from-amber-500/10 to-amber-500/5", border: "border-amber-200 dark:border-amber-800", hover: "hover:border-amber-400 dark:hover:border-amber-600" },
  "scene": { icon: "🎬", color: "from-indigo-500/10 to-indigo-500/5", border: "border-indigo-200 dark:border-indigo-800", hover: "hover:border-indigo-400 dark:hover:border-indigo-600" },
  "3d-model": { icon: "📦", color: "from-emerald-500/10 to-emerald-500/5", border: "border-emerald-200 dark:border-emerald-800", hover: "hover:border-emerald-400 dark:hover:border-emerald-600" },
  "video": { icon: "🎥", color: "from-purple-500/10 to-purple-500/5", border: "border-purple-200 dark:border-purple-800", hover: "hover:border-purple-400 dark:hover:border-purple-600" },
  "aplus": { icon: "⭐", color: "from-cyan-500/10 to-cyan-500/5", border: "border-cyan-200 dark:border-cyan-800", hover: "hover:border-cyan-400 dark:hover:border-cyan-600" },
};

interface ToolOption {
  tool: ToolType;
  icon: string;
}

interface OutputActionsProps {
  imageUrl: string;
  tools: ToolOption[];
  creditCosts: Record<ToolType, number>;
}

export function OutputActions({ imageUrl, tools, creditCosts }: OutputActionsProps) {
  const t = useTranslations("output");
  const tTools = useTranslations("tools");
  const tCredits = useTranslations("credits");
  const tDash = useTranslations("dashboard");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [submitting, setSubmitting] = useState<string | null>(null);

  // Dialog state for tools that need a prompt
  const [dialogTool, setDialogTool] = useState<ToolType | null>(null);
  const [dialogPrompt, setDialogPrompt] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  async function handleSubmit(tool: ToolType, prompt?: string) {
    setSubmitting(tool);
    try {
      // A+ uses dedicated multi-scene endpoint (4 scenes, 32 credits)
      const isAplus = tool === "aplus";
      const endpoint = isAplus ? "/api/jobs/submit-aplus" : "/api/jobs/submit";

      const payload: Record<string, unknown> = isAplus
        ? { imageUrl }
        : { tool, imageUrl, ...(prompt?.trim() ? { prompt: prompt.trim() } : {}) };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.error === "insufficient_credits") {
          toast.error(tCredits("insufficient"));
        } else {
          toast.error(t("errorSubmit"));
        }
        return;
      }

      toast.success(t("started"));

      if (typeof window !== "undefined") {
        if (isAplus && data?.jobIds) {
          window.dispatchEvent(
            new CustomEvent("job-submitted", {
              detail: { jobIds: data.jobIds, tool },
            })
          );
        } else if (data?.jobId) {
          window.dispatchEvent(
            new CustomEvent("job-submitted", {
              detail: { jobId: data.jobId, tool },
            })
          );
        }
      }
    } catch {
      toast.error(t("errorSubmit"));
    } finally {
      setSubmitting(null);
      setDialogTool(null);
      setDialogPrompt("");
      setSelectedPresetId(null);
    }
  }

  function handleToolClick(tool: ToolType) {
    if (TOOLS_WITH_PROMPT.includes(tool)) {
      // Open prompt dialog for scene/video/aplus
      setDialogTool(tool);
      setDialogPrompt("");
      setSelectedPresetId(null);
    } else {
      // Direct submit for bg-remove, enhance, 3d-model
      handleSubmit(tool);
    }
  }

  function getPlaceholder(): string {
    switch (dialogTool) {
      case "scene":
        return tDash("promptPlaceholderScene");
      case "aplus":
        return tDash("promptPlaceholderAplus");
      case "video":
        return tDash("promptPlaceholderVideo");
      default:
        return "";
    }
  }

  const showPresets = dialogTool === "scene" || dialogTool === "aplus";

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tools.map(({ tool }) => {
          const toolKey = TOOL_KEYS[tool];
          const cost = TOOL_CREDITS[tool];
          const isActive = submitting === tool;
          const isDisabled = submitting !== null;
          const style = TOOL_STYLES[tool] || TOOL_STYLES["enhance"];

          return (
            <button
              key={tool}
              type="button"
              disabled={isDisabled}
              onClick={() => handleToolClick(tool)}
              className={`flex flex-col gap-1.5 rounded-2xl border bg-gradient-to-br p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 ${style.color} ${style.border} ${style.hover} hover:shadow-md`}
            >
              {isActive ? (
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent dark:border-indigo-400" />
              ) : (
                <span className="text-2xl">{style.icon}</span>
              )}
              <span className="text-sm font-semibold">{tTools(toolKey)}</span>
              <span className="text-xs text-muted-foreground">
                {cost} {tCredits("cost", { count: "" }).replace(/^\d*\s*/, "")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Prompt Dialog for scene/video/aplus tools */}
      <Dialog
        open={dialogTool !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogTool(null);
            setDialogPrompt("");
            setSelectedPresetId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tDash("presetDialogTitle")}</DialogTitle>
            <DialogDescription>
              {tDash("promptLabel")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Scene Presets for scene & aplus */}
            {showPresets && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {tDash("presetHint")}
                </p>
                <ScenePresets
                  selectedPresetId={selectedPresetId}
                  onSelect={(presetPrompt, presetId) => {
                    setDialogPrompt(presetPrompt);
                    setSelectedPresetId(presetId);
                  }}
                />
              </div>
            )}

            <Textarea
              value={dialogPrompt}
              onChange={(e) => {
                setDialogPrompt(e.target.value);
                setSelectedPresetId(null);
              }}
              placeholder={getPlaceholder()}
              rows={2}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {tDash("promptHint")}
            </p>
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm sm:w-auto"
              onClick={() => dialogTool && handleSubmit(dialogTool, dialogPrompt)}
              disabled={submitting !== null}
            >
              {submitting ? tDash("submitting") : tDash("presetDialogSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ToolIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "cube":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case "eraser":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        </svg>
      );
    case "sparkles":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
      );
    case "image":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      );
    case "video":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      );
    case "star":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
        </svg>
      );
    default:
      return null;
  }
}
