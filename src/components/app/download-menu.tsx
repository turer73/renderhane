"use client";

import type { Group, Mesh, Material } from "three";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OutputType = "glb" | "image" | "video";

interface DownloadMenuProps {
  url: string;
  outputType: OutputType;
  fileName?: string;
  /** Renders as a small icon-only trigger — for tight layouts like gallery cards */
  compact?: boolean;
}

interface FormatOption {
  label: string;
  ext: string;
  mime: string;
}

const IMAGE_FORMATS: FormatOption[] = [
  { label: "PNG", ext: "png", mime: "image/png" },
  { label: "JPEG", ext: "jpg", mime: "image/jpeg" },
  { label: "WebP", ext: "webp", mime: "image/webp" },
];

// GLB label uses a translation key resolved inside the component
const MODEL_FORMATS: FormatOption[] = [
  { label: "$$glbOriginal$$", ext: "glb", mime: "model/gltf-binary" },
  { label: "STL", ext: "stl", mime: "model/stl" },
  { label: "OBJ", ext: "obj", mime: "text/plain" },
  { label: "GLTF", ext: "gltf", mime: "model/gltf+json" },
];

export function DownloadMenu({ url, outputType, fileName = "renderhane", compact = false }: DownloadMenuProps) {
  const t = useTranslations("dashboard");
  const [downloading, setDownloading] = useState<string | null>(null);

  const formats = outputType === "glb" ? MODEL_FORMATS
    : outputType === "image" ? IMAGE_FORMATS
    : null;

  // If no format options (video etc.), show a simple download button
  if (!formats) {
    if (compact) {
      return (
        <Button type="button" variant="ghost" size="icon-xs" asChild>
          <a href={url} download target="_blank" rel="noopener noreferrer" title={t("viewResult")}>
            <DownloadIcon className="h-3 w-3" />
          </a>
        </Button>
      );
    }
    return (
      <Button type="button" variant="outline" size="sm" asChild>
        <a href={url} download target="_blank" rel="noopener noreferrer">
          <DownloadIcon />
          {t("viewResult")}
        </a>
      </Button>
    );
  }

  async function handleDownload(format: FormatOption) {
    setDownloading(format.ext);
    try {
      if (outputType === "image") {
        await downloadImageAs(url, format, fileName);
      } else if (outputType === "glb") {
        if (format.ext === "glb") {
          // Direct download — no conversion needed
          await downloadDirect(url, `${fileName}.glb`);
        } else {
          await downloadModelAs(url, format, fileName);
        }
      }
    } catch (err) {
      console.error("Download error:", err);
      toast.error(t("downloadFailed"));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button type="button" variant="ghost" size="icon-xs" disabled={downloading !== null} title={t("viewResult")}>
            {downloading ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent dark:border-indigo-400" />
            ) : (
              <DownloadIcon className="h-3 w-3" />
            )}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={downloading !== null}>
            {downloading ? (
              <div className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent dark:border-indigo-400" />
            ) : (
              <DownloadIcon />
            )}
            {downloading ? `${downloading.toUpperCase()}…` : t("viewResult")}
            <ChevronDownIcon />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("formatSelect")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {formats.map((format) => (
          <DropdownMenuItem
            key={format.ext}
            onClick={() => handleDownload(format)}
            disabled={downloading !== null}
            className="cursor-pointer"
          >
            <span className="font-mono text-xs font-medium w-12">
              .{format.ext}
            </span>
            <span className="text-sm">
              {format.label.startsWith("$$") ? t("glbOriginal") : format.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Image conversion via Canvas API ───────────────────────

async function downloadImageAs(url: string, format: FormatOption, baseName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);

  const quality = format.ext === "png" ? undefined : 0.92;
  const outputBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      format.mime,
      quality
    );
  });

  triggerDownload(outputBlob, `${baseName}.${format.ext}`);
  bitmap.close();
}

// ─── 3D model conversion via Three.js exporters ───────────

async function downloadModelAs(url: string, format: FormatOption, baseName: string) {
  // Dynamic imports to avoid bundling Three.js exporters eagerly
  await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");

  // Load the GLB
  const gltf = await new Promise<{ scene: Group }>((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });

  const scene = gltf.scene;

  let outputBlob: Blob;

  switch (format.ext) {
    case "stl": {
      const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
      const exporter = new STLExporter();
      const stlBinary = exporter.parse(scene, { binary: true });
      outputBlob = new Blob([stlBinary], { type: "application/octet-stream" });
      break;
    }
    case "obj": {
      const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
      const exporter = new OBJExporter();
      const objString = exporter.parse(scene);
      outputBlob = new Blob([objString], { type: "text/plain" });
      break;
    }
    case "gltf": {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      const exporter = new GLTFExporter();
      const gltfData = await exporter.parseAsync(scene);
      const jsonStr = JSON.stringify(gltfData, null, 2);
      outputBlob = new Blob([jsonStr], { type: "application/json" });
      break;
    }
    default:
      throw new Error(`Unsupported format: ${format.ext}`);
  }

  triggerDownload(outputBlob, `${baseName}.${format.ext}`);

  // Clean up Three.js resources
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) (mat as Material).dispose();
    }
  });
}

// ─── Direct download (no conversion) ──────────────────────

async function downloadDirect(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const blob = await response.blob();
  triggerDownload(blob, filename);
}

// ─── Trigger browser download ──────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

// ─── Icons ─────────────────────────────────────────────────

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? "mr-1"}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
