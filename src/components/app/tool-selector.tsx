"use client";

import { useTranslations } from "next-intl";
import { TOOL_CREDITS, TOOL_KEYS, TOOL_MODELS, type ToolType } from "@/lib/fal/models";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TOOL_ORDER: ToolType[] = [
  "3d-model",
  "bg-remove",
  "enhance",
  "scene",
  "video",
  "aplus",
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
              "relative cursor-pointer p-4 transition-colors",
              isSelected && "border-primary ring-2 ring-primary/20",
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
