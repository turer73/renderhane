"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AdSlot } from "@/components/ads/ad-slot";
import {
  Download,
  Link2,
  Phone,
  Mail,
  Wifi,
  MapPin,
  User,
  MessageSquare,
  FileText,
  ArrowRight,
  QrCode,
  Star,
  CheckCircle2,
  Zap,
  Palette,
  Infinity,
  Shield,
  Box,
  type LucideIcon,
} from "lucide-react";
import QRCode from "qrcode";

/* ── Content Types ─────────────────────────────── */

type ContentType =
  | "url"
  | "vcard"
  | "wifi"
  | "phone"
  | "email"
  | "sms"
  | "location"
  | "text";

interface ContentOption {
  id: ContentType;
  icon: LucideIcon;
  labelTr: string;
  labelEn: string;
  color: string;
}

const CONTENT_TYPES: ContentOption[] = [
  { id: "url", icon: Link2, labelTr: "Web Adresi", labelEn: "URL", color: "text-blue-500" },
  { id: "vcard", icon: User, labelTr: "Kişi Kartı", labelEn: "Contact Card", color: "text-purple-500" },
  { id: "wifi", icon: Wifi, labelTr: "WiFi", labelEn: "WiFi", color: "text-cyan-500" },
  { id: "phone", icon: Phone, labelTr: "Telefon", labelEn: "Phone", color: "text-emerald-500" },
  { id: "email", icon: Mail, labelTr: "E-posta", labelEn: "Email", color: "text-amber-500" },
  { id: "sms", icon: MessageSquare, labelTr: "SMS", labelEn: "SMS", color: "text-pink-500" },
  { id: "location", icon: MapPin, labelTr: "Konum", labelEn: "Location", color: "text-red-500" },
  { id: "text", icon: FileText, labelTr: "Metin", labelEn: "Text", color: "text-slate-500" },
];

/* ── Payload builders ──────── */

function buildPayload(type: ContentType, fields: Record<string, string>): string {
  switch (type) {
    case "url": return fields.url || "";
    case "vcard": {
      const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${fields.lastName || ""};${fields.firstName || ""};;;`, `FN:${fields.firstName || ""} ${fields.lastName || ""}`.trim()];
      if (fields.phone) lines.push(`TEL;TYPE=CELL:${fields.phone}`);
      if (fields.email) lines.push(`EMAIL:${fields.email}`);
      if (fields.org) lines.push(`ORG:${fields.org}`);
      if (fields.title) lines.push(`TITLE:${fields.title}`);
      if (fields.address) lines.push(`ADR;TYPE=WORK:;;${fields.address};;;;`);
      if (fields.website) lines.push(`URL:${fields.website}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }
    case "wifi": {
      const enc = fields.encryption || "WPA";
      const hidden = fields.hidden === "true" ? "H:true;" : "";
      return `WIFI:T:${enc};S:${fields.ssid || ""};P:${fields.password || ""};${hidden};`;
    }
    case "phone": return `tel:${fields.phone || ""}`;
    case "email": {
      const mailto = `mailto:${fields.email || ""}`;
      const params: string[] = [];
      if (fields.subject) params.push(`subject=${encodeURIComponent(fields.subject)}`);
      if (fields.body) params.push(`body=${encodeURIComponent(fields.body)}`);
      return params.length ? `${mailto}?${params.join("&")}` : mailto;
    }
    case "sms": {
      const sms = `sms:${fields.phone || ""}`;
      return fields.body ? `${sms}?body=${encodeURIComponent(fields.body)}` : sms;
    }
    case "location": return `geo:${fields.lat || "0"},${fields.lon || "0"}`;
    case "text": return fields.text || "";
  }
}

/* ── Page Component ────────────────────────────── */

