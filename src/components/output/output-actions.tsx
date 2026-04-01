"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

export function OutputActions({ imageUrl, tools }: OutputActionsProps) {
  const t = useTranslations("output");
  const tTools = useTranslations("tools");
  const tCredits = useTranslations("credits");
  const tDash = useTranslations("dashboard");

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
