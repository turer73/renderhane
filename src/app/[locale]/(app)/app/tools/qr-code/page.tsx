"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import QRCode from "qrcode";

export default function QRCodePage() {
  const t = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [url, setUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"standard" | "ai">("standard");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateStandardQR = useCallback(async () => {
    if (!url.trim()) {
      setMessage({ type: "error", text: locale === "tr" ? "Lütfen bir URL girin." : "Please enter a URL." });
      return;
    }
    setMessage(null);
    try {
      const dataUrl = await QRCode.toDataURL(url.trim(), {
        width: 1024,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      setQrDataUrl(dataUrl);
    } catch {
      setMessage({ type: "error", text: locale === "tr" ? "QR oluşturulamadı." : "Failed to generate QR." });
    }
  }, [url, locale]);

  const generateAIQR = useCallback(async () => {
    if (!url.trim()) {
      setMessage({ type: "error", text: locale === "tr" ? "Lütfen bir URL girin." : "Please enter a URL." });
      return;
    }
    setSubmitting(true);
    setMessage(null);

    try {
      // AI QR uses text-to-image with a QR-specific prompt
      const qrPrompt = `A beautiful artistic QR code that encodes "${url.trim()}", modern design, scannable, creative pattern integrated with QR matrix, high contrast for scanning`;

      const res = await fetch("/api/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "qr-code",
          prompt: qrPrompt,
        }),
      });

      if (res.status === 402) {
        setMessage({ type: "error", text: t("insufficientCredits") });
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
          detail: { jobId: result.jobId, tool: "qr-code" },
        })
      );

      setMessage({
        type: "success",
        text: locale === "tr"
          ? "AI QR oluşturuluyor! ~10sn sürecek."
          : "AI QR generating! Will take ~10s.",
      });
    } catch {
      setMessage({ type: "error", text: t("jobError") });
    } finally {
      setSubmitting(false);
    }
  }, [url, locale, t]);

  function downloadQR() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.download = `qr-code-${Date.now()}.png`;
    link.href = qrDataUrl;
    link.click();
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
            📷 {tTools("qrCode")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "tr"
              ? "Standart (ücretsiz) veya AI sanatsal QR kod oluşturun"
              : "Create standard (free) or AI artistic QR codes"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {/* URL Input */}
          <div>
            <label className="text-sm font-medium">URL</label>
            <Input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setQrDataUrl(null); }}
              placeholder="https://www.renderhane.com"
              className="mt-1.5"
              type="url"
            />
          </div>

          {/* Mode Toggle */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "Tür" : "Type"}
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <button
                onClick={() => { setMode("standard"); setQrDataUrl(null); }}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  mode === "standard"
                    ? "border-emerald-400 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5"
                    : "border-muted hover:border-emerald-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">⬛</span>
                  <span className="text-sm font-semibold">{locale === "tr" ? "Standart" : "Standard"}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {locale === "tr" ? "Ücretsiz • Anında • PNG/SVG" : "Free • Instant • PNG/SVG"}
                </span>
              </button>
              <button
                onClick={() => { setMode("ai"); setQrDataUrl(null); }}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  mode === "ai"
                    ? "border-purple-400 bg-gradient-to-br from-purple-500/10 to-purple-500/5"
                    : "border-muted hover:border-purple-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎨</span>
                  <span className="text-sm font-semibold">{locale === "tr" ? "AI Sanatsal" : "AI Artistic"}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {locale === "tr" ? "6 kredi • ~10sn • Stilize" : "6 credits • ~10s • Stylized"}
                </span>
              </button>
            </div>
          </div>

          {/* Generate Button */}
          {mode === "standard" ? (
            <Button
              onClick={generateStandardQR}
              disabled={!url.trim()}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800"
            >
              {locale === "tr" ? "⬛ QR Kod Oluştur (Ücretsiz)" : "⬛ Generate QR (Free)"}
            </Button>
          ) : (
            <Button
              onClick={generateAIQR}
              disabled={!url.trim() || submitting}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800"
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("submitting")}</>
              ) : (
                locale === "tr" ? "🎨 AI QR Oluştur (6 kredi)" : "🎨 Generate AI QR (6 credits)"
              )}
            </Button>
          )}

          {/* Standard QR Preview + Download */}
          {qrDataUrl && mode === "standard" && (
            <div className="space-y-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="mx-auto h-64 w-64 rounded-xl border"
              />
              <Button onClick={downloadQR} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                {locale === "tr" ? "PNG İndir" : "Download PNG"}
              </Button>
            </div>
          )}

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

          <canvas ref={canvasRef} className="hidden" />
        </CardContent>
      </Card>
    </div>
  );
}
