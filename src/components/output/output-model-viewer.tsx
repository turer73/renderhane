"use client";

import dynamic from "next/dynamic";

const ModelViewer = dynamic(
  () =>
    import("@/components/viewer/model-viewer").then((mod) => mod.ModelViewer),
  { ssr: false }
);

interface OutputModelViewerProps {
  url: string;
}

/**
 * Lazy-loaded 3D viewer wrapper for the output detail page.
 * Uses dynamic import with SSR disabled since Three.js requires browser APIs.
 */
export function OutputModelViewer({ url }: OutputModelViewerProps) {
  return <ModelViewer url={url} className="h-[400px] w-full" autoRotate />;
}
