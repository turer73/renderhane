"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ToolSelector } from "@/components/app/tool-selector";
import { ScenePresets } from "@/components/app/scene-presets";
import {
  TOOL_CREDITS,
  TOOLS_WITH_PROMPT,
  type ToolType,
} from "@/lib/fal/models";

/* ── Constants ── */
const MAX_IMAGES = 20;
const MAX_DIMENSION = 2048;

/* ── Resize helper (same as photo-upload) ── */
async function resizeImageIfNeeded(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;

      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        resolve(file);
        return;
      }

      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      const newW = Math.round(width * scale);
      const newH = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, newW, newH);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"));
            return;
          }
          const resized = new File([blob], file.name, {
            type: file.type || "image/png",
            lastModified: Date.now(),
          });
          resolve(resized);
        },
        file.type || "image/png",
        0.92
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };

    img.src = url;
  });
}

interface BatchImage {
  id: string;
  file: File;
  preview: string;
  name: string;
}

type BatchStatus = "idle" | "uploading" | "processing" | "done";

interface BatchResult {
  imageId: string;
  success: boolean;
  error?: string;
}

export function BatchUpload() {
  const t = useTranslations("batch");
  const tDash = useTranslations("dashboard");
  const tCredits = useTranslations("credits");

  const [images, setImages] = useState<BatchImage[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [status, setStatus] = useState<BatchStatus>("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsPrompt = selectedTool && TOOLS_WITH_PROMPT.includes(selectedTool);

  const totalCost = images.length * (selectedTool ? TOOL_CREDITS[selectedTool] : 0);

  /* ── File handling ── */
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );

      if (images.length + fileArray.length > MAX_IMAGES) {
        setMessage({ type: "error", text: t("maxImages", { max: MAX_IMAGES }) });
        return;
      }

      setMessage(null);

      const newImages: BatchImage[] = [];
      for (const f of fileArray) {
        try {
          const resized = await resizeImageIfNeeded(f);
          newImages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file: resized,
            preview: URL.createObjectURL(resized),
            name: f.name,
          });
        } catch {
          newImages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file: f,
            preview: URL.createObjectURL(f),
            name: f.name,
          });
        }
      }

      setImages((prev) => [...prev, ...newImages]);
    },
    [images.length, t]
  );

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      addFiles(e.target.files);
      // Reset input so same file can be re-selected
      e.target.value = "";
    }
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  function clearAll() {
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    setSelectedTool(null);
    setPrompt("");
    setSelectedPresetId(null);
    setResults([]);
    setMessage(null);
    setStatus("idle");
    setCurrentIndex(0);
  }

  /* ── Upload a single file to Supabase ── */
  async function uploadToSupabase(file: File): Promise<string | null> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${timestamp}-${safeName}`;

    const { error } = await supabase.storage
      .from("uploads")
      .upload(path, file, { contentType: file.type });

    if (error) return null;

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage.from("uploads").createSignedUrl(path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) return null;
    return signedUrlData.signedUrl;
  }

  /* ── Submit batch ── */
  async function handleSubmit() {
    if (!images.length) {
      setMessage({ type: "error", text: t("noImages") });
      return;
    }
    if (!selectedTool) {
      setMessage({ type: "error", text: t("noTool") });
      return;
    }

    setStatus("uploading");
    setMessage(null);
    setResults([]);
    setCurrentIndex(0);

    const batchResults: BatchResult[] = [];

    for (let i = 0; i < images.length; i++) {
      setCurrentIndex(i + 1);
      const img = images[i];

      try {
        // Upload to Supabase
        const imageUrl = await uploadToSupabase(img.file);
        if (!imageUrl) {
          batchResults.push({
            imageId: img.id,
            success: false,
            error: "Upload failed",
          });
          continue;
        }

        // Submit job
        const payload: Record<string, unknown> = {
          tool: selectedTool,
          imageUrl,
        };

        if (needsPrompt && prompt.trim()) {
          payload.prompt = prompt.trim();
        }

        const res = await fetch("/api/jobs/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status === 402) {
          batchResults.push({
            imageId: img.id,
            success: false,
            error: "Insufficient credits",
          });
          // Stop further submissions — out of credits
          for (let j = i + 1; j < images.length; j++) {
            batchResults.push({
              imageId: images[j].id,
              success: false,
              error: "Skipped — insufficient credits",
            });
          }
          break;
        }

        if (!res.ok) {
          batchResults.push({
            imageId: img.id,
            success: false,
            error: "Job submission failed",
          });
          continue;
        }

        batchResults.push({ imageId: img.id, success: true });
      } catch {
        batchResults.push({
          imageId: img.id,
          success: false,
          error: "Unexpected error",
        });
      }
    }

    setResults(batchResults);
    setStatus("done");

    const successCount = batchResults.filter((r) => r.success).length;
    const failedCount = batchResults.length - successCount;

    if (failedCount === 0) {
      setMessage({ type: "success", text: t("completed") });
    } else {
      setMessage({
        type: "warning",
        text: t("partialError", {
          success: successCount,
          total: batchResults.length,
          failed: failedCount,
        }),
      });
    }

    // Notify JobStatus to refetch
    window.dispatchEvent(new CustomEvent("job-submitted"));
  }

  const progressPercent =
    status === "done"
      ? 100
      : images.length > 0
        ? (currentIndex / images.length) * 100
        : 0;

  const isProcessing = status === "uploading" || status === "processing";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* Upload Area */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-indigo-600 dark:text-indigo-400"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 8v8" />
                  <path d="M8 12h8" />
                </svg>
              </div>
              <span>
                {images.length > 0
                  ? t("imageCount", { count: images.length })
                  : t("dragDropMulti")}
              </span>
            </div>
            {images.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={isProcessing}
                className="text-muted-foreground"
              >
                {t("clear")}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all ${
              dragOver
                ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/5"
                : "border-muted-foreground/25 hover:border-indigo-400/50 hover:bg-muted/30"
            } ${isProcessing ? "pointer-events-none opacity-50" : ""}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-2 text-muted-foreground"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            <p className="text-sm text-muted-foreground">
              {images.length > 0 ? t("addMore") : t("dragDropMulti")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* Image Grid */}
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {images.map((img) => {
                const result = results.find((r) => r.imageId === img.id);
                return (
                  <div key={img.id} className="group relative">
                    <div
                      className={`relative aspect-square overflow-hidden rounded-lg border ${
                        result
                          ? result.success
                            ? "border-green-500 ring-2 ring-green-500/20"
                            : "border-red-500 ring-2 ring-red-500/20"
                          : "border-border/50"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.preview}
                        alt={img.name}
                        className="h-full w-full object-cover"
                      />

                      {/* Success/Error overlay */}
                      {result && (
                        <div
                          className={`absolute inset-0 flex items-center justify-center ${
                            result.success
                              ? "bg-green-500/20"
                              : "bg-red-500/20"
                          }`}
                        >
                          {result.success ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-green-600"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-red-600"
                            >
                              <line x1="18" x2="6" y1="6" y2="18" />
                              <line x1="6" x2="18" y1="6" y2="18" />
                            </svg>
                          )}
                        </div>
                      )}

                      {/* Remove button */}
                      {!isProcessing && status !== "done" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(img.id);
                          }}
                          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
                          aria-label={t("removeImage")}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" x2="6" y1="6" y2="18" />
                            <line x1="6" x2="18" y1="6" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {img.name}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tool Selection + Prompt */}
      {images.length > 0 && status !== "done" && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="space-y-5 p-5">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t("selectToolAll")}
              </h3>
              <ToolSelector
                selectedTool={selectedTool}
                onSelect={setSelectedTool}
              />
            </div>

            {/* Prompt — for scene/video/aplus */}
            {needsPrompt && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">
                  {tDash("promptLabel")}
                </label>

                {(selectedTool === "scene" || selectedTool === "aplus") && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      {tDash("presetHint")}
                    </p>
                    <ScenePresets
                      selectedPresetId={selectedPresetId}
                      onSelect={(presetPrompt, presetId) => {
                        setPrompt(presetPrompt);
                        setSelectedPresetId(presetId);
                      }}
                    />
                  </div>
                )}

                <Textarea
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setSelectedPresetId(null);
                  }}
                  placeholder={
                    selectedTool === "scene"
                      ? tDash("promptPlaceholderScene")
                      : selectedTool === "video"
                        ? tDash("promptPlaceholderVideo")
                        : tDash("promptPlaceholderAplus")
                  }
                  rows={2}
                  className="resize-none"
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  {tDash("promptHint")}
                </p>
              </div>
            )}

            {/* Cost summary + Submit */}
            {selectedTool && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {t("totalCost")}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-xs"
                    >
                      {images.length} × {TOOL_CREDITS[selectedTool]}{" "}
                      {tCredits("cost", { count: "" }).replace(/^\d*\s*/, "")}
                    </Badge>
                  </div>
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {totalCost} {tCredits("cost", { count: "" }).replace(/^\d*\s*/, "")}
                  </span>
                </div>

                <Button
                  type="button"
                  className="w-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                  onClick={handleSubmit}
                  disabled={isProcessing}
                >
                  {isProcessing
                    ? t("processing", {
                        current: currentIndex,
                        total: images.length,
                      })
                    : t("startBatch")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Progress bar */}
      {(isProcessing || status === "done") && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {status === "done"
                  ? t("completed")
                  : t("processing", {
                      current: currentIndex,
                      total: images.length,
                    })}
              </span>
              <span className="text-muted-foreground">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />

            {status === "done" && (
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={clearAll}
              >
                {t("clear")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Message */}
      {message && (
        <p
          className={`text-center text-sm ${
            message.type === "success"
              ? "text-green-600"
              : message.type === "warning"
                ? "text-amber-600"
                : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
