"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolSelector } from "@/components/app/tool-selector";
import { ScenePresets } from "@/components/app/scene-presets";
import { TOOLS_WITH_PROMPT, type ToolType } from "@/lib/fal/models";
import { resizeImageIfNeeded } from "@/lib/resize-image";

interface PhotoUploadProps {
  defaultTool?: ToolType | null;
}

export function PhotoUpload({ defaultTool }: PhotoUploadProps = {}) {
  const t = useTranslations("common");
  const tDash = useTranslations("dashboard");

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [imageSource, setImageSource] = useState<"file" | "url" | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(defaultTool ?? null);
  const [prompt, setPrompt] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [maintenance, setMaintenance] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync external defaultTool prop into internal state
  useEffect(() => {
    if (defaultTool) {
      setSelectedTool(defaultTool);
    }
  }, [defaultTool]);

  // Check fal.ai service health on mount
  useEffect(() => {
    fetch("/api/health/status")
      .then((res) => res.json())
      .then((data) => {
        if (data?.healthy === false) {
          setMaintenance(true);
        }
      })
      .catch(() => {
        // If health endpoint itself fails, don't block users
      });
  }, []);

  const needsPrompt = selectedTool && TOOLS_WITH_PROMPT.includes(selectedTool);

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith("image/")) return;
    // Revoke previous blob URL to prevent memory leak
    if (preview && imageSource === "file") {
      URL.revokeObjectURL(preview);
    }
    setMessage(null);
    setImageSource("file");
    setUrlInput("");

    try {
      // Auto-resize if exceeds 4096×4096 (fal.ai limit)
      const resized = await resizeImageIfNeeded(f);
      setFile(resized);
      const objectUrl = URL.createObjectURL(resized);
      setPreview(objectUrl);
    } catch {
      // Fallback: use original file if resize fails
      setFile(f);
      const objectUrl = URL.createObjectURL(f);
      setPreview(objectUrl);
    }
  }, [preview, imageSource]);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFile(droppedFile);
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
    const selected = e.target.files?.[0];
    if (selected) {
      handleFile(selected);
    }
  }

  function handleUrlSubmit() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try {
      const parsed = new URL(trimmed);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        setMessage({ type: "error", text: tDash("uploadError") });
        return;
      }
    } catch {
      setMessage({ type: "error", text: tDash("uploadError") });
      return;
    }
    setFile(null);
    setImageSource("url");
    setPreview(trimmed);
    setMessage(null);
  }

  function handleReset() {
    if (preview && imageSource === "file") {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    setFile(null);
    setUrlInput("");
    setImageSource(null);
    setSelectedTool(null);
    setPrompt("");
    setSelectedPresetId(null);
    setMessage(null);
  }

  async function uploadToSupabase(): Promise<string | null> {
    if (imageSource === "url" && preview) {
      // For URL images, we can't easily resize — let the API handle it.
      // The server-side will receive the original URL as-is.
      return preview;
    }

    if (imageSource === "file" && file) {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.error("[upload] Auth failed — user is null");
        return null;
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${timestamp}-${safeName}`;

      const { error } = await supabase.storage
        .from("uploads")
        .upload(path, file, { contentType: file.type });

      if (error) {
        console.error("[upload] Storage upload failed:", error.message, error);
        return null;
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("uploads")
        .createSignedUrl(path, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error("[upload] Signed URL failed:", signedUrlError?.message, signedUrlError);
        return null;
      }
      return signedUrlData.signedUrl;
    }

    console.error("[upload] No file or URL source available");
    return null;
  }

  async function handleSubmit() {
    if (!preview || !selectedTool) return;

    setSubmitting(true);
    setMessage(null);

    try {
      // Defense-in-depth: re-check service health before submitting
      try {
        const healthRes = await fetch("/api/health/status");
        const healthData = await healthRes.json();
        if (healthData?.healthy === false) {
          setMaintenance(true);
          setMessage({ type: "error", text: tDash("maintenanceMessage") });
          setSubmitting(false);
          return;
        }
      } catch {
        // Health check failed — proceed anyway (fail-open)
      }

      const imageUrl = await uploadToSupabase();
      if (!imageUrl) {
        setMessage({ type: "error", text: tDash("uploadError") });
        setSubmitting(false);
        return;
      }

      const payload: Record<string, unknown> = {
        tool: selectedTool,
        imageUrl,
      };

      // Include prompt for tools that support it
      if (needsPrompt && prompt.trim()) {
        payload.prompt = prompt.trim();
      }

      const res = await fetch("/api/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 402) {
        setMessage({ type: "error", text: tDash("insufficientCredits") });
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        // Try to extract the actual error message from the API response
        let errorText = tDash("jobError");
        try {
          const errBody = await res.json();
          if (errBody?.error && typeof errBody.error === "string") {
            errorText = errBody.error;
          }
        } catch {
          // Ignore parse errors — use the generic message
        }
        setMessage({ type: "error", text: errorText });
        setSubmitting(false);
        return;
      }

      const result = await res.json();

      // Notify JobStatus to refetch + ProcessingModal to open
      window.dispatchEvent(
        new CustomEvent("job-submitted", {
          detail: { jobId: result.jobId, tool: selectedTool },
        })
      );
      // Reset form after successful submission
      handleReset();
    } catch {
      setMessage({ type: "error", text: tDash("jobError") });
    } finally {
      setSubmitting(false);
    }
  }

  function getPromptPlaceholder(): string {
    switch (selectedTool) {
      case "scene":
        return tDash("promptPlaceholderScene");
      case "video":
        return tDash("promptPlaceholderVideo");
      case "aplus":
        return tDash("promptPlaceholderAplus");
      default:
        return "";
    }
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
          </div>
          {t("upload")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Maintenance Banner */}
        {maintenance && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {tDash("maintenanceTitle")}
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  {tDash("maintenanceMessage")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Area */}
        {!preview ? (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all ${
                dragOver
                  ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/5"
                  : "border-muted-foreground/25 hover:border-indigo-400/50 hover:bg-muted/30"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mb-4 text-muted-foreground"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              <p className="text-sm text-muted-foreground">
                {tDash("dragDrop")}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">
                {tDash("orPasteUrl")}
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={tDash("urlPlaceholder")}
                  className="flex-1 min-w-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleUrlSubmit();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim()}
                  className="shrink-0"
                >
                  {tDash("urlConfirm")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Preview */
          <div className="space-y-3">
            <div className="relative mx-auto max-w-sm overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={tDash("imageSelected")}
                className="h-auto w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">
                {tDash("imageSelected")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
              >
                {tDash("changeImage")}
              </Button>
            </div>
          </div>
        )}

        {/* Tool Selector */}
        {preview && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {tDash("selectTool")}
            </h3>
            <ToolSelector selectedTool={selectedTool} onSelect={setSelectedTool} />
          </div>
        )}

        {/* Prompt Input — shown for scene, video, aplus tools */}
        {preview && needsPrompt && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              {tDash("promptLabel")}
            </label>

            {/* Scene Presets — only for scene & aplus tools */}
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
                // Clear preset highlight when user types manually
                setSelectedPresetId(null);
              }}
              placeholder={getPromptPlaceholder()}
              rows={2}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {tDash("promptHint")}
            </p>
          </div>
        )}

        {/* Submit Button */}
        {preview && selectedTool && (
          <Button
            type="button"
            className="w-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
            onClick={handleSubmit}
            disabled={submitting || maintenance}
          >
            {submitting ? tDash("submitting") : tDash("submit")}
          </Button>
        )}

        {/* Messages */}
        {message && (
          <p
            className={`text-center text-sm ${
              message.type === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
