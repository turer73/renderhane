"use client";

import { cn } from "@/lib/utils";
import {
  Box,
  Image,
  Video,
  ShoppingBag,
  Palette,
  Eraser,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const toolCategories = [
  {
    id: "3d-model",
    label: "3D Modeller",
    icon: Box,
    tools: ["trellis-v1", "tripo-2.5", "meshy-5", "meshy-6", "hunyuan3d"],
  },
  {
    id: "image",
    label: "Görüntü",
    icon: Image,
    tools: ["bg-remove", "enhance", "text-to-image", "image-edit", "object-removal"],
  },
  {
    id: "video",
    label: "Video",
    icon: Video,
    tools: ["video", "talking-avatar"],
  },
  {
    id: "ecommerce",
    label: "E-ticaret",
    icon: ShoppingBag,
    tools: ["scene", "aplus", "virtual-tryon"],
  },
  {
    id: "design",
    label: "Tasarım",
    icon: Palette,
    tools: ["logo", "qr-code"],
  },
];

interface ToolIconSidebarProps {
  activeTool: string;
  onToolChange: (tool: string) => void;
  layout?: "vertical" | "horizontal";
}

export function ToolIconSidebar({
  activeTool,
  onToolChange,
  layout = "vertical",
}: ToolIconSidebarProps) {
  // Find which category the active tool belongs to
  const activeCategory =
    toolCategories.find((cat) => cat.id === activeTool)?.id ??
    toolCategories.find((cat) => cat.tools.includes(activeTool))?.id ??
    "3d-model";

  const isHorizontal = layout === "horizontal";

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn(
        "flex items-center",
        isHorizontal
          ? "w-full overflow-x-auto gap-1 px-2 py-2 border-b border-border/50"
          : "w-16 flex-col justify-between py-3 px-1.5 border-r border-border/50"
      )}>
        {/* Tool categories */}
        <div className={cn(
          "flex items-center gap-1",
          !isHorizontal && "flex-col"
        )}>
          {toolCategories.map((category) => {
            const Icon = category.icon;
            const isActive = activeCategory === category.id;

            return (
              <Tooltip key={category.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onToolChange(category.id)}
                    className={cn(
                      "relative flex items-center justify-center gap-1 rounded-xl transition-all duration-200",
                      "text-muted-foreground hover:text-foreground hover:bg-accent",
                      isActive && "bg-primary/15 text-primary shadow-sm shadow-primary/10",
                      isHorizontal
                        ? "flex-row px-3 py-2 flex-none"
                        : "flex-col w-12 h-14"
                    )}
                  >
                    {isActive && !isHorizontal && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-primary" />
                    )}
                    {isActive && isHorizontal && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-6 rounded-t-full bg-primary" />
                    )}
                    <Icon className={cn(
                      isHorizontal ? "h-4 w-4" : "h-5 w-5",
                      isActive && "drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]"
                    )} />
                    <span className={cn(
                      "font-medium leading-tight text-center",
                      isHorizontal ? "text-[11px]" : "text-[10px]",
                      isActive && "font-semibold"
                    )}>
                      {category.label.split(" ")[0]}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side={isHorizontal ? "bottom" : "right"} sideOffset={8}>
                  {category.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Bottom spacer (vertical only) */}
        {!isHorizontal && <div />}
      </div>
    </TooltipProvider>
  );
}
