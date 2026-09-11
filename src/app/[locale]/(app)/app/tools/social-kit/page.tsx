"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resizeImageIfNeeded } from "@/lib/resize-image";
import { Upload, ArrowLeft, Loader2 } from "lucide-react";
import {
  SOCIAL_KIT_SCENE_COUNT,
  SOCIAL_KIT_VIDEO_SECONDS,
  TOOL_CREDITS,
} from "@/lib/fal/models";
import {
  forgetPendingIdempotencyKey,
  getPendingIdempotencyKey,
  rememberPendingIdempotencyKey,
} from "@/lib/jobs/social-kit-pending";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SOCIAL_KIT_CREDITS = TOOL_CREDITS["social-kit"];

interface PendingSocialKitOperation {
  file: File;
  userId: string;
  requestScope: string;
  idempotencyKey: string;
  sourceFingerprint: string;
  imageUrl?: string;
}

async function fingerprintFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

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
  const operationRef = useRef<PendingSocialKitOperation | null>(null);

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
      operationRef.current = null;
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
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: "error", text: t("uploadError") });
        return;
      }

      const sourceFingerprint = await fingerprintFile(file);
      const requestScope = `${locale}:${sourceFingerprint}`;
      let operation = operationRef.current;
      if (
        !operation ||
        operation.file !== file ||
        operation.userId !== user.id ||
        operation.requestScope !== requestScope
      ) {
        const persistedKey = getPendingIdempotencyKey(
          window.localStorage,
          user.id,
          requestScope
        );
        operation = {
          file,
          userId: user.id,
          requestScope,
          idempotencyKey: persistedKey ?? crypto.randomUUID(),
          sourceFingerprint,
        };
        operationRef.current = operation;
        rememberPendingIdempotencyKey(
          window.localStorage,
          user.id,
          requestScope,
          operation.idempotencyKey
        );
      }

      // Upload to Supabase — must use "uploads" bucket + user.id prefix (RLS policy)
      if (!operation.imageUrl) {
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

        operation.imageUrl = signedData.signedUrl;
      }

      // Submit social kit pipeline
      const res = await fetch("/api/jobs/submit-social-kit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operation.idempotencyKey,
        },
        body: JSON.stringify({
          imageUrl: operation.imageUrl,
          sourceFingerprint: operation.sourceFingerprint,
        }),
      });

      const responseBody = await res.json().catch(() => null) as
        | Record<string, unknown>
        | null;
      const idempotency = responseBody?.idempotency as
        | { keyAction?: unknown }
        | undefined;
      const canRotateKey = idempotency?.keyAction === "rotate";

      const clearDurableOperation = () => {
        forgetPendingIdempotencyKey(
          window.localStorage,
          operation.userId,
          operation.requestScope,
          operation.idempotencyKey
        );
        operationRef.current = null;
      };

      const notifySubmittedJobs = (value: unknown) => {
        if (!Array.isArray(value)) return 0;
        const jobIds = value.filter(
          (jobId): jobId is string => typeof jobId === "string"
        );
        if (jobIds.length > 0) {
          window.dispatchEvent(
            new CustomEvent("job-submitted", {
              detail: { jobIds, tool: "scene" },
            })
          );
        }
        return jobIds.length;
      };

      if (res.status === 202) {
        const submittedJobCount = notifySubmittedJobs(responseBody?.jobIds);
        setMessage({
          type: submittedJobCount > 0 ? "success" : "error",
          text:
            locale === "tr"
              ? submittedJobCount > 0
                ? `${submittedJobCount} iş kabul edildi; kalan durumlar güvenli biçimde uzlaştırılıyor.`
                : "Bu paket zaten hazırlanıyor. Birkaç saniye sonra tekrar deneyin."
              : submittedJobCount > 0
                ? `${submittedJobCount} jobs were accepted; remaining states are being reconciled safely.`
                : "This kit is already being prepared. Try again in a few seconds.",
        });
        return;
      }

      if (res.status === 402) {
        if (canRotateKey) clearDurableOperation();
        window.dispatchEvent(new CustomEvent("show-upgrade"));
        return;
      }

      if (!res.ok) {
        if (canRotateKey) clearDurableOperation();
        setMessage({
          type: "error",
          text:
            typeof responseBody?.error === "string"
              ? responseBody.error
              : t("jobError"),
        });
        return;
      }

      if (!responseBody || !canRotateKey) {
        setMessage({ type: "error", text: t("jobError") });
        return;
      }

      const result = responseBody as {
        jobIds?: string[];
        completedJobs?: number;
        sceneCount?: number;
        hasVideo?: boolean;
        warnings?: unknown[];
      };
      clearDurableOperation();

      // Notify job polling system
      notifySubmittedJobs(result.jobIds);

      setMessage({
        type: "success",
        text: locale === "tr"
          ? `${result.completedJobs} iş başlatıldı! ${result.sceneCount} sahne${result.hasVideo ? " + 1 video" : ""}${result.warnings?.length ? " (kısmi paket)" : ""} oluşturuluyor...`
          : `${result.completedJobs} jobs started! Creating ${result.sceneCount} scenes${result.hasVideo ? " + 1 video" : ""}${result.warnings?.length ? " (partial kit)" : ""}...`,
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
              ? `Tek fotoğraftan ${SOCIAL_KIT_SCENE_COUNT} sahne + ${SOCIAL_KIT_VIDEO_SECONDS} saniyelik 1 video — ${SOCIAL_KIT_CREDITS} kredi`
              : `From one photo: ${SOCIAL_KIT_SCENE_COUNT} scenes + one ${SOCIAL_KIT_VIDEO_SECONDS}-second video — ${SOCIAL_KIT_CREDITS} credits`}
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
                  <li>🎨 {locale === "tr" ? `${SOCIAL_KIT_SCENE_COUNT} farklı ürün sahnesi` : `${SOCIAL_KIT_SCENE_COUNT} product scene variations`}</li>
                  <li>🎬 {locale === "tr" ? `1 ürün tanıtım videosu (${SOCIAL_KIT_VIDEO_SECONDS} sn)` : `1 product showcase video (${SOCIAL_KIT_VIDEO_SECONDS}s)`}</li>
                  <li>💰 {locale === "tr" ? `Toplam: ${SOCIAL_KIT_CREDITS} kredi` : `Total: ${SOCIAL_KIT_CREDITS} credits`}</li>
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
                    operationRef.current = null;
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
                    locale === "tr" ? `📱 Paketi Oluştur (${SOCIAL_KIT_CREDITS} kredi)` : `📱 Create Kit (${SOCIAL_KIT_CREDITS} credits)`
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
