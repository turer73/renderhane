"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolSelector } from "@/components/app/tool-selector";
import { TOOLS_WITH_PROMPT, type ToolType } from "@/lib/fal/models";

export function PhotoUpload() {
  const t = useTranslations("common");
  const tDash = useTranslations("dashboard");

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [imageSource, setImageSource] = useState<"file" | "url" | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsPrompt = selectedTool && TOOLS_WITH_PROMPT.includes(selectedTool);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return;
    // Revoke previous blob URL to prevent memory leak
    if (preview && imageSource === "file") {
      URL.revokeObjectURL(preview);
    }
    setFile(f);
    setImageSource("file");
    setUrlInput("");
    setMessage(null);
    const objectUrl = URL.createObjectURL(f);
    setPreview(objectUrl);
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
    setMessage(null);
  }

  async function uploadToSupabase(): Promise<string | null> {
    if (imageSource === "url" && preview) {
      return preview;
    }

    if (imageSource === "file" && file) {
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

      if (error) {
        return null;
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("uploads")
        .createSignedUrl(path, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        return null;
      }
      return signedUrlData.signedUrl;
    }

    return null;
  }

  async function handleSubmit() {
    if (!preview || !selectedTool) return;

    setSubmitting(true);
    setMessage(null);

    try {
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
        setMessage({ type: "error", text: tDash("jobError") });
        setSubmitting(false);
        return;
      }

      setMessage({ type: "success", text: tDash("jobStarted") });
      // Notify JobStatus to refetch immediately
      window.dispatchEvent(new CustomEvent("job-submitted"));
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
    <Card>
      <CardHeader>
        <CardTitle>{t("upload")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
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
              className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
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

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {tDash("orPasteUrl")}
              </span>
              <Input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={tDash("urlPlaceholder")}
                className="flex-1"
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
              >
                {tDash("urlConfirm")}
              </Button>
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {tDash("promptLabel")}
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
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
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting}
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
