"use client";

import dynamic from "next/dynamic";

const ModelViewer = dynamic(
  () => import("@/components/viewer/model-viewer").then((m) => m.ModelViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    ),
  }
);

interface EmbedViewerProps {
  url: string;
}

export function EmbedViewer({ url }: EmbedViewerProps) {
  return <ModelViewer url={url} className="h-full w-full" />;
}
