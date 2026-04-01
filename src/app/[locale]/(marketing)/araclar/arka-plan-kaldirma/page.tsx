"use client";

import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Loader2,
  Download,
  RotateCcw,
} from "lucide-react";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB for demo

export default function PublicBgRemovePage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  const [preview, setPreview] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<{
    type: "error" | "info";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setResultUrl(null);
    setMessage(null);
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFile = useCallback(
    async (f: File) => {
      if (!f.type.startsWith("image/")) {
        setMessage({
          type: "error",
          text: tr ? "Lütfen bir resim dosyası yükleyin." : "Please upload an image file.",
        });
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        setMessage({
          type: "error",
          text: tr ? "Dosya çok büyük (maks. 5MB)" : "File too large (max 5MB)",
        });
        return;
      }
      reset();
      setPreview(URL.createObjectURL(f));
      setProcessing(true);
      setMessage(null);

      try {
        const dataUrl = await fileToDataUrl(f);

        const res = await fetch("/api/demo/bg-remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl }),
        });

        if (res.status === 429) {
          const err = await res.json();
          setMessage({
            type: "error",
            text: tr ? err.errorTr : err.error,
          });
          setProcessing(false);
          return;
        }

        if (!res.ok) {
          setMessage({
            type: "error",
            text: tr ? "İşlem başarısız oldu." : "Processing failed.",
          });
          setProcessing(false);
          return;
        }

        const data = await res.json();
        setResultUrl(data.resultUrl);
        if (typeof data.remaining === "number") {
          setRemaining(data.remaining);
        }
      } catch {
        setMessage({
          type: "error",
          text: tr ? "Bir hata oluştu." : "An error occurred.",
        });
      } finally {
        setProcessing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tr]
  );

  async function downloadResult() {
    if (!resultUrl) return;
    try {
      const response = await fetch(resultUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `bg-removed-${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(resultUrl, "_blank");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Navbar */}
      <nav className="border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {tr ? "Ana Sayfa" : "Home"}
          </Link>
          <Link
            href={`/${locale}/login`}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            {tr ? "Giriş Yap" : "Sign In"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold sm:text-3xl">
            {tr
              ? "✨ Ücretsiz Arka Plan Kaldırma"
              : "✨ Free Background Removal"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr
              ? "AI destekli arka plan kaldırma — günde 3 ücretsiz kullanım, kayıt gerektirmez"
              : "AI-powered background removal — 3 free uses per day, no registration required"}
          </p>
          {remaining !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {tr
                ? `Kalan hak: ${remaining}/3`
                : `Remaining: ${remaining}/3`}
            </p>
          )}
        </div>

        <Card>
          <CardContent className="p-6">
            {!preview ? (
              /* ── Upload Area ── */
              <div
                className={`flex min-h-[250px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all ${
                  dragOver
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/5"
                    : "border-muted-foreground/20 hover:border-indigo-400 hover:bg-muted/30"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
              >
                <Upload className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium">
                  {tr
                    ? "Fotoğrafı sürükleyin veya tıklayın"
                    : "Drag & drop your photo or click"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG, PNG — {tr ? "maks." : "max"} 5MB
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
              /* ── Before/After Preview ── */
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Original */}
                  <div className="text-center">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {tr ? "Orijinal" : "Original"}
                    </p>
                    <div className="overflow-hidden rounded-xl border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt="Original"
                        className="h-auto w-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Result */}
                  <div className="text-center">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {tr ? "Sonuç" : "Result"}
                    </p>
                    <div className="flex items-center justify-center overflow-hidden rounded-xl border bg-[url('/checkerboard.svg')] bg-repeat min-h-[150px]">
                      {processing ? (
                        <div className="flex flex-col items-center gap-2 py-12">
                          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                          <p className="text-xs text-muted-foreground">
                            {tr ? "İşleniyor..." : "Processing..."}
                          </p>
                        </div>
                      ) : resultUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={resultUrl}
                          alt="Result"
                          className="h-auto w-full object-contain"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground py-12">
                          {tr ? "Hata oluştu" : "Error occurred"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={reset}
                    className="flex-1 gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {tr ? "Yeni Fotoğraf" : "New Photo"}
                  </Button>
                  {resultUrl && (
                    <Button
                      onClick={downloadResult}
                      className="flex-1 gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800"
                    >
                      <Download className="h-4 w-4" />
                      {tr ? "İndir (PNG)" : "Download (PNG)"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            {message && (
              <div
                className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                  message.type === "error"
                    ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                }`}
              >
                {message.text}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upsell */}
        <Card className="border-indigo-200 dark:border-indigo-800">
          <CardContent className="p-6 text-center">
            <p className="text-sm font-semibold">
              {tr
                ? "🚀 Sınırsız erişim + 12 AI aracı"
                : "🚀 Unlimited access + 12 AI tools"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tr
                ? "3D model, ürün sahneleri, video, QR kod, logo ve daha fazlası"
                : "3D models, product scenes, video, QR code, logo and more"}
            </p>
            <Button
              asChild
              variant="outline"
              className="mt-3 border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            >
              <Link href={`/${locale}/login`}>
                {tr
                  ? "Ücretsiz Kayıt Ol — 50 Kredi Hediye"
                  : "Sign Up Free — 50 Credits Gift"}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
