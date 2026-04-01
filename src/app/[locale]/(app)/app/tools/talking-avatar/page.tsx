"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";
import { resizeImageIfNeeded } from "@/lib/resize-image";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function TalkingAvatarPage() {
  const t = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [script, setScript] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
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
    if (!file || !script.trim()) return;
    setSubmitting(true);
    setMessage(null);

    try {
      // Upload image to Supabase — must use "uploads" bucket + user.id prefix (RLS policy)
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: "error", text: t("uploadError") });
        setSubmitting(false);
        return;
      }

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

      // Submit talking avatar pipeline
      const res = await fetch("/api/jobs/submit-talking-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: signedData.signedUrl,
          script: script.trim(),
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
          detail: { jobId: result.jobId, tool: "talking-avatar" },
        })
      );

      setMessage({
        type: "success",
        text: locale === "tr"
          ? "Avatar videosu oluşturuluyor! ~2dk sürecek."
          : "Avatar video generating! Will take ~2min.",
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
            🗣️ {tTools("talkingAvatar")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "tr"
              ? "Fotoğraf + senaryo yazın → konuşan avatar video — 25 kredi"
              : "Upload photo + write script → talking avatar video — 25 credits"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {/* Step 1: Upload Avatar Image */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "1. Avatar Görseli" : "1. Avatar Image"}
            </label>
            {!preview ? (
              <div
                className="mt-1.5 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all border-muted-foreground/20 hover:border-indigo-400 hover:bg-muted/30"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm font-medium">{t("dragDrop")}</p>
                <p className="text-xs text-muted-foreground">
                  {locale === "tr" ? "Kişi/avatar fotoğrafı yükleyin" : "Upload person/avatar photo"}
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
              <div className="mt-1.5 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Avatar" className="h-24 w-24 rounded-xl object-cover border" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (preview) URL.revokeObjectURL(preview);
                    setPreview(null);
                    setFile(null);
                  }}
                >
                  {t("changeImage")}
                </Button>
              </div>
            )}
          </div>

          {/* Step 2: Script */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "2. Senaryo Metni" : "2. Script Text"}
            </label>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={locale === "tr"
                ? "Örn: Merhaba! Bu harika ürünümüzü sizlere tanıtmak istiyorum..."
                : "e.g. Hello! I'd like to introduce our amazing product..."}
              className="mt-1.5 min-h-[100px]"
              maxLength={1000}
            />
            <p className="mt-1 text-xs text-muted-foreground">{script.length}/1000</p>
          </div>

          {/* Pipeline Info */}
          <div className="rounded-lg bg-purple-50 border border-purple-100 px-4 py-3 dark:bg-purple-500/10 dark:border-purple-800">
            <p className="text-xs text-purple-700 dark:text-purple-300">
              {locale === "tr"
                ? "💡 Metin → AI ses üretimi → Avatar videosu. Toplam ~2 dakika."
                : "💡 Text → AI voice generation → Avatar video. Total ~2 minutes."}
            </p>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!file || !script.trim() || submitting}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("submitting")}</>
            ) : (
              locale === "tr" ? "🗣️ Avatar Video Oluştur (25 kredi)" : "🗣️ Create Avatar Video (25 credits)"
            )}
          </Button>

          {/* Messages */}
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
