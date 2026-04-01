"use client";

import { useTranslations } from "next-intl";
import { TOOL_CREDITS, TOOL_KEYS, TOOL_MODELS, type ToolType } from "@/lib/fal/models";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Tools available for batch processing — ordered by batch relevance.
 *  Text-only tools (text-to-image, logo, qr-code) and pipeline tools
 *  (talking-avatar, social-kit) are excluded as they don't take image input
 *  or have multi-step flows.
 */
const TOOL_ORDER: ToolType[] = [
  "bg-remove",
  "enhance",
  "scene",
  "aplus",
  "3d-model",
  "video",
  "image-edit",
];

interface ToolSelectorProps {
  selectedTool: ToolType | null;
  onSelect: (tool: ToolType) => void;
}

export function ToolSelector({ selectedTool, onSelect }: ToolSelectorProps) {
  const tTools = useTranslations("tools");
  const tCredits = useTranslations("credits");
  const tDashboard = useTranslations("dashboard");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {TOOL_ORDER.map((tool) => {
        const isAvailable = TOOL_MODELS[tool].length > 0;
        const isSelected = selectedTool === tool;
        const creditCost = TOOL_CREDITS[tool];
        const toolKey = TOOL_KEYS[tool];

        return (
          <Card
            key={tool}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            onClick={() => {
              if (isAvailable) {
                onSelect(tool);
              }
            }}
            onKeyDown={(e) => {
              if (isAvailable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect(tool);
              }
            }}
            className={cn(
              "relative cursor-pointer p-4 transition-all border-border/50 shadow-sm hover:shadow-md",
              isSelected && "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-500/5",
              !isSelected && isAvailable && "hover:border-indigo-300 dark:hover:border-indigo-700",
              !isAvailable && "cursor-not-allowed opacity-50"
            )}
          >
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{tTools(toolKey)}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {tCredits("cost", { count: creditCost })}
                </Badge>
                {!isAvailable && (
                  <Badge variant="outline" className="text-xs">
                    {tDashboard("comingSoon")}
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