export default function PublicQRCodePage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  const [contentType, setContentType] = useState<ContentType>("url");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [qrPngUrl, setQrPngUrl] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error"; text: string } | null>(null);

  const setField = (key: string, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const resetPreview = () => { setQrPngUrl(null); setQrSvg(null); setMessage(null); };

  const payload = buildPayload(contentType, fields);
  const isValid = payload.trim().length > 0;

  async function generateQR() {
    const data = buildPayload(contentType, fields);
    if (!data.trim()) {
      setMessage({ type: "error", text: tr ? "Lütfen gerekli alanları doldurun." : "Please fill required fields." });
      return;
    }
    setMessage(null);
    try {
      const [pngUrl, svgStr] = await Promise.all([
        QRCode.toDataURL(data, { width: 1024, margin: 2, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "H" }),
        QRCode.toString(data, { type: "svg", width: 1024, margin: 2, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "H" }),
      ]);
      setQrPngUrl(pngUrl);
      setQrSvg(svgStr);
    } catch {
      setMessage({ type: "error", text: tr ? "QR oluşturulamadı." : "Failed to generate QR." });
    }
  }

  function downloadPNG() {
    if (!qrPngUrl) return;
    const link = document.createElement("a");
    link.download = `qr-${contentType}-${Date.now()}.png`;
    link.href = qrPngUrl;
    link.click();
  }

  function downloadSVG() {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `qr-${contentType}-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  const features = [
    { icon: Infinity, title: tr ? "Sınırsız Kullanım" : "Unlimited Use", desc: tr ? "Limit yok" : "No limits", color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-500/10" },
    { icon: Zap, title: tr ? "Anında Oluştur" : "Instant Generation", desc: tr ? "Milisaniyeler içinde" : "In milliseconds", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" },
    { icon: Palette, title: tr ? "8 İçerik Tipi" : "8 Content Types", desc: tr ? "URL, WiFi, vCard..." : "URL, WiFi, vCard...", color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-500/10" },
    { icon: Shield, title: tr ? "PNG + SVG İndirme" : "PNG + SVG Download", desc: tr ? "Yüksek kalite" : "High quality", color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  ];

  /* ── Dynamic Form ──────────────────────────── */
  function renderFields() {
    const inputCls = "mt-1.5";
    switch (contentType) {
      case "url":
        return (<div><label className="text-sm font-medium">URL</label><Input value={fields.url || ""} onChange={(e) => { setField("url", e.target.value); resetPreview(); }} placeholder="https://www.renderhane.com" className={inputCls} type="url" /></div>);
      case "vcard":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">{tr ? "Ad" : "First Name"} *</label><Input value={fields.firstName || ""} onChange={(e) => { setField("firstName", e.target.value); resetPreview(); }} placeholder="Ahmet" className={inputCls} /></div>
              <div><label className="text-sm font-medium">{tr ? "Soyad" : "Last Name"}</label><Input value={fields.lastName || ""} onChange={(e) => { setField("lastName", e.target.value); resetPreview(); }} placeholder="Yilmaz" className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">{tr ? "Telefon" : "Phone"}</label><Input value={fields.phone || ""} onChange={(e) => { setField("phone", e.target.value); resetPreview(); }} placeholder="+905551234567" className={inputCls} type="tel" /></div>
              <div><label className="text-sm font-medium">{tr ? "E-posta" : "Email"}</label><Input value={fields.email || ""} onChange={(e) => { setField("email", e.target.value); resetPreview(); }} placeholder="ahmet@firma.com" className={inputCls} type="email" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">{tr ? "Firma" : "Company"}</label><Input value={fields.org || ""} onChange={(e) => { setField("org", e.target.value); resetPreview(); }} placeholder="Renderhane" className={inputCls} /></div>
              <div><label className="text-sm font-medium">{tr ? "Unvan" : "Title"}</label><Input value={fields.title || ""} onChange={(e) => { setField("title", e.target.value); resetPreview(); }} placeholder={tr ? "Yazılım Müh." : "Software Eng."} className={inputCls} /></div>
            </div>
            <div><label className="text-sm font-medium">{tr ? "Web Sitesi" : "Website"}</label><Input value={fields.website || ""} onChange={(e) => { setField("website", e.target.value); resetPreview(); }} placeholder="https://renderhane.com" className={inputCls} type="url" /></div>
          </div>
        );
      case "wifi":
        return (
          <div className="space-y-3">
            <div><label className="text-sm font-medium">{tr ? "Ağ Adı (SSID)" : "Network Name (SSID)"} *</label><Input value={fields.ssid || ""} onChange={(e) => { setField("ssid", e.target.value); resetPreview(); }} placeholder="MyWiFi" className={inputCls} /></div>
            <div><label className="text-sm font-medium">{tr ? "Şifre" : "Password"}</label><Input value={fields.password || ""} onChange={(e) => { setField("password", e.target.value); resetPreview(); }} placeholder="********" className={inputCls} type="text" /></div>
            <div>
              <label className="text-sm font-medium">{tr ? "Şifreleme" : "Encryption"}</label>
              <div className="mt-1.5 flex gap-2">
                {(["WPA", "WEP", "nopass"] as const).map((enc) => (
                  <button key={enc} onClick={() => { setField("encryption", enc); resetPreview(); }} className={`rounded-lg border px-4 py-2 text-sm transition-all ${(fields.encryption || "WPA") === enc ? "border-cyan-400 bg-cyan-500/10 font-medium text-cyan-600 dark:text-cyan-400" : "border-muted hover:border-cyan-300"}`}>
                    {enc === "nopass" ? (tr ? "Açık" : "Open") : enc}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case "phone":
        return (<div><label className="text-sm font-medium">{tr ? "Telefon Numarası" : "Phone Number"} *</label><Input value={fields.phone || ""} onChange={(e) => { setField("phone", e.target.value); resetPreview(); }} placeholder="+905551234567" className={inputCls} type="tel" /></div>);
      case "email":
        return (
          <div className="space-y-3">
            <div><label className="text-sm font-medium">{tr ? "E-posta Adresi" : "Email Address"} *</label><Input value={fields.email || ""} onChange={(e) => { setField("email", e.target.value); resetPreview(); }} placeholder="info@renderhane.com" className={inputCls} type="email" /></div>
            <div><label className="text-sm font-medium">{tr ? "Konu" : "Subject"}</label><Input value={fields.subject || ""} onChange={(e) => { setField("subject", e.target.value); resetPreview(); }} placeholder={tr ? "Merhaba" : "Hello"} className={inputCls} /></div>
          </div>
        );
      case "sms":
        return (
          <div className="space-y-3">
            <div><label className="text-sm font-medium">{tr ? "Telefon Numarası" : "Phone Number"} *</label><Input value={fields.phone || ""} onChange={(e) => { setField("phone", e.target.value); resetPreview(); }} placeholder="+905551234567" className={inputCls} type="tel" /></div>
            <div><label className="text-sm font-medium">{tr ? "Mesaj" : "Message"}</label><Input value={fields.body || ""} onChange={(e) => { setField("body", e.target.value); resetPreview(); }} placeholder={tr ? "Merhaba" : "Hi"} className={inputCls} /></div>
          </div>
        );
      case "location":
        return (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium">{tr ? "Enlem" : "Latitude"} *</label><Input value={fields.lat || ""} onChange={(e) => { setField("lat", e.target.value); resetPreview(); }} placeholder="41.0082" className={inputCls} type="number" step="any" /></div>
            <div><label className="text-sm font-medium">{tr ? "Boylam" : "Longitude"} *</label><Input value={fields.lon || ""} onChange={(e) => { setField("lon", e.target.value); resetPreview(); }} placeholder="28.9784" className={inputCls} type="number" step="any" /></div>
          </div>
        );
      case "text":
        return (
          <div><label className="text-sm font-medium">{tr ? "Metin" : "Text"} *</label>
            <textarea value={fields.text || ""} onChange={(e) => { setField("text", e.target.value); resetPreview(); }} placeholder={tr ? "Herhangi bir metin yazın..." : "Enter any text..."} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" rows={3} />
          </div>
        );
    }
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 pb-16 pt-8 text-white">
        <div className="absolute inset-0">
          <div className="absolute left-1/3 top-0 h-[400px] w-[400px] rounded-full bg-white/5 blur-[100px]" />
          <div className="absolute right-1/4 bottom-0 h-[300px] w-[300px] rounded-full bg-cyan-400/10 blur-[80px]" />
          {/* QR pattern overlay */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        </div>

        {/* Top bar */}
        <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 pb-8">
          <Link href={`/${locale}`} className="flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors">
            <Box className="size-5" />
            Renderhane
          </Link>
          <Link href={`/${locale}/login`} className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold backdrop-blur-sm transition-all hover:bg-white/25">
            {tr ? "Giriş Yap" : "Sign In"}<ArrowRight className="ml-1.5 inline size-3.5" />
          </Link>
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
            <QrCode className="size-4" />
            {tr ? "Tamamen Ücretsiz • Sınırsız" : "Completely Free • Unlimited"}
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            {tr ? "QR Kod" : "QR Code"}
            <span className="block bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent">
              {tr ? "Oluşturucu" : "Generator"}
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
            {tr
              ? "URL, kişi kartı, WiFi, telefon, e-posta, konum — 8 farklı içerik tipinde QR kod oluşturun."
              : "URL, contact card, WiFi, phone, email, location — generate QR codes for 8 different content types."}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        {/* Main Tool Card */}
        <div className="-mt-8 mb-8">
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-2xl shadow-emerald-200/30 dark:shadow-emerald-900/20 sm:p-8">
            {/* Content Type Selector */}
            <div className="mb-6">
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                {tr ? "İçerik Tipi Seçin:" : "Choose Content Type:"}
              </p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 snap-x sm:grid sm:grid-cols-8 sm:overflow-visible sm:pb-0">
                {CONTENT_TYPES.map(({ id, icon: Icon, labelTr, labelEn, color }) => (
                  <button
                    key={id}
                    onClick={() => { setContentType(id); setFields({}); resetPreview(); }}
                    className={`flex shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all min-w-[72px] sm:min-w-0 sm:shrink ${
                      contentType === id
                        ? "border-emerald-400 bg-emerald-50 shadow-sm dark:border-emerald-600 dark:bg-emerald-500/10"
                        : "border-border/40 hover:border-emerald-300 hover:bg-muted/50 dark:hover:border-emerald-700"
                    }`}
                  >
                    <Icon className={`size-5 ${contentType === id ? color : "text-muted-foreground"}`} />
                    <span className={`text-[10px] font-medium leading-tight whitespace-nowrap ${contentType === id ? "text-foreground" : "text-muted-foreground"}`}>
                      {tr ? labelTr : labelEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Form */}
              <div className="space-y-4">
                {renderFields()}

                <Button
                  onClick={generateQR}
                  disabled={!isValid}
                  className="w-full h-12 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-base font-semibold shadow-lg shadow-emerald-200/40 hover:from-emerald-700 hover:to-teal-700 dark:shadow-emerald-900/30"
                >
                  <QrCode className="size-5" />
                  {tr ? "QR Kod Oluştur" : "Generate QR Code"}
                </Button>

                {message && (
                  <div className="rounded-xl px-4 py-3 text-sm font-medium bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">
                    {message.text}
                  </div>
                )}
              </div>

              {/* QR Preview */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6">
                {qrPngUrl ? (
                  <div className="space-y-4 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrPngUrl} alt="QR Code" className="mx-auto size-56 rounded-2xl border shadow-lg" />
                    <div className="mx-auto max-w-xs rounded-lg bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground break-all line-clamp-2">{payload}</p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <Button onClick={downloadPNG} variant="outline" className="gap-2 h-10">
                        <Download className="size-4" /> PNG
                      </Button>
                      <Button onClick={downloadSVG} variant="outline" className="gap-2 h-10">
                        <Download className="size-4" /> SVG
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-500/20 dark:to-teal-500/20">
                      <QrCode className="size-10 text-emerald-600/40 dark:text-emerald-400/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tr ? "QR kodunuz burada görünecek" : "Your QR code will appear here"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Ad Slot — Top */}
        <AdSlot slot="qr-code-top" format="horizontal" className="mb-8" />

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

        {/* Bottom Ad */}
        <AdSlot slot="qr-code-bottom" format="horizontal" className="mb-12" />

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
