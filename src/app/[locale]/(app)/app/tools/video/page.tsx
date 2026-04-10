"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Upload, Film, Sparkles } from "lucide-react";

type VideoMode = "image-to-video" | "text-to-video";

export default function VideoPage() {
  const t = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [mode, setMode] = useState<VideoMode>("text-to-video");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function uploadFile(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) return null;
      const data = await res.json();
      return data.url || null;
    } catch {
      return null;
    }
  }

  function handleFileSelect() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      const url = await uploadFile(file);
      if (url) setImageUrl(url);
      else setMessage({ type: "error", text: locale === "tr" ? "Yükleme başarısız." : "Upload failed." });
    };
    input.click();
  }

  async function handleSubmit() {
    if (mode === "text-to-video" && !prompt.trim()) {
      setMessage({ type: "error", text: locale === "tr" ? "Video açıklaması yazın." : "Enter a video description." });
      return;
    }
    if (mode === "image-to-video" && !imageUrl) {
      setMessage({ type: "error", text: locale === "tr" ? "Görsel yükleyin." : "Upload an image." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const body: Record<string, unknown> = { tool: "video" };

      if (mode === "text-to-video") {
        body.tier = "standard";
        body.prompt = prompt.trim();
      } else {
        body.tier = "standard";
        body.imageUrl = imageUrl;
        if (prompt.trim()) body.prompt = prompt.trim();
      }

      const res = await fetch("/api/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 402) {
        window.dispatchEvent(new CustomEvent("show-upgrade"));
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: errBody?.error || t("jobError") });
        setSubmitting(false);
        return;
      }

      const result = await res.json();
      window.dispatchEvent(
        new CustomEvent("job-submitted", {
          detail: { jobId: result.jobId, tool: "video" },
        })
      );

      setMessage({
        type: "success",
        text: locale === "tr" ? "Video oluşturuluyor! ~2dk sürecek." : "Generating video! Will take ~2min.",
      });
    } catch {
      setMessage({ type: "error", text: t("jobError") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <a
          href={`/${locale}/app`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {locale === "tr" ? "Geri" : "Back"}
        </a>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            🎬 {tTools("video")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "tr"
              ? "Metin veya görselden profesyonel ürün videosu oluştur"
              : "Create professional product video from text or image"}
          </p>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode("text-to-video")}
          className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all ${
            mode === "text-to-video"
              ? "border-pink-500 bg-pink-50/50 ring-2 ring-pink-500/20 dark:bg-pink-500/5"
              : "border-muted hover:border-pink-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-pink-500" />
            <span className="text-sm font-semibold">
              {locale === "tr" ? "Metin → Video" : "Text → Video"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {locale === "tr" ? "Kling 2.6 Pro • 25 kredi" : "Kling 2.6 Pro • 25 credits"}
          </span>
        </button>
        <button
          onClick={() => setMode("image-to-video")}
          className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all ${
            mode === "image-to-video"
              ? "border-pink-500 bg-pink-50/50 ring-2 ring-pink-500/20 dark:bg-pink-500/5"
              : "border-muted hover:border-pink-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-pink-500" />
            <span className="text-sm font-semibold">
              {locale === "tr" ? "Görsel → Video" : "Image → Video"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {locale === "tr" ? "Wan 2.6 • 20 kredi" : "Wan 2.6 • 20 credits"}
          </span>
        </button>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {mode === "image-to-video" && (
            <button
              type="button"
              onClick={handleFileSelect}
              className="w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/50 p-8 transition-all hover:border-pink-400 hover:bg-pink-50 dark:border-pink-800 dark:bg-pink-500/5 dark:hover:border-pink-600 overflow-hidden"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="max-h-40 rounded-lg object-contain" />
              ) : (
                <>
                  <Upload className="h-8 w-8 text-pink-400" />
                  <span className="text-sm font-medium text-pink-600 dark:text-pink-400">
                    {locale === "tr" ? "Ürün Fotoğrafı Yükle" : "Upload Product Photo"}
                  </span>
                </>
              )}
            </button>
          )}

          <div>
            <label className="text-sm font-medium">
              {mode === "text-to-video"
                ? (locale === "tr" ? "Video açıklaması" : "Video description")
                : (locale === "tr" ? "Hareket açıklaması (opsiyonel)" : "Motion description (optional)")}
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={mode === "text-to-video"
                ? (locale === "tr"
                  ? "Örn: Lüks parfüm şişesi yavaşça dönerken, arkada soft ışıklar parlıyor"
                  : "e.g. Luxury perfume bottle slowly rotating, soft lights glowing behind")
                : (locale === "tr"
                  ? "Örn: Ürün yavaşça dönsün, kamera yakınlaşsın"
                  : "e.g. Product slowly rotates, camera zooms in")}
              className="mt-1.5 min-h-[80px]"
              maxLength={500}
            />
          </div>

          <Button
            className="w-full h-12 sm:h-10 bg-pink-600 text-white hover:bg-pink-700 shadow-sm"
            onClick={handleSubmit}
            disabled={submitting || (mode === "text-to-video" && !prompt.trim()) || (mode === "image-to-video" && !imageUrl)}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("submitting")}
              </span>
            ) : (
              <span>
                🎬 {mode === "text-to-video"
                  ? (locale === "tr" ? "Video Oluştur — 25 Kredi" : "Generate Video — 25 Credits")
                  : (locale === "tr" ? "Video Oluştur — 20 Kredi" : "Generate Video — 20 Credits")}
              </span>
            )}
          </Button>

          {message && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              message.type === "error"
                ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                : "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
            }`}>
              {message.text}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
