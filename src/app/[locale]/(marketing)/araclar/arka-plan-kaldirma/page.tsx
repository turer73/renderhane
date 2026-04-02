"use client";

import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AdSlot } from "@/components/ads/ad-slot";
import {
  ArrowRight,
  Upload,
  Loader2,
  Download,
  RotateCcw,
  Sparkles,
  Shield,
  Zap,
  Clock,
  CheckCircle2,
  Star,
  Image as ImageIcon,
  Box,
} from "lucide-react";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

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
          setMessage({ type: "error", text: tr ? err.errorTr : err.error });
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
        if (typeof data.remaining === "number") setRemaining(data.remaining);
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
      window.open(resultUrl, "_blank");
    }
  }

  const features = [
    {
      icon: Zap,
      title: tr ? "Saniyeler İçinde" : "In Seconds",
      desc: tr ? "AI ile anında sonuç" : "Instant results with AI",
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-500/10",
    },
    {
      icon: Shield,
      title: tr ? "Kayıt Gerektirmez" : "No Signup Required",
      desc: tr ? "Hemen kullanmaya başla" : "Start using immediately",
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      icon: Sparkles,
      title: tr ? "AI Destekli" : "AI-Powered",
      desc: tr ? "Profesyonel kalite" : "Professional quality",
      color: "text-indigo-500",
      bg: "bg-indigo-50 dark:bg-indigo-500/10",
    },
    {
      icon: Clock,
      title: tr ? "Günde 3 Ücretsiz" : "3 Free / Day",
      desc: tr ? "Her gün yenilenir" : "Resets every day",
      color: "text-purple-500",
      bg: "bg-purple-50 dark:bg-purple-500/10",
    },
  ];

  const useCases = [
    { emoji: "🛒", text: tr ? "E-ticaret ürün görselleri" : "E-commerce product photos" },
    { emoji: "📱", text: tr ? "Sosyal medya içerikleri" : "Social media content" },
    { emoji: "🎨", text: tr ? "Grafik tasarım projeleri" : "Graphic design projects" },
    { emoji: "📸", text: tr ? "Pasaport ve vesikalık fotoğraf" : "Passport and ID photos" },
    { emoji: "🖼️", text: tr ? "Portfolyo ve sunum görselleri" : "Portfolio and presentation visuals" },
    { emoji: "🏪", text: tr ? "Pazaryeri listeleme görselleri" : "Marketplace listing images" },
  ];

  return (
    <div className="min-h-screen">
      {/* Compact Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 pb-12 pt-4 text-white sm:pb-14 sm:pt-6">
        <div className="absolute inset-0">
          <div className="absolute left-1/4 top-0 h-[300px] w-[300px] rounded-full bg-white/5 blur-[100px]" />
        </div>

        {/* Top bar */}
        <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 pb-4 sm:pb-6">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
          >
            <Box className="size-5" />
            Renderhane
          </Link>
          <Link
            href={`/${locale}/login`}
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm transition-all hover:bg-white/25"
          >
            {tr ? "Giriş Yap" : "Sign In"}
            <ArrowRight className="ml-1.5 inline size-3.5" />
          </Link>
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm sm:text-sm">
            <Sparkles className="size-3.5" />
            {tr ? "AI Destekli • Ücretsiz" : "AI-Powered • Free"}
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
            {tr ? "Arka Planı " : "Remove "}
            <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent">
              {tr ? "Anında Kaldır" : "Backgrounds Instantly"}
            </span>
          </h1>

          <p className="mx-auto mt-2 max-w-lg text-sm text-white/75 sm:text-base">
            {tr
              ? "Fotoğraflardan arka planı saniyeler içinde kaldırın. Kayıt gerektirmez, günde 3 hak."
              : "Remove backgrounds from photos in seconds. No signup required, 3 free per day."}
          </p>

          {remaining !== null && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs backdrop-blur-sm sm:text-sm">
              <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
              {tr ? `Kalan hak: ${remaining}/3` : `Remaining: ${remaining}/3`}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        {/* Main Tool Card — pulled up over hero */}
        <div className="-mt-8 mb-8">
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-2xl shadow-indigo-200/30 dark:shadow-indigo-900/20 sm:p-8">
            {!preview ? (
              <div
                className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 sm:min-h-[280px] ${
                  dragOver
                    ? "border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 scale-[1.01]"
                    : "border-muted-foreground/20 hover:border-indigo-400 hover:bg-gradient-to-br hover:from-indigo-50/50 hover:to-purple-50/50 dark:hover:from-indigo-500/5 dark:hover:to-purple-500/5"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-500/20 dark:to-purple-500/20">
                  <Upload className="size-7 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="text-lg font-semibold">
                  {tr ? "Fotoğrafı sürükleyin veya tıklayın" : "Drag & drop your photo or click"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  JPG, PNG — {tr ? "maks." : "max"} 5MB
                </p>
                <Button
                  className="mt-4 gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  <ImageIcon className="size-4" />
                  {tr ? "Fotoğraf Seç" : "Choose Photo"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Original */}
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold">1</span>
                      <span className="text-sm font-medium text-muted-foreground">
                        {tr ? "Orijinal" : "Original"}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-2xl border shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="Original" className="h-auto w-full object-contain" />
                    </div>
                  </div>

                  {/* Result */}
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-xs font-bold text-white">2</span>
                      <span className="text-sm font-medium text-muted-foreground">
                        {tr ? "Sonuç" : "Result"}
                      </span>
                    </div>
                    <div className="flex items-center justify-center overflow-hidden rounded-2xl border bg-[url('/checkerboard.svg')] bg-repeat shadow-sm min-h-[200px]">
                      {processing ? (
                        <div className="flex flex-col items-center gap-3 py-16">
                          <div className="relative">
                            <Loader2 className="size-10 animate-spin text-indigo-500" />
                            <Sparkles className="absolute -right-1 -top-1 size-4 text-amber-400 animate-pulse" />
                          </div>
                          <p className="text-sm font-medium text-muted-foreground">
                            {tr ? "AI işliyor..." : "AI processing..."}
                          </p>
                        </div>
                      ) : resultUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={resultUrl} alt="Result" className="h-auto w-full object-contain" />
                      ) : (
                        <p className="text-sm text-muted-foreground py-16">
                          {tr ? "Hata oluştu" : "Error occurred"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={reset} className="flex-1 gap-2 h-12">
                    <RotateCcw className="size-4" />
                    {tr ? "Yeni Fotoğraf" : "New Photo"}
                  </Button>
                  {resultUrl && (
                    <Button
                      onClick={downloadResult}
                      className="flex-1 gap-2 h-12 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-200/40 hover:from-emerald-700 hover:to-teal-700 dark:shadow-emerald-900/30"
                    >
                      <Download className="size-4" />
                      {tr ? "İndir (PNG)" : "Download (PNG)"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {message && (
              <div
                className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
                  message.type === "error"
                    ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                }`}
              >
                {message.text}
              </div>
            )}
          </div>
        </div>

        {/* Ad Slot — Top Banner */}
        <AdSlot slot="bg-remove-top" format="horizontal" className="mb-8" />

        {/* Feature Cards */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:mb-12 sm:grid-cols-4 sm:gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="group rounded-xl border border-border/60 bg-card p-3 text-center transition-all duration-300 hover:border-indigo-200 hover:shadow-lg dark:hover:border-indigo-800 sm:rounded-2xl sm:p-5"
            >
              <div className={`mx-auto mb-2 flex size-10 items-center justify-center rounded-lg ${f.bg} transition-transform group-hover:scale-110 sm:mb-3 sm:size-12 sm:rounded-xl`}>
                <f.icon className={`size-5 ${f.color} sm:size-6`} />
              </div>
              <h3 className="text-xs font-bold sm:text-sm">{f.title}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Use Cases + Ad Side */}
        <div className="mb-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold">
              {tr ? "Nerede Kullanılır?" : "Where to Use?"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {tr
                ? "Arka plan kaldırma aracı birçok farklı alanda profesyonel sonuçlar sunar."
                : "Background removal tool delivers professional results across many use cases."}
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {useCases.map((uc, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-indigo-200 hover:shadow-sm dark:hover:border-indigo-800"
                >
                  <span className="text-2xl">{uc.emoji}</span>
                  <span className="text-sm font-medium">{uc.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Ad */}
          <div className="hidden lg:block">
            <AdSlot slot="bg-remove-sidebar" format="rectangle" className="sticky top-20" />
          </div>
        </div>

        {/* Upsell CTA */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 p-6 text-center text-white shadow-xl shadow-indigo-200/30 dark:shadow-indigo-900/20 sm:rounded-3xl sm:p-12">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <Star className="size-4 text-amber-300" fill="currentColor" />
              {tr ? "Sınırsız Erişim" : "Unlimited Access"}
            </div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">
              {tr ? "12+ AI Aracına Erişim" : "Access 12+ AI Tools"}
            </h2>
            <p className="mt-3 text-white/80">
              {tr
                ? "3D model, ürün sahneleri, video, logo, sosyal medya paketi ve çok daha fazlası. 50 ücretsiz kredi ile başlayın."
                : "3D models, product scenes, video, logo, social media kit and much more. Start with 50 free credits."}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                asChild
                size="lg"
                className="gap-2 bg-white text-indigo-700 font-bold shadow-lg hover:bg-white/90 transition-all"
              >
                <Link href={`/${locale}/login`}>
                  {tr ? "Ücretsiz Kayıt Ol — 50 Kredi Hediye" : "Sign Up Free — 50 Credits Gift"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <div className="flex items-center gap-1.5 text-sm text-white/70">
                <CheckCircle2 className="size-4" />
                {tr ? "Kredi kartı gerekmez" : "No credit card required"}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Ad */}
        <AdSlot slot="bg-remove-bottom" format="horizontal" className="mb-12" />

        {/* SEO Content */}
        <div className="mb-12 rounded-2xl border border-border/40 bg-card/80 p-6 sm:p-8">
          <h2 className="text-xl font-bold">
            {tr ? "AI ile Arka Plan Kaldırma Nasıl Çalışır?" : "How Does AI Background Removal Work?"}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {tr
                ? "Renderhane'nin arka plan kaldırma aracı, gelişmiş AI modelleri kullanarak fotoğraftaki ürünü otomatik olarak tespit eder ve arka planı temizler. İşlem saniyeler sürer ve profesyonel kalitede sonuç verir."
                : "Renderhane's background removal tool uses advanced AI models to automatically detect the product in your photo and remove the background. The process takes seconds and delivers professional-quality results."}
            </p>
            <p>
              {tr
                ? "E-ticaret mağazaları, sosyal medya yöneticileri ve grafik tasarımcılar için idealdir. PNG formatında şeffaf arka planlı görsel indirebilirsiniz."
                : "Ideal for e-commerce stores, social media managers, and graphic designers. You can download images with transparent backgrounds in PNG format."}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Box className="size-4" />
            Renderhane
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            {tr
              ? "AI destekli görsel üretim platformu — E-ticaret, Oyun, 3D Baskı"
              : "AI-powered visual production platform — E-commerce, Gaming, 3D Printing"}
          </p>
        </div>
      </footer>
    </div>
  );
}
