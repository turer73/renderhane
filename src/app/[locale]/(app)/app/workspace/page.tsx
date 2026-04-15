"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceLayout } from "@/components/workspace";
import { WorkspaceHeader } from "@/components/workspace";
import { JobPollingProvider } from "@/hooks/use-job-polling";

/** Map tool/tab IDs from registry → workspace category */
const TOOL_TO_CATEGORY: Record<string, string> = {
  // Category IDs (identity)
  "3d-model": "3d-model",
  image: "image",
  video: "video",
  ecommerce: "ecommerce",
  design: "design",
  batch: "batch",
  // Specific tool IDs → category
  "bg-remove": "image",
  enhance: "image",
  "text-to-image": "image",
  "image-edit": "image",
  scene: "ecommerce",
  aplus: "ecommerce",
  "virtual-tryon": "ecommerce",
  "social-kit": "ecommerce",
  "talking-avatar": "video",
  logo: "design",
  "qr-code": "design",
};

/** Tool IDs that are also valid tab IDs in ToolFormPanel */
const VALID_TABS = new Set([
  "bg-remove",
  "enhance",
  "text-to-image",
  "image-edit",
  "scene",
  "aplus",
  "virtual-tryon",
  "talking-avatar",
  "logo",
  "qr-code",
]);

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const toolParam = searchParams.get("tool");

  const initialCategory = toolParam
    ? (TOOL_TO_CATEGORY[toolParam] ?? "3d-model")
    : "3d-model";
  const initialTab =
    toolParam && VALID_TABS.has(toolParam) ? toolParam : undefined;

  const [activeTool, setActiveTool] = useState(initialCategory);

  return (
    <JobPollingProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <WorkspaceHeader />
        <WorkspaceLayout
          activeTool={activeTool}
          onToolChange={setActiveTool}
          initialTab={initialTab}
        />
      </div>
    </JobPollingProvider>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense>
      <WorkspaceContent />
    </Suspense>
  );
}
