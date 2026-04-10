"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Upload, Shirt, User } from "lucide-react";

export default function VirtualTryOnPage() {
  const t = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [modelImage, setModelImage] = useState<string | null>(null);
  const [garmentImage, setGarmentImage] = useState<string | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);
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

  function handleFileSelect(target: "model" | "garment") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (target === "model") setModelPreview(ev.target?.result as string);
        else setGarmentPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload
      const url = await uploadFile(file);
      if (url) {
        if (target === "model") setModelImage(url);
        else setGarmentImage(url);
      } else {
        setMessage({
          type: "error",
          text: locale === "tr" ? "Yükleme başarısız." : "Upload failed.",
        });
      }
    };
    input.click();
  }

  async function handleSubmit() {
    if (!modelImage || !garmentImage) {
      setMessage({
        type: "error",
        text: locale === "tr" ? "Her iki görseli de yükleyin." : "Please upload both images.",
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "virtual-tryon",
          imageUrls: [modelImage, garmentImage],
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
          detail: { jobId: result.jobId, tool: "virtual-tryon" },
        })
      );

      setMessage({
        type: "success",
        text: locale === "tr"
          ? "Kıyafet giydiriliyor! ~15sn sürecek."
          : "Generating try-on! Will take ~15s.",
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
            👗 {tTools("virtualTryon")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "tr"
              ? "Model fotoğrafı + kıyafet fotoğrafı → AI ile giydirme"
              : "Model photo + garment photo → AI virtual try-on"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {/* Two upload areas side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Model Image */}
            <button
              type="button"
              onClick={() => handleFileSelect("model")}
              className="group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-fuchsia-200 bg-fuchsia-50/50 p-6 transition-all hover:border-fuchsia-400 hover:bg-fuchsia-50 dark:border-fuchsia-800 dark:bg-fuchsia-500/5 dark:hover:border-fuchsia-600 aspect-[3/4] overflow-hidden"
            >
              {modelPreview ? (
                <img src={modelPreview} alt="Model" className="absolute inset-0 w-full h-full object-cover rounded-2xl" />
              ) : (
                <>
                  <User className="h-8 w-8 text-fuchsia-400" />
                  <span className="text-sm font-medium text-fuchsia-600 dark:text-fuchsia-400">
                    {locale === "tr" ? "Model Fotoğrafı" : "Model Photo"}
                  </span>
                  <span className="text-xs text-muted-foreground text-center">
                    {locale === "tr" ? "Kıyafet giydirilecek kişi" : "Person to dress"}
                  </span>
                </>
              )}
            </button>

            {/* Garment Image */}
            <button
              type="button"
              onClick={() => handleFileSelect("garment")}
              className="group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-6 transition-all hover:border-violet-400 hover:bg-violet-50 dark:border-violet-800 dark:bg-violet-500/5 dark:hover:border-violet-600 aspect-[3/4] overflow-hidden"
            >
              {garmentPreview ? (
                <img src={garmentPreview} alt="Garment" className="absolute inset-0 w-full h-full object-cover rounded-2xl" />
              ) : (
                <>
                  <Shirt className="h-8 w-8 text-violet-400" />
                  <span className="text-sm font-medium text-violet-600 dark:text-violet-400">
                    {locale === "tr" ? "Kıyafet Fotoğrafı" : "Garment Photo"}
                  </span>
                  <span className="text-xs text-muted-foreground text-center">
                    {locale === "tr" ? "Giydirilecek kıyafet" : "Clothing item"}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Hints */}
          <p className="text-xs text-muted-foreground text-center">
            {locale === "tr"
              ? "💡 İyi sonuç için: model fotoğrafında kişi net görünmeli, kıyafet fotoğrafında ürün düz zemine serilmiş veya manken üzerinde olmalı"
              : "💡 For best results: model photo should show person clearly, garment should be on flat surface or mannequin"}
          </p>

          {/* Submit */}
          <Button
            className="w-full h-12 sm:h-10 bg-fuchsia-600 text-white hover:bg-fuchsia-700 shadow-sm"
            onClick={handleSubmit}
            disabled={submitting || !modelImage || !garmentImage}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("submitting")}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                👗 {locale === "tr" ? "Kıyafeti Giydir — 10 Kredi" : "Try On — 10 Credits"}
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
