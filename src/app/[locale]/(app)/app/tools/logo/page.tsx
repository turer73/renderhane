"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

const LOGO_STYLES = [
  { id: "minimal", emoji: "⬜", tr: "Minimal", en: "Minimal", suffix: "minimal, clean lines, simple shapes, modern" },
  { id: "modern", emoji: "🔷", tr: "Modern", en: "Modern", suffix: "modern, geometric, bold, professional" },
  { id: "vintage", emoji: "🏛️", tr: "Vintage", en: "Vintage", suffix: "vintage, classic, retro, elegant serif" },
  { id: "playful", emoji: "🎨", tr: "Eğlenceli", en: "Playful", suffix: "playful, colorful, friendly, rounded shapes" },
] as const;

const ICON_TYPES = [
  { id: "abstract", tr: "Soyut", en: "Abstract" },
  { id: "lettermark", tr: "Harf", en: "Lettermark" },
  { id: "icon", tr: "İkon", en: "Icon" },
] as const;

export default function LogoPage() {
  const t = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [brandName, setBrandName] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<string>("minimal");
  const [iconType, setIconType] = useState<string>("abstract");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit() {
    if (!brandName.trim()) {
      setMessage({ type: "error", text: locale === "tr" ? "Lütfen marka adı girin." : "Please enter brand name." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const selectedStyle = LOGO_STYLES.find((s) => s.id === style);
      const logoPrompt = `Professional logo design for "${brandName.trim()}"${description ? `, ${description}` : ""}. Style: ${selectedStyle?.suffix || "minimal"}. ${iconType === "lettermark" ? "Lettermark/monogram logo using brand initials." : iconType === "icon" ? "Icon-based logo with a recognizable symbol." : "Abstract geometric logo mark."} Vector style, flat design, suitable for branding, transparent background`;

      const res = await fetch("/api/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "logo",
          prompt: logoPrompt,
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
          detail: { jobId: result.jobId, tool: "logo" },
        })
      );

      setMessage({
        type: "success",
        text: locale === "tr"
          ? "Logo tasarlanıyor! ~10sn sürecek."
          : "Logo being designed! Will take ~10s.",
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
            💎 {tTools("logo")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "tr"
              ? "AI ile profesyonel logo tasarla — 8 kredi"
              : "Design professional logos with AI — 8 credits"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {/* Brand Name */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "Marka Adı *" : "Brand Name *"}
            </label>
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={locale === "tr" ? "Örn: Renderhane" : "e.g. Renderhane"}
              className="mt-1.5"
              maxLength={50}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "Sektör / Açıklama (opsiyonel)" : "Industry / Description (optional)"}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={locale === "tr"
                ? "Örn: AI destekli e-ticaret görsel platformu"
                : "e.g. AI-powered e-commerce visual platform"}
              className="mt-1.5 min-h-[60px]"
              maxLength={200}
            />
          </div>

          {/* Style */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "Stil" : "Style"}
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LOGO_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`rounded-xl border px-3 py-2 text-center text-sm transition-all ${
                    style === s.id
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-500/10"
                      : "border-muted hover:border-teal-300"
                  }`}
                >
                  <span className="text-lg">{s.emoji}</span>
                  <br />
                  <span className="text-xs">{locale === "tr" ? s.tr : s.en}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Icon Type */}
          <div>
            <label className="text-sm font-medium">
              {locale === "tr" ? "Logo Tipi" : "Logo Type"}
            </label>
            <div className="mt-1.5 flex gap-2">
              {ICON_TYPES.map((it) => (
                <button
                  key={it.id}
                  onClick={() => setIconType(it.id)}
                  className={`rounded-lg border px-4 py-1.5 text-sm transition-all ${
                    iconType === it.id
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-500/10"
                      : "border-muted hover:border-teal-300"
                  }`}
                >
                  {locale === "tr" ? it.tr : it.en}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!brandName.trim() || submitting}
            className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700"
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("submitting")}</>
            ) : (
              locale === "tr" ? "💎 Logo Tasarla (8 kredi)" : "💎 Design Logo (8 credits)"
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
