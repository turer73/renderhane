"use client";

import { useState } from "react";
import { PhotoUpload } from "@/components/app/photo-upload";
import { ToolShowcase } from "@/components/app/tool-showcase";
import type { ToolType } from "@/lib/fal/models";

/**
 * Client wrapper for the dashboard that connects ToolShowcase → PhotoUpload.
 *
 * When the user clicks a tool card in the showcase, the corresponding
 * tool is pre-selected in the upload form so they only need to add an image.
 */
export function DashboardContent() {
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);

  return (
    <div className="space-y-6">
      {/* Desktop only — mobile uses quick action buttons inside PhotoUpload */}
      <div className="hidden sm:block">
        <ToolShowcase onSelectTool={(tool) => setSelectedTool(tool)} />
      </div>
      <PhotoUpload defaultTool={selectedTool} />
    </div>
  );
}
