"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2 } from "lucide-react";

const ASPECT_RATIOS = [
  { id: "1:1", label: "1:1", w: 1024, h: 1024 },
  { id: "4:5", label: "4:5", w: 832, h: 1024 },
  { id: "9:16", label: "9:16", w: 576, h: 1024 },
  { id: "16:9", label: "16:9", w: 1024, h: 576 },
] as const;

const STYLE_PRESETS = [
  { id: "photo", emoji: "📸", tr: "Fotogerçekçi", en: "Photorealistic", suffix: ", photorealistic, high quality photograph, 8k" },
  { id: "illustration", emoji: "🎨", tr: "İllüstrasyon", en: "Illustration", suffix: ", digital illustration, vibrant colors, detailed artwork" },
  { id: "3d", emoji: "📦", tr: "3D Render", en: "3D Render", suffix: ", 3d render, studio lighting, octane render, highly detailed" },
  { id: "minimal", emoji: "⬜", tr: "Minimal", en: "Minimal", suffix: ", minimalist design, clean composition, simple background" },
] as const;

export default function TextToImagePage() {
  const t = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("photo");
  const [aspect, setAspect] = useState<string>("1:1");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(tier: "fast" | "standard") {
    if (!prompt.trim()) {
      setMessage({ type: "error", text: locale === "tr" ? "Lütfen bir açıklama yazın." : "Please enter a description." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const selectedStyle = STYLE_PRESETS.find((s) => s.id === style);
      const enhancedPrompt = prompt.trim() + (selectedStyle?.suffix || "");
      const selectedAspect = ASPECT_RATIOS.find((a) => a.id === aspect);

      const res = await fetch("/api/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "text-to-image",
          tier,
          prompt: enhancedPrompt,
          // Pass aspect ratio info in prompt metadata
          ...(selectedAspect && selectedAspect.id !== "1:1" ? {
            aspectWidth: selectedAspect.w,
            aspectHeight: selectedAspect.h,
          } : {}),
        }),
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
          detail: { jobId: result.jobId, tool: "text-to-image" },
        })
      );

      setMessage({
        type: "success",
        text: locale === "tr"
          ? `Görsel oluşturuluyor! ~${tier === "fast" ? "3sn" : "10sn"} sürecek.`
          : `Generating image! Will take ~${tier === "fast" ? "3s" : "10s"}.`,
      });
    } catch {
      setMessage({ type: "error", text: t("jobError") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
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
            🖼️ {tTools("textToImage")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "tr"
              ? "Metin açıklamasından görsel üret — fotoğraf gerekmez"
              : "Generate images from text — no photo needed"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {/* Prompt */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "Ne oluşturmak istiyorsunuz?" : "What do you want to create?"}
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={locale === "tr"
                ? "Örn: Mermer masada duran lüks parfüm şişesi, yumuşak stüdyo ışıkları"
                : "e.g. Luxury perfume bottle on marble table, soft studio lighting"}
              className="mt-1.5 min-h-[80px]"
              maxLength={500}
            />
            <p className="mt-1 text-xs text-muted-foreground">{prompt.length}/500</p>
          </div>

          {/* Style Presets */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "Stil" : "Style"}
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`rounded-xl border px-3 py-2 text-center text-sm transition-all ${
                    style === s.id
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                      : "border-muted hover:border-indigo-300"
                  }`}
                >
                  <span className="text-lg">{s.emoji}</span>
                  <br />
                  <span className="text-xs">{locale === "tr" ? s.tr : s.en}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "Oran" : "Aspect Ratio"}
            </label>
            <div className="mt-1.5 flex gap-2">
              {ASPECT_RATIOS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAspect(a.id)}
                  className={`rounded-lg border px-4 py-1.5 text-sm transition-all ${
                    aspect === a.id
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                      : "border-muted hover:border-indigo-300"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quality Tier Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={submitting || !prompt.trim()}
              onClick={() => handleSubmit("fast")}
              className="flex flex-col gap-1.5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 hover:border-emerald-400 hover:shadow-md dark:border-emerald-800 dark:hover:border-emerald-600"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <span className="text-sm font-semibold">{locale === "tr" ? "Hızlı" : "Fast"}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {locale === "tr" ? "~3sn • 2 kredi • FLUX Schnell" : "~3s • 2 credits • FLUX Schnell"}
              </span>
            </button>
            <button
              disabled={submitting || !prompt.trim()}
              onClick={() => handleSubmit("standard")}
              className="flex flex-col gap-1.5 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 hover:border-indigo-400 hover:shadow-md dark:border-indigo-800 dark:hover:border-indigo-600"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">💎</span>
                <span className="text-sm font-semibold">{locale === "tr" ? "Kaliteli" : "Quality"}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {locale === "tr" ? "~10sn • 4 kredi • FLUX Pro" : "~10s • 4 credits • FLUX Pro"}
              </span>
            </button>
          </div>

          {submitting && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("submitting")}
            </div>
          )}

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
