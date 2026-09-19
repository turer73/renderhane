"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowRight,
  Star,
  CheckCircle2,
  Shield,
  Box,
  Infinity,
  Zap,
  Palette,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/landing-header";
import { EngineToolView } from "@/components/tools/engine-tool-view";

export default function PublicQRCodePage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";
  const engineLocale = locale === "en" ? "en" : "tr";

  const features = [
    { icon: Infinity, title: tr ? "Sınırsız Kullanım" : "Unlimited Use", desc: tr ? "Limit yok" : "No limits", color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-500/10" },
    { icon: Zap, title: tr ? "Anında Oluştur" : "Instant Generation", desc: tr ? "Milisaniyeler içinde" : "In milliseconds", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" },
    { icon: Palette, title: tr ? "8 İçerik Tipi" : "8 Content Types", desc: tr ? "URL, WiFi, vCard..." : "URL, WiFi, vCard...", color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-500/10" },
    { icon: Shield, title: tr ? "PNG + SVG İndirme" : "PNG + SVG Download", desc: tr ? "Yüksek kalite" : "High quality", color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  ];
  return (
    <div className="min-h-screen">
      <LandingHeader />
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <EngineToolView
          locale={engineLocale}
          page="qr"
          label={tr ? "QR kod çalışma alanı" : "QR code workspace"}
        />
        {/* Feature Cards */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:mb-12 sm:grid-cols-4 sm:gap-4">
          {features.map((f, i) => (
            <div key={i} className="group rounded-xl border border-border/60 bg-card p-3 text-center transition-all duration-300 hover:border-emerald-200 hover:shadow-lg dark:hover:border-emerald-800 sm:rounded-2xl sm:p-5">
              <div className={`mx-auto mb-2 flex size-10 items-center justify-center rounded-lg ${f.bg} transition-transform group-hover:scale-110 sm:mb-3 sm:size-12 sm:rounded-xl`}>
                <f.icon className={`size-5 ${f.color} sm:size-6`} />
              </div>
              <h3 className="text-xs font-bold sm:text-sm">{f.title}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Upsell CTA */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-6 text-center text-white shadow-xl shadow-emerald-200/30 dark:shadow-emerald-900/20 sm:rounded-3xl sm:p-12">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <Star className="size-4 text-amber-300" fill="currentColor" />
              {tr ? "AI Sanatsal QR Kod" : "AI Artistic QR Code"}
            </div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">
              {tr ? "Daha Fazlasını Keşfedin" : "Discover More"}
            </h2>
            <p className="mt-3 text-white/80">
              {tr
                ? "AI sanatsal QR kodları, arka plan kaldırma, 3D model, video üretimi ve 12+ araç. 50 ücretsiz kredi ile başlayın."
                : "AI artistic QR codes, background removal, 3D models, video generation and 12+ tools. Start with 50 free credits."}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="gap-2 bg-white text-emerald-700 font-bold shadow-lg hover:bg-white/90 transition-all">
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

        {/* SEO Content */}
        <div className="mb-12 rounded-2xl border border-border/40 bg-card/80 p-6 sm:p-8">
          <h2 className="text-xl font-bold">
            {tr ? "QR Kod Nedir? Nasıl Kullanılır?" : "What is a QR Code? How to Use?"}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {tr
                ? "QR Kod (Quick Response Code), akıllı telefonlar tarafından okunabilen iki boyutlu bir barkod türüdür. Web sitesi adresi, iletişim bilgileri, WiFi şifresi gibi verileri hızlıca paylaşmanızı sağlar."
                : "A QR Code (Quick Response Code) is a type of two-dimensional barcode that can be read by smartphones. It allows you to quickly share data such as website addresses, contact information, and WiFi passwords."}
            </p>
            <p>
              {tr
                ? "Renderhane'nin QR kod oluşturucusu tamamen ücretsizdir, sınırsız kullanım sunar ve kayıt gerektirmez. PNG ve SVG formatında yüksek kaliteli QR kodları indirebilirsiniz."
                : "Renderhane's QR code generator is completely free, offers unlimited usage, and requires no registration. You can download high-quality QR codes in PNG and SVG formats."}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <Box className="size-4" /> Renderhane
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            {tr ? "AI destekli görsel üretim platformu — E-ticaret, Oyun, 3D Baskı" : "AI-powered visual production platform — E-commerce, Gaming, 3D Printing"}
          </p>
        </div>
      </footer>
    </div>
  );
}
