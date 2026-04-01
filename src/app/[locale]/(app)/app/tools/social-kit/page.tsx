"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resizeImageIfNeeded } from "@/lib/resize-image";
import { Upload, ArrowLeft, Loader2 } from "lucide-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function SocialKitPage() {
  const t = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith("image/")) return;
    if (f.size > MAX_FILE_SIZE) {
      setMessage({ type: "error", text: t("fileTooLarge") });
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setMessage(null);
    try {
      const resized = await resizeImageIfNeeded(f);
      setFile(resized);
      setPreview(URL.createObjectURL(resized));
    } catch {
      setMessage({ type: "error", text: t("uploadError") });
    }
  }, [preview, t]);

  async function handleSubmit() {
    if (!file) return;
    setSubmitting(true);
    setMessage(null);

    try {
      // Upload to Supabase — must use "uploads" bucket + user.id prefix (RLS policy)
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: "error", text: t("uploadError") });
        setSubmitting(false);
        return;
      }

      const ext = file.name.split(".").pop() || "jpg";
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setMessage({ type: "error", text: t("uploadError") });
        setSubmitting(false);
        return;
      }

      const { data: signedData } = await supabase.storage
        .from("uploads")
        .createSignedUrl(path, 3600);

      if (!signedData?.signedUrl) {
        setMessage({ type: "error", text: t("uploadError") });
        setSubmitting(false);
        return;
      }

      // Submit social kit pipeline
      const res = await fetch("/api/jobs/submit-social-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: signedData.signedUrl }),
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

      // Notify job polling system
      if (result.jobIds) {
        window.dispatchEvent(
          new CustomEvent("job-submitted", {
            detail: { jobIds: result.jobIds, tool: "scene" },
          })
        );
      }

      setMessage({
        type: "success",
        text: locale === "tr"
          ? `${result.completedJobs} iş başlatıldı! 4 sahne${result.hasVideo ? " + 1 video" : ""} oluşturuluyor...`
          : `${result.completedJobs} jobs started! Creating 4 scenes${result.hasVideo ? " + 1 video" : ""}...`,
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
            📱 {tTools("socialKit")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "tr"
              ? "Tek fotoğraftan 4 sahne + 1 video + caption — 40 kredi"
              : "From one photo: 4 scenes + 1 video + caption — 40 credits"}
          </p>
        </div>
      </div>

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          {!preview ? (
            <div
              className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all ${
                dragOver
                  ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/5"
                  : "border-muted-foreground/20 hover:border-indigo-400 hover:bg-muted/30"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <Upload className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">{t("dragDrop")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {locale === "tr" ? "Ürün fotoğrafını yükleyin" : "Upload your product photo"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview */}
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-[300px] rounded-xl object-contain"
                />
              </div>

              {/* What you'll get */}
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 dark:bg-indigo-500/10 dark:border-indigo-800">
                <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
                  {locale === "tr" ? "Paket İçeriği:" : "Package Contents:"}
                </p>
                <ul className="space-y-1 text-xs text-indigo-600 dark:text-indigo-400">
                  <li>🎨 {locale === "tr" ? "4 farklı sahne görseli (carousel)" : "4 scene variations (carousel)"}</li>
                  <li>🎬 {locale === "tr" ? "1 ürün tanıtım videosu (15sn)" : "1 product showcase video (15s)"}</li>
                  <li>💰 {locale === "tr" ? "Toplam: 40 kredi" : "Total: 40 credits"}</li>
                </ul>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (preview) URL.revokeObjectURL(preview);
                    setPreview(null);
                    setFile(null);
                    setMessage(null);
                  }}
                  className="flex-1"
                >
                  {t("changeImage")}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("submitting")}
                    </>
                  ) : (
                    locale === "tr" ? "📱 Paketi Oluştur (40 kredi)" : "📱 Create Kit (40 credits)"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Messages */}
          {message && (
            <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${
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
