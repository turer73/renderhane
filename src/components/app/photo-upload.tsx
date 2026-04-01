"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScenePresets } from "@/components/app/scene-presets";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TOOLS_WITH_PROMPT, TOOLS_MULTI_IMAGE, MAX_MULTI_IMAGES, TOOL_KEYS, TOOL_CREDITS, type ToolType } from "@/lib/fal/models";
import { resizeImageIfNeeded } from "@/lib/resize-image";
import { extractFrames } from "@/lib/extract-frames";
import { VideoRecorder } from "@/components/app/video-recorder";
import { Video, Upload } from "lucide-react";

interface MultiImage {
  id: string;
  file: File;
  preview: string;
  name: string;
}

/** 10 MB — reject anything larger before uploading to Supabase */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface PhotoUploadProps {
  /** Pre-select a tool — used when navigating from /app/tools/<id> */
  defaultTool?: ToolType;
  /** Hide the tool selection cards (used on dedicated tool pages) */
  hideToolCards?: boolean;
}

export function PhotoUpload({ defaultTool, hideToolCards }: PhotoUploadProps = {}) {
  const t = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  // Single-image state (for non-3D tools)
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [imageSource, setImageSource] = useState<"file" | "url" | null>(null);

  // Multi-image state (for 3D tools)
  const [multiImages, setMultiImages] = useState<MultiImage[]>([]);

  const [selectedTool, setSelectedTool] = useState<ToolType | null>(defaultTool ?? null);
  const [prompt, setPrompt] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [userSegment, setUserSegment] = useState<string | null>(null);

  // Video-to-3D state
  const [inputMode, setInputMode] = useState<"photo" | "video">("photo");
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const multiCameraInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  const isMultiImageTool = selectedTool ? TOOLS_MULTI_IMAGE.includes(selectedTool) : false;

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      if (preview && imageSource === "file") {
        URL.revokeObjectURL(preview);
      }
      multiImages.forEach((img) => URL.revokeObjectURL(img.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // When switching TO a multi-image tool and a single image exists,
  // migrate it to the multi-image list
  useEffect(() => {
    if (isMultiImageTool && file && imageSource === "file" && multiImages.length === 0) {
      const newPreview = URL.createObjectURL(file);
      setMultiImages([{
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: newPreview,
        name: file.name,
      }]);
      // Clear single-image state
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setFile(null);
      setImageSource(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiImageTool]);

  // Check fal.ai service health + fetch user segment on mount
  useEffect(() => {
    fetch("/api/health/status")
      .then((res) => res.json())
      .then((data) => {
        if (data?.healthy === false) setMaintenance(true);
      })
      .catch(() => {});
    fetch("/api/credits/balance")
      .then((res) => res.json())
      .then((data) => {
        if (data?.useCase) setUserSegment(data.useCase);
      })
      .catch(() => {});
  }, []);

  const needsPrompt = selectedTool && TOOLS_WITH_PROMPT.includes(selectedTool);

  // Whether there's any image ready (single or multi)
  const hasImage = isMultiImageTool ? multiImages.length > 0 : !!preview;

  /* ── Single-image handlers ── */
  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith("image/")) return;
    if (f.size > MAX_FILE_SIZE) {
      setMessage({ type: "error", text: tDash("fileTooLarge") });
      return;
    }
    // Revoke previous blob URL to prevent memory leak
    if (preview && imageSource === "file") {
      URL.revokeObjectURL(preview);
    }
    setMessage(null);
    setImageSource("file");
    setUrlInput("");

    try {
      const resized = await resizeImageIfNeeded(f);
      setFile(resized);
      setPreview(URL.createObjectURL(resized));
    } catch {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  }, [preview, imageSource]);

  /* ── Multi-image handlers ── */
  async function addMultiFiles(files: FileList | File[]) {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (multiImages.length + fileArray.length > MAX_MULTI_IMAGES) {
      setMessage({ type: "error", text: tDash("maxViews", { max: MAX_MULTI_IMAGES }) });
      return;
    }
    setMessage(null);
    const newImages: MultiImage[] = [];
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
    setMultiImages((prev) => [...prev, ...newImages]);
  }

  function removeMultiImage(id: string) {
    setMultiImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  /* ── Shared handlers ── */
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (isMultiImageTool) {
      if (e.dataTransfer.files.length) addMultiFiles(e.dataTransfer.files);
    } else {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
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
    if (selected) handleFile(selected);
  }

  function handleMultiFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      addMultiFiles(e.target.files);
      e.target.value = "";
    }
  }

  function handleCameraInput(e: React.ChangeEvent<HTMLInputElement>) {
    const captured = e.target.files?.[0];
    if (captured) {
      if (isMultiImageTool) {
        addMultiFiles([captured]);
      } else {
        handleFile(captured);
      }
    }
    e.target.value = "";
  }

  /* ── Video file handler (desktop) ── */
  async function handleVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const videoFile = e.target.files?.[0];
    if (!videoFile) return;
    e.target.value = "";
    setMessage(null);
    try {
      const frames = await extractFrames(videoFile, MAX_MULTI_IMAGES);
      addMultiFiles(frames);
    } catch {
      setMessage({ type: "error", text: tDash("uploadError") });
    }
  }

  /* ── Video recorder callback ── */
  function handleVideoFrames(frames: File[]) {
    setShowVideoRecorder(false);
    addMultiFiles(frames);
  }

  async function handleUrlSubmit() {
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

    setMessage(null);
    setSubmitting(true);

    // Download via server proxy and upload to Supabase — gives us a working preview URL
    try {
      const res = await fetch("/api/upload/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) {
        setMessage({ type: "error", text: tDash("uploadError") });
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      if (!data.signedUrl) {
        setMessage({ type: "error", text: tDash("uploadError") });
        setSubmitting(false);
        return;
      }
      // Use the Supabase signed URL as preview — always loads
      setFile(null);
      setImageSource("url");
      setPreview(data.signedUrl);
    } catch {
      setMessage({ type: "error", text: tDash("uploadError") });
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    if (preview && imageSource === "file") URL.revokeObjectURL(preview);
    multiImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setPreview(null);
    setFile(null);
    setUrlInput("");
    setImageSource(null);
    setMultiImages([]);
    setSelectedTool(null);
    setPrompt("");
    setSelectedPresetId(null);
    setMessage(null);
  }

  /* ── Upload helpers ── */
  async function uploadFileToSupabase(f: File): Promise<string | null> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const timestamp = Date.now();
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${timestamp}-${safeName}`;

    const { error } = await supabase.storage
      .from("uploads")
      .upload(path, f, { contentType: f.type });
    if (error) return null;

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("uploads")
      .createSignedUrl(path, 3600);
    if (signedUrlError || !signedUrlData?.signedUrl) return null;
    return signedUrlData.signedUrl;
  }

  async function uploadSingleImage(): Promise<string | null> {
    if (imageSource === "url" && preview) {
      // preview is already a Supabase signed URL (uploaded during handleUrlSubmit)
      return preview;
    }
    if (imageSource === "file" && file) return uploadFileToSupabase(file);
    return null;
  }

  async function uploadMultiImages(): Promise<string[] | null> {
    const urls: string[] = [];
    for (const img of multiImages) {
      const url = await uploadFileToSupabase(img.file);
      if (!url) return null;
      urls.push(url);
    }
    return urls;
  }

  /* ── Submit ── */
  async function handleSubmit(quickTool?: ToolType, tier?: "fast" | "standard" | "premium") {
    const activeTool = quickTool || selectedTool;
    const anyImage = preview || multiImages.length > 0;
    if (!anyImage || !activeTool) return;

    // Image edit requires a prompt — user must describe what to change
    if (activeTool === "image-edit" && !prompt.trim()) {
      setMessage({ type: "error", text: locale === "tr" ? "Lütfen düzenleme talimatı yazın." : "Please describe what to edit." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      // Health check
      try {
        const healthRes = await fetch("/api/health/status");
        const healthData = await healthRes.json();
        if (healthData?.healthy === false) {
          setMaintenance(true);
          setMessage({ type: "error", text: tDash("maintenanceMessage") });
          setSubmitting(false);
          return;
        }
      } catch { /* fail-open */ }

      // Determine if this tool needs multi-image based on activeTool (not state)
      const activeIsMulti = TOOLS_MULTI_IMAGE.includes(activeTool);

      // Upload image(s)
      let uploadedImageUrl: string | undefined;
      let uploadedImageUrls: string[] | undefined;

      if (activeIsMulti && multiImages.length > 0) {
        const urls = await uploadMultiImages();
        if (!urls) {
          setMessage({ type: "error", text: tDash("uploadError") });
          setSubmitting(false);
          return;
        }
        uploadedImageUrls = urls;
      } else {
        // Single image — also wrap in array if tool requires imageUrls
        const url = await uploadSingleImage();
        if (!url) {
          setMessage({ type: "error", text: tDash("uploadError") });
          setSubmitting(false);
          return;
        }
        if (activeIsMulti) {
          // 3D model API expects imageUrls array even for single image
          uploadedImageUrls = [url];
        } else {
          uploadedImageUrl = url;
        }
      }

      // A+ uses a dedicated multi-scene endpoint
      const isAplus = activeTool === "aplus";
      const endpoint = isAplus ? "/api/jobs/submit-aplus" : "/api/jobs/submit";
      const activeNeedsPrompt = TOOLS_WITH_PROMPT.includes(activeTool);

      const payload: Record<string, unknown> = isAplus
        ? { imageUrl: uploadedImageUrl }
        : {
            tool: activeTool,
            ...(tier ? { tier } : {}),
            ...(uploadedImageUrls ? { imageUrls: uploadedImageUrls } : { imageUrl: uploadedImageUrl }),
            ...(activeNeedsPrompt && prompt.trim() ? { prompt: prompt.trim() } : {}),
          };

      const res = await fetch(endpoint, {
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
        let errorText = tDash("jobError");
        try {
          const errBody = await res.json();
          if (errBody?.error && typeof errBody.error === "string") {
            errorText = errBody.error;
          }
        } catch { /* use generic */ }
        setMessage({ type: "error", text: errorText });
        setSubmitting(false);
        return;
      }

      const result = await res.json();

      if (isAplus && result.jobIds) {
        window.dispatchEvent(
          new CustomEvent("job-submitted", {
            detail: { jobIds: result.jobIds, tool: activeTool },
          })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("job-submitted", {
            detail: { jobId: result.jobId, tool: activeTool },
          })
        );
      }
      handleReset();
    } catch {
      setMessage({ type: "error", text: tDash("jobError") });
    } finally {
      setSubmitting(false);
    }
  }

  function getPromptPlaceholder(): string {
    switch (selectedTool) {
      case "scene": return tDash("promptPlaceholderScene");
      case "video": return tDash("promptPlaceholderVideo");
      case "aplus": return tDash("promptPlaceholderAplus");
      case "image-edit": return tDash("promptPlaceholderImageEdit");
      default: return "";
    }
  }

  /* ── Shared drop zone ── */
  const dropZoneClasses = `flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all ${
    dragOver
      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/5"
      : "border-muted-foreground/25 hover:border-indigo-400/50 hover:bg-muted/30"
  }`;

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
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{tDash("maintenanceTitle")}</p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{tDash("maintenanceMessage")}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Upload Area: Single-image mode (non-3D tools or no tool selected yet) ── */}
        {!isMultiImageTool && !preview && (
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
              className={dropZoneClasses}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 text-muted-foreground">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              <p className="text-base text-muted-foreground sm:text-sm">
                <span className="sm:hidden">{tDash("tapToUpload")}</span>
                <span className="hidden sm:inline">{tDash("dragDrop")}</span>
              </p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
            </div>

            {/* Camera button — visible on mobile, prominent */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-4 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/15 sm:hidden"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              {tDash("takePhoto")}
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraInput} />

            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">{tDash("orPasteUrl")}</span>
              <div className="flex items-center gap-2">
                <Input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={tDash("urlPlaceholder")}
                  className="flex-1 min-w-0"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleUrlSubmit(); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleUrlSubmit} disabled={!urlInput.trim()} className="shrink-0">
                  {tDash("urlConfirm")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Single-image preview (non-3D tools) ── */}
        {!isMultiImageTool && preview && (
          <div className="space-y-3">
            <div className="relative mx-auto max-w-sm overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={tDash("imageSelected")}
                className="h-auto max-h-[60vh] w-full object-contain"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const img = e.currentTarget;
                  // Show a placeholder on load failure (e.g. hotlink blocked)
                  img.style.display = "none";
                  const fallback = img.parentElement?.querySelector(".img-fallback");
                  if (fallback) (fallback as HTMLElement).style.display = "flex";
                }}
              />
              <div className="img-fallback hidden h-40 items-center justify-center text-sm text-muted-foreground">
                {tDash("imageSelected")} — URL
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">{tDash("imageSelected")}</p>
              <Button type="button" variant="outline" size="sm" onClick={handleReset}>{tDash("changeImage")}</Button>
            </div>
          </div>
        )}

        {/* ── Multi-image mode (3D tools) ── */}
        {isMultiImageTool && (
          <div className="space-y-4">
            {/* Photo / Video input mode tabs — always visible */}
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "photo" | "video")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="photo" className="gap-2">
                  <Upload className="size-4" />
                  {tDash("photoMode")}
                </TabsTrigger>
                <TabsTrigger value="video" className="gap-2">
                  <Video className="size-4" />
                  {tDash("videoMode")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Multi-image grid (shown regardless of input mode) */}
            {multiImages.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    {tDash("viewCount", { count: multiImages.length, max: MAX_MULTI_IMAGES })}
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                    {tDash("changeImage")}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {multiImages.map((img) => (
                    <div key={img.id} className="group relative">
                      <div className="relative aspect-square overflow-hidden rounded-lg border border-border/50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.preview} alt={img.name} className="h-full w-full object-cover" />
                        <button
                          onClick={() => removeMultiImage(img.id)}
                          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-600"
                          aria-label={tDash("removeView")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add more button (inside grid) */}
                  {multiImages.length < MAX_MULTI_IMAGES && (
                    <div
                      onClick={() => multiFileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); multiFileInputRef.current?.click(); } }}
                      className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 transition-all hover:border-indigo-400/50 hover:bg-muted/30"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                        <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
                      </svg>
                      <span className="mt-1 text-[10px] text-muted-foreground">{tDash("addMoreViews")}</span>
                    </div>
                  )}
                </div>

                {/* Multi-view guide */}
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5 dark:bg-indigo-500/10 dark:border-indigo-800">
                  <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{tDash("angleGuideTip")}</p>
                  <p className="mt-1 text-[11px] text-indigo-600/70 dark:text-indigo-400/70">{tDash("autoBgRemoveNote")}</p>
                </div>

                {/* Mobile: prominent "Take Another Photo" button when there's room */}
                {multiImages.length < MAX_MULTI_IMAGES && (
                  <button
                    type="button"
                    onClick={() => multiCameraInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/15 sm:hidden"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    {tDash("takeAnotherPhoto")}
                  </button>
                )}
              </div>
            )}

            {/* ── PHOTO MODE: Drop zone + camera ── */}
            {inputMode === "photo" && multiImages.length === 0 && (
              <>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => multiFileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); multiFileInputRef.current?.click(); } }}
                  className={dropZoneClasses}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 text-muted-foreground">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  <p className="text-base text-muted-foreground sm:text-sm">
                    <span className="sm:hidden">{tDash("tapToUpload")}</span>
                    <span className="hidden sm:inline">{tDash("multiViewDragDrop")}</span>
                  </p>
                  <p className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">{tDash("angleGuideTip")}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{tDash("autoBgRemoveNote")}</p>
                </div>

                {/* Camera button — visible on mobile, more prominent */}
                <button
                  type="button"
                  onClick={() => multiCameraInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-4 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/15 sm:hidden"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                  {tDash("takePhoto")}
                </button>
              </>
            )}

            {/* ── VIDEO MODE: Record or upload video ── */}
            {inputMode === "video" && multiImages.length === 0 && (
              <div className="space-y-4">
                {/* Mobile: Record video button */}
                <button
                  type="button"
                  onClick={() => setShowVideoRecorder(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-4 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/15 sm:hidden"
                >
                  <Video className="size-5" />
                  {tDash("recordVideo")}
                </button>

                {/* Desktop + mobile: Upload video file */}
                <div
                  onClick={() => videoFileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); videoFileInputRef.current?.click(); } }}
                  className={dropZoneClasses}
                >
                  <Video className="mb-4 size-12 text-muted-foreground" />
                  <p className="text-base text-muted-foreground sm:text-sm">{tDash("videoDragDrop")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{tDash("videoHint")}</p>
                </div>
                <input ref={videoFileInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFile} />
              </div>
            )}

            {/* Hidden multi-file input + camera input */}
            <input ref={multiFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleMultiFileInput} />
            <input ref={multiCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraInput} />

            {/* Video Recorder overlay */}
            {showVideoRecorder && (
              <VideoRecorder
                onFramesExtracted={handleVideoFrames}
                onCancel={() => setShowVideoRecorder(false)}
                maxFrames={MAX_MULTI_IMAGES}
              />
            )}
          </div>
        )}

        {/* Tool Cards — colorful showcase-style, tap to instantly submit */}
        {hasImage && !selectedTool && !hideToolCards && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(() => {
              const allTools = [
                { tool: "bg-remove" as ToolType, icon: "🧹", color: "from-rose-500/10 to-rose-500/5", border: "border-rose-200 dark:border-rose-800", hover: "hover:border-rose-400 dark:hover:border-rose-600" },
                { tool: "enhance" as ToolType, icon: "✨", color: "from-amber-500/10 to-amber-500/5", border: "border-amber-200 dark:border-amber-800", hover: "hover:border-amber-400 dark:hover:border-amber-600" },
                { tool: "scene" as ToolType, icon: "🎬", color: "from-indigo-500/10 to-indigo-500/5", border: "border-indigo-200 dark:border-indigo-800", hover: "hover:border-indigo-400 dark:hover:border-indigo-600" },
                { tool: "image-edit" as ToolType, icon: "🖌️", color: "from-orange-500/10 to-orange-500/5", border: "border-orange-200 dark:border-orange-800", hover: "hover:border-orange-400 dark:hover:border-orange-600" },
                { tool: "3d-model" as ToolType, icon: "📦", color: "from-emerald-500/10 to-emerald-500/5", border: "border-emerald-200 dark:border-emerald-800", hover: "hover:border-emerald-400 dark:hover:border-emerald-600" },
                { tool: "video" as ToolType, icon: "🎥", color: "from-purple-500/10 to-purple-500/5", border: "border-purple-200 dark:border-purple-800", hover: "hover:border-purple-400 dark:hover:border-purple-600" },
                { tool: "aplus" as ToolType, icon: "⭐", color: "from-cyan-500/10 to-cyan-500/5", border: "border-cyan-200 dark:border-cyan-800", hover: "hover:border-cyan-400 dark:hover:border-cyan-600" },
              ];
              // Filter + order based on user segment
              // Segment determines ORDER only — all tools visible to everyone
              const segmentOrder: Record<string, ToolType[]> = {
                ecommerce: ["bg-remove", "scene", "image-edit", "aplus", "3d-model", "enhance", "video"],
                gaming: ["3d-model", "image-edit", "enhance", "bg-remove", "scene", "video", "aplus"],
                "3dprint": ["3d-model", "image-edit", "enhance", "bg-remove", "scene", "video", "aplus"],
              };
              const order = userSegment ? segmentOrder[userSegment] : null;
              const sorted = order
                ? order.map((t) => allTools.find((a) => a.tool === t)!).filter(Boolean)
                : allTools;
              return sorted;
            })().map(({ tool, icon, color, border, hover }) => {
              const toolKey = TOOL_KEYS[tool];
              return (
                <button
                  key={tool}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    if (TOOLS_WITH_PROMPT.includes(tool) || tool === "3d-model") {
                      setSelectedTool(tool);
                    } else {
                      handleSubmit(tool);
                    }
                  }}
                  className={`flex flex-col gap-1.5 rounded-2xl border bg-gradient-to-br p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 ${color} ${border} ${hover} hover:shadow-md`}
                >
                  <span className="text-2xl">{icon}</span>
                  <span className="text-sm font-semibold">{tTools(toolKey)}</span>
                  <span className="text-xs text-muted-foreground">
                    {TOOL_CREDITS[tool]} {t("credits").toLowerCase()}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 3D Quality Selection — shown when 3D Model is selected */}
        {(preview || multiImages.length > 0) && selectedTool === "3d-model" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                {tDash("goBack")}
              </button>
              <span className="text-sm font-medium">{tTools("3dModel")}</span>
            </div>
            {/* Fotoğraf önizleme — tek veya çoklu */}
            {preview && multiImages.length === 0 && (
              <div className="relative mx-auto max-w-[200px] overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={tDash("imageSelected")} className="h-auto max-h-[200px] w-full object-contain" referrerPolicy="no-referrer" />
              </div>
            )}
            {multiImages.length > 0 && (
              <div className="flex justify-center gap-2">
                {multiImages.map((img) => (
                  <div key={img.id} className="relative size-16 overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.preview} alt={img.name} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
            {/* 3D kalite seçimi — fotoğraf sayısına göre dinamik */}
            <>
              <p className="text-xs text-muted-foreground">
                {locale === "tr" ? "Kalite seviyesi seçin:" : "Choose quality level:"}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Hızlı */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit("3d-model", "fast")}
                  className="flex flex-col gap-1.5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 hover:border-emerald-400 hover:shadow-md dark:border-emerald-800 dark:hover:border-emerald-600"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚡</span>
                    <span className="text-sm font-semibold">{locale === "tr" ? "Hızlı" : "Fast"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {multiImages.length >= 2
                      ? (locale === "tr" ? "~30s • 10 kredi • Tripo 2.5" : "~30s • 10 credits • Tripo 2.5")
                      : (locale === "tr" ? "~15s • 5 kredi • TRELLIS v1" : "~15s • 5 credits • TRELLIS v1")}
                  </span>
                </button>
                {/* Kaliteli */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit("3d-model", "standard")}
                  className="flex flex-col gap-1.5 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 hover:border-indigo-400 hover:shadow-md dark:border-indigo-800 dark:hover:border-indigo-600"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💎</span>
                    <span className="text-sm font-semibold">{locale === "tr" ? "Kaliteli" : "Quality"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {locale === "tr" ? "~3dk • 15 kredi • Meshy 5" : "~3min • 15 credits • Meshy 5"}
                  </span>
                </button>
                {/* Premium */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit("3d-model", "premium")}
                  className="flex flex-col gap-1.5 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 hover:border-amber-400 hover:shadow-md dark:border-amber-800 dark:hover:border-amber-600"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👑</span>
                    <span className="text-sm font-semibold">{locale === "tr" ? "Premium" : "Premium"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {locale === "tr" ? "~3dk • 30 kredi • Hunyuan3D V3" : "~3min • 30 credits • Hunyuan3D V3"}
                  </span>
                </button>
              </div>
            </>
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5 dark:bg-indigo-500/10 dark:border-indigo-800">
              <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                {locale === "tr"
                  ? "💡 Daha iyi sonuç için 2-4 farklı açıdan fotoğraf ekleyin: ön, sol, arka, sağ"
                  : "💡 For better results, add 2-4 photos from different angles: front, left, back, right"}
              </p>
            </div>
          </div>
        )}

        {/* Prompt Input — shown for scene/video tools (no ToolSelector, just presets + prompt) */}
        {hasImage && needsPrompt && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSelectedTool(null); setPrompt(""); setSelectedPresetId(null); }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                {tDash("goBack")}
              </button>
              <span className="text-sm font-medium">{tTools(TOOL_KEYS[selectedTool!])}</span>
            </div>
            {(selectedTool === "scene" || selectedTool === "aplus") && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{tDash("presetHint")}</p>
                <ScenePresets
                  selectedPresetId={selectedPresetId}
                  onSelect={(presetPrompt, presetId) => { setPrompt(presetPrompt); setSelectedPresetId(presetId); }}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {locale === "tr" ? "veya kendi sahne açıklamanızı yazın:" : "or write your own scene description:"}
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); setSelectedPresetId(null); }}
                placeholder={getPromptPlaceholder()}
                rows={2}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">{tDash("promptHint")}</p>
            </div>
          </div>
        )}

        {/* Submit Button — for scene/video (prompt flow) only; 3D uses tier buttons above */}
        {(preview || multiImages.length > 0) && selectedTool && selectedTool !== "3d-model" && (
          <Button
            type="button"
            className="w-full h-12 sm:h-10 bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
            onClick={() => handleSubmit()}
            disabled={submitting || maintenance}
          >
            {submitting ? tDash("submitting") : tDash("submit")}
          </Button>
        )}

        {/* Messages */}
        {message && (
          <p className={`text-center text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
