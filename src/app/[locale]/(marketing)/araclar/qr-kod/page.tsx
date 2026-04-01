"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowLeft,
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
}

const CONTENT_TYPES: ContentOption[] = [
  { id: "url", icon: Link2, labelTr: "Web Adresi", labelEn: "URL" },
  { id: "vcard", icon: User, labelTr: "Kişi Kartı", labelEn: "Contact Card" },
  { id: "wifi", icon: Wifi, labelTr: "WiFi", labelEn: "WiFi" },
  { id: "phone", icon: Phone, labelTr: "Telefon", labelEn: "Phone" },
  { id: "email", icon: Mail, labelTr: "E-posta", labelEn: "Email" },
  { id: "sms", icon: MessageSquare, labelTr: "SMS", labelEn: "SMS" },
  { id: "location", icon: MapPin, labelTr: "Konum", labelEn: "Location" },
  { id: "text", icon: FileText, labelTr: "Metin", labelEn: "Text" },
];

/* ── vCard / WiFi / etc. payload builders ──────── */

function buildPayload(type: ContentType, fields: Record<string, string>): string {
  switch (type) {
    case "url":
      return fields.url || "";

    case "vcard": {
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${fields.lastName || ""};${fields.firstName || ""};;;`,
        `FN:${fields.firstName || ""} ${fields.lastName || ""}`.trim(),
      ];
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

    case "phone":
      return `tel:${fields.phone || ""}`;

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

    case "location":
      return `geo:${fields.lat || "0"},${fields.lon || "0"}`;

    case "text":
      return fields.text || "";
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

  const resetPreview = () => {
    setQrPngUrl(null);
    setQrSvg(null);
    setMessage(null);
  };

  const payload = buildPayload(contentType, fields);
  const isValid = payload.trim().length > 0;

  /* ── Generate Standard QR ──────────────────── */

  async function generateQR() {
    const data = buildPayload(contentType, fields);
    if (!data.trim()) {
      setMessage({ type: "error", text: tr ? "Lütfen gerekli alanları doldurun." : "Please fill required fields." });
      return;
    }
    setMessage(null);
    try {
      const [pngUrl, svgStr] = await Promise.all([
        QRCode.toDataURL(data, {
          width: 1024,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "H",
        }),
        QRCode.toString(data, {
          type: "svg",
          width: 1024,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "H",
        }),
      ]);
      setQrPngUrl(pngUrl);
      setQrSvg(svgStr);
    } catch {
      setMessage({ type: "error", text: tr ? "QR oluşturulamadı." : "Failed to generate QR." });
    }
  }

  /* ── Downloads ─────────────────────────────── */

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

  /* ── Dynamic Form ──────────────────────────── */

  function renderFields() {
    const inputCls = "mt-1.5";

    switch (contentType) {
      case "url":
        return (
          <div>
            <label className="text-sm font-medium">URL</label>
            <Input
              value={fields.url || ""}
              onChange={(e) => { setField("url", e.target.value); resetPreview(); }}
              placeholder="https://www.renderhane.com"
              className={inputCls}
              type="url"
            />
          </div>
        );

      case "vcard":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{tr ? "Ad" : "First Name"} *</label>
                <Input value={fields.firstName || ""} onChange={(e) => { setField("firstName", e.target.value); resetPreview(); }} placeholder="Ahmet" className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium">{tr ? "Soyad" : "Last Name"}</label>
                <Input value={fields.lastName || ""} onChange={(e) => { setField("lastName", e.target.value); resetPreview(); }} placeholder="Yilmaz" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{tr ? "Telefon" : "Phone"}</label>
                <Input value={fields.phone || ""} onChange={(e) => { setField("phone", e.target.value); resetPreview(); }} placeholder="+905551234567" className={inputCls} type="tel" />
              </div>
              <div>
                <label className="text-sm font-medium">{tr ? "E-posta" : "Email"}</label>
                <Input value={fields.email || ""} onChange={(e) => { setField("email", e.target.value); resetPreview(); }} placeholder="ahmet@firma.com" className={inputCls} type="email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{tr ? "Firma" : "Company"}</label>
                <Input value={fields.org || ""} onChange={(e) => { setField("org", e.target.value); resetPreview(); }} placeholder="Renderhane" className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium">{tr ? "Unvan" : "Title"}</label>
                <Input value={fields.title || ""} onChange={(e) => { setField("title", e.target.value); resetPreview(); }} placeholder={tr ? "Yazılım Müh." : "Software Eng."} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Adres" : "Address"}</label>
              <Input value={fields.address || ""} onChange={(e) => { setField("address", e.target.value); resetPreview(); }} placeholder={tr ? "İstanbul, Türkiye" : "Istanbul, Turkey"} className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Web Sitesi" : "Website"}</label>
              <Input value={fields.website || ""} onChange={(e) => { setField("website", e.target.value); resetPreview(); }} placeholder="https://renderhane.com" className={inputCls} type="url" />
            </div>
          </div>
        );

      case "wifi":
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{tr ? "Ağ Adı (SSID)" : "Network Name (SSID)"} *</label>
              <Input value={fields.ssid || ""} onChange={(e) => { setField("ssid", e.target.value); resetPreview(); }} placeholder="MyWiFi" className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Şifre" : "Password"}</label>
              <Input value={fields.password || ""} onChange={(e) => { setField("password", e.target.value); resetPreview(); }} placeholder="********" className={inputCls} type="text" />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Şifreleme" : "Encryption"}</label>
              <div className="mt-1.5 flex gap-2">
                {(["WPA", "WEP", "nopass"] as const).map((enc) => (
                  <button
                    key={enc}
                    onClick={() => { setField("encryption", enc); resetPreview(); }}
                    className={`rounded-lg border px-4 py-2 text-sm transition-all ${
                      (fields.encryption || "WPA") === enc
                        ? "border-cyan-400 bg-cyan-500/10 font-medium text-cyan-600 dark:text-cyan-400"
                        : "border-muted hover:border-cyan-300"
                    }`}
                  >
                    {enc === "nopass" ? (tr ? "Açık" : "Open") : enc}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fields.hidden === "true"}
                onChange={(e) => { setField("hidden", e.target.checked ? "true" : "false"); resetPreview(); }}
                className="rounded"
              />
              {tr ? "Gizli Ağ" : "Hidden Network"}
            </label>
          </div>
        );

      case "phone":
        return (
          <div>
            <label className="text-sm font-medium">{tr ? "Telefon Numarası" : "Phone Number"} *</label>
            <Input value={fields.phone || ""} onChange={(e) => { setField("phone", e.target.value); resetPreview(); }} placeholder="+905551234567" className={inputCls} type="tel" />
          </div>
        );

      case "email":
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{tr ? "E-posta Adresi" : "Email Address"} *</label>
              <Input value={fields.email || ""} onChange={(e) => { setField("email", e.target.value); resetPreview(); }} placeholder="info@renderhane.com" className={inputCls} type="email" />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Konu" : "Subject"}</label>
              <Input value={fields.subject || ""} onChange={(e) => { setField("subject", e.target.value); resetPreview(); }} placeholder={tr ? "Merhaba" : "Hello"} className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Mesaj" : "Message"}</label>
              <Input value={fields.body || ""} onChange={(e) => { setField("body", e.target.value); resetPreview(); }} placeholder={tr ? "Bilgi almak istiyorum..." : "I'd like to learn more..."} className={inputCls} />
            </div>
          </div>
        );

      case "sms":
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{tr ? "Telefon Numarası" : "Phone Number"} *</label>
              <Input value={fields.phone || ""} onChange={(e) => { setField("phone", e.target.value); resetPreview(); }} placeholder="+905551234567" className={inputCls} type="tel" />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Mesaj" : "Message"}</label>
              <Input value={fields.body || ""} onChange={(e) => { setField("body", e.target.value); resetPreview(); }} placeholder={tr ? "Merhaba, bilgi almak istiyorum" : "Hi, I'd like more info"} className={inputCls} />
            </div>
          </div>
        );

      case "location":
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">{tr ? "Enlem" : "Latitude"} *</label>
              <Input value={fields.lat || ""} onChange={(e) => { setField("lat", e.target.value); resetPreview(); }} placeholder="41.0082" className={inputCls} type="number" step="any" />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Boylam" : "Longitude"} *</label>
              <Input value={fields.lon || ""} onChange={(e) => { setField("lon", e.target.value); resetPreview(); }} placeholder="28.9784" className={inputCls} type="number" step="any" />
            </div>
          </div>
        );

      case "text":
        return (
          <div>
            <label className="text-sm font-medium">{tr ? "Metin" : "Text"} *</label>
            <textarea
              value={fields.text || ""}
              onChange={(e) => { setField("text", e.target.value); resetPreview(); }}
              placeholder={tr ? "Herhangi bir metin yazın..." : "Enter any text..."}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={3}
            />
          </div>
        );
    }
  }

  /* ── Render ─────────────────────────────────── */

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
            {tr ? "🔲 Ücretsiz QR Kod Oluşturucu" : "🔲 Free QR Code Generator"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr
              ? "URL, kişi kartı, WiFi, telefon, e-posta ve daha fazlası — ücretsiz, kayıt gerektirmez"
              : "URL, contact card, WiFi, phone, email and more — free, no registration required"}
          </p>
        </div>

        {/* Content Type Selector */}
        <div className="flex flex-wrap justify-center gap-2">
          {CONTENT_TYPES.map(({ id, icon: Icon, labelTr, labelEn }) => (
            <button
              key={id}
              onClick={() => { setContentType(id); setFields({}); resetPreview(); }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                contentType === id
                  ? "border-indigo-400 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                  : "border-muted text-muted-foreground hover:border-indigo-300 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tr ? labelTr : labelEn}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            {/* Dynamic Fields */}
            {renderFields()}

            {/* Generate Button */}
            <Button
              onClick={generateQR}
              disabled={!isValid}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800"
            >
              {tr ? "🔲 QR Kod Oluştur (Ücretsiz)" : "🔲 Generate QR Code (Free)"}
            </Button>

            {/* QR Preview + Downloads */}
            {qrPngUrl && (
              <div className="space-y-3 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrPngUrl}
                  alt="QR Code"
                  className="mx-auto h-64 w-64 rounded-xl border"
                />

                {/* Payload Preview */}
                <div className="mx-auto max-w-sm rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground break-all line-clamp-3">{payload}</p>
                </div>

                {/* Download Buttons */}
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={downloadPNG} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    PNG
                  </Button>
                  <Button onClick={downloadSVG} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    SVG
                  </Button>
                </div>
              </div>
            )}

            {/* Messages */}
            {message && (
              <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">
                {message.text}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upsell: AI QR + More Tools */}
        <Card className="border-indigo-200 dark:border-indigo-800">
          <CardContent className="p-6 text-center">
            <p className="text-sm font-semibold">
              {tr ? "🎨 Daha fazlasını mı istiyorsunuz?" : "🎨 Want more?"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tr
                ? "AI Sanatsal QR kodları, arka plan kaldırma, 3D model üretimi ve 12+ araç"
                : "AI Artistic QR codes, background removal, 3D model generation and 12+ tools"}
            </p>
            <Button asChild variant="outline" className="mt-3 border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
              <Link href={`/${locale}/login`}>
                {tr ? "Ücretsiz Kayıt Ol — 50 Kredi Hediye" : "Sign Up Free — 50 Credits Gift"}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
