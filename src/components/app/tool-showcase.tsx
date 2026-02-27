"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TOOL_CREDITS, TOOL_KEYS, type ToolType } from "@/lib/fal/models";
import { MODELS, TOOL_MODELS } from "@/lib/fal/models";
import { cn } from "@/lib/utils";

const TOOL_ORDER: { tool: ToolType; icon: string; color: string }[] = [
  { tool: "bg-remove", icon: "🧹", color: "from-rose-500/10 to-rose-500/5" },
  { tool: "enhance", icon: "✨", color: "from-amber-500/10 to-amber-500/5" },
  { tool: "scene", icon: "🎬", color: "from-indigo-500/10 to-indigo-500/5" },
  { tool: "3d-model", icon: "📦", color: "from-emerald-500/10 to-emerald-500/5" },
  { tool: "video", icon: "🎥", color: "from-purple-500/10 to-purple-500/5" },
  { tool: "aplus", icon: "⭐", color: "from-cyan-500/10 to-cyan-500/5" },
];

interface ToolShowcaseProps {
  onSelectTool?: (tool: ToolType) => void;
}

export function ToolShowcase({ onSelectTool }: ToolShowcaseProps) {
  const tTools = useTranslations("tools");
  const tFeatures = useTranslations("landing.features");
  const tCredits = useTranslations("credits");

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        {tFeatures("title")}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TOOL_ORDER.map(({ tool, icon, color }) => {
          const toolKey = TOOL_KEYS[tool];
          const cost = TOOL_CREDITS[tool];
          const modelKeys = TOOL_MODELS[tool];
          const firstModel = modelKeys[0] ? MODELS[modelKeys[0]] : null;
          const estimatedTime = firstModel?.estimatedTime ?? "";

          return (
            <Card
              key={tool}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTool?.(tool)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTool?.(tool);
                }
              }}
              className={cn(
                "group cursor-pointer p-4 transition-all border-border/50 shadow-sm hover:shadow-md",
                "hover:border-indigo-300 dark:hover:border-indigo-700",
                "bg-gradient-to-br",
                color
              )}
            >
              <div className="flex flex-col gap-2">
                <span className="text-2xl">{icon}</span>
                <span className="text-sm font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {tTools(toolKey)}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {tFeatures(`${toolKey}.description`)}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {tCredits("cost", { count: cost })}
                  </Badge>
                  {estimatedTime && (
                    <span className="text-[10px] text-muted-foreground">
                      {estimatedTime}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
