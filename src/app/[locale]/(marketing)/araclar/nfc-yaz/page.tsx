"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  Contact,
  Copy,
  Laptop,
  Layers,
  Link2,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  PencilLine,
  Phone,
  QrCode,
  Radio,
  ScanLine,
  Share2,
  Smartphone,
  Sparkles,
  Square,
  Star,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import QRCode from "qrcode";
import {
  buildNdefRecords,
  describeRecord,
  isNfcInputValid,
  ndefMessageBytes,
  recordsToForm,
  tagFit,
  type DecodedRecord,
  type NfcContentType,
} from "@/lib/nfc/ndef";
import { buildShareUrl, readShareHash } from "@/lib/nfc/share";
import { AuthCta } from "@/components/auth/auth-cta";

/* ── Content Types ─────────────────────────────── */

interface ContentOption {
  id: NfcContentType;
  icon: LucideIcon;
  labelTr: string;
  labelEn: string;
  color: string;
}

const CONTENT_TYPES: ContentOption[] = [
  { id: "url", icon: Link2, labelTr: "Web Adresi", labelEn: "URL", color: "text-blue-500" },
  { id: "vcard", icon: Contact, labelTr: "Kişi Kartı", labelEn: "Contact", color: "text-purple-500" },
  { id: "wifi", icon: Wifi, labelTr: "WiFi", labelEn: "WiFi", color: "text-cyan-500" },
  { id: "phone", icon: Phone, labelTr: "Telefon", labelEn: "Phone", color: "text-emerald-500" },
  { id: "email", icon: Mail, labelTr: "E-posta", labelEn: "Email", color: "text-amber-500" },
  { id: "sms", icon: MessageSquare, labelTr: "SMS", labelEn: "SMS", color: "text-pink-500" },
  { id: "location", icon: MapPin, labelTr: "Konum", labelEn: "Location", color: "text-red-500" },
  { id: "app", icon: Smartphone, labelTr: "Uygulama", labelEn: "App", color: "text-lime-600" },
  { id: "text", icon: Layers, labelTr: "Metin", labelEn: "Text", color: "text-slate-500" },
];

type Support = "checking" | "ready" | "ios" | "android-other" | "desktop";
type Mode = "idle" | "writing" | "scanning";

interface Status {
  type: "info" | "success" | "error";
  text: string;
}

const WRITE_TIMEOUT_MS = 60_000;
/** Gap between batch writes so the tag that was just written is off the antenna. */
const BATCH_GAP_MS = 1_800;

function errorText(error: unknown, tr: boolean): string {
  const name = (error as { name?: string } | null)?.name;
  switch (name) {
    case "AbortError":
      return tr ? "İşlem durduruldu." : "Operation stopped.";
    case "TimeoutError":
      return tr
        ? "Etiket algılanmadı. NFC anteni çoğu telefonda arka kameranın yanındadır — etiketi oraya değdirip tekrar deneyin."
        : "No tag detected. The NFC antenna sits near the rear camera on most phones — hold the tag there and try again.";
    case "NotAllowedError":
      return tr
        ? "NFC izni verilmedi. Tarayıcı adres çubuğundaki kilit simgesinden bu siteye NFC izni verin."
        : "NFC permission denied. Allow NFC for this site from the lock icon in the address bar.";
    case "NotSupportedError":
      return tr
        ? "Bu cihaz veya tarayıcı NFC yazmayı desteklemiyor."
        : "This device or browser cannot write NFC tags.";
    case "NotReadableError":
      return tr
        ? "NFC kapalı görünüyor. Telefon ayarlarından NFC'yi açıp tekrar deneyin."
        : "NFC appears to be off. Enable NFC in your phone settings and try again.";
    case "NetworkError":
      return tr
        ? "Etikete yazılamadı: etiket kilitli olabilir, kapasitesi yetmeyebilir ya da çok erken uzaklaştırılmış olabilir."
        : "Write failed: the tag may be locked, too small, or moved away too early.";
    default:
      return `${tr ? "Hata" : "Error"}: ${(error as Error)?.message || String(error)}`;
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/* ── Page Component ────────────────────────────── */

export default function PublicNfcWriterPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  const [support, setSupport] = useState<Support>("checking");
  const [contentType, setContentType] = useState<NfcContentType>("url");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>("idle");
  const [status, setStatus] = useState<Status | null>(null);
  const [batch, setBatch] = useState(false);
  const [lockAfterWrite, setLockAfterWrite] = useState(false);
  const [writeCount, setWriteCount] = useState(0);
  const [scanned, setScanned] = useState<{ serial: string; records: DecodedRecord[] } | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareQr, setShareQr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const batchRef = useRef(batch);
  const lockRef = useRef(lockAfterWrite);

  useEffect(() => {
    batchRef.current = batch;
  }, [batch]);
  useEffect(() => {
    lockRef.current = lockAfterWrite;
  }, [lockAfterWrite]);

  useEffect(() => {
    if (typeof window !== "undefined" && "NDEFReader" in window) {
      setSupport("ready");
      return;
    }
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/iPhone|iPad|iPod/i.test(ua)) setSupport("ios");
    else if (/Android/i.test(ua)) setSupport("android-other");
    else setSupport("desktop");
  }, []);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  // Content handed over from another device arrives in the URL fragment.
  useEffect(() => {
    const handoff = readShareHash(window.location.hash);
    if (!handoff) return;
    setContentType(handoff.type);
    setFields(handoff.fields);
    setStatus({
      type: "info",
      text: tr
        ? "İçerik bağlantıdan yüklendi — etikete yazmaya hazır."
        : "Content loaded from the link — ready to write.",
    });
  }, [tr]);

  // Never leave a scan or write armed behind us.
  useEffect(() => () => abortRef.current?.abort(), []);

  const setField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setStatus(null);
  };

  const records = buildNdefRecords(contentType, fields, { lang: locale });
  const bytes = ndefMessageBytes(records);
  const isValid = isNfcInputValid(contentType, fields);
  const preview = records.length ? describeRecord(records[0]) : null;
  const busy = mode !== "idle";

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMode("idle");
  }, []);

  // Keep the handoff link (and its QR) in step with the form while it is open.
  useEffect(() => {
    if (!handoffOpen || !isValid) return;
    const url = buildShareUrl(window.location.origin, window.location.pathname, {
      type: contentType,
      fields,
    });
    setShareUrl(url);
    setCopied(false);

    let cancelled = false;
    // Long payloads can exceed QR capacity — the copy/share link still works.
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "L" })
      .then((dataUrl) => !cancelled && setShareQr(dataUrl))
      .catch(() => !cancelled && setShareQr(null));
    return () => {
      cancelled = true;
    };
  }, [handoffOpen, isValid, contentType, fields]);

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus({
        type: "error",
        text: tr
          ? "Kopyalanamadı — bağlantıyı elle seçip kopyalayın."
          : "Copy failed — select the link and copy it manually.",
      });
    }
  }

  async function shareLink() {
    if (!shareUrl) return;
    try {
      await navigator.share({
        title: tr ? "NFC etiket içeriği" : "NFC tag content",
        url: shareUrl,
      });
    } catch {
      /* user dismissed the share sheet */
    }
  }

  function loadScanIntoForm() {
    const form = scanned && recordsToForm(scanned.records);
    if (!form) return;
    setContentType(form.type);
    setFields(form.fields);
    setScanned(null);
    setStatus({
      type: "success",
      text: tr
        ? "Etiket içeriği forma yüklendi — düzenleyip yeniden yazabilir veya bilgisayara gönderebilirsiniz."
        : "Tag content loaded into the form — edit and rewrite it, or send it to your computer.",
    });
  }

  async function writeTag() {
    if (!isValid) {
      setStatus({
        type: "error",
        text: tr ? "Lütfen gerekli alanları doldurun." : "Please fill the required fields.",
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setMode("writing");
    setWriteCount(0);
    setScanned(null);
    setStatus({
      type: "info",
      text: tr
        ? "Telefonu etikete yaklaştırın…"
        : "Hold your phone against the tag…",
    });

    let written = 0;
    try {
      const reader = new NDEFReader();
      // Re-armed for each tag so batch runs keep a fresh detection window.
      for (;;) {
        const timer = setTimeout(
          () => controller.abort(new DOMException("Timed out", "TimeoutError")),
          WRITE_TIMEOUT_MS
        );
        try {
          await reader.write({ records }, { overwrite: true, signal: controller.signal });
          if (lockRef.current) {
            await reader.makeReadOnly({ signal: controller.signal });
          }
        } finally {
          clearTimeout(timer);
        }

        written += 1;
        setWriteCount(written);
        setStatus({
          type: "success",
          text: lockRef.current
            ? tr
              ? `Etiket yazıldı ve kalıcı olarak kilitlendi (${written}).`
              : `Tag written and permanently locked (${written}).`
            : tr
              ? `Etiket yazıldı (${written}).`
              : `Tag written (${written}).`,
        });

        if (!batchRef.current) break;

        setStatus({
          type: "info",
          text: tr
            ? `${written} etiket yazıldı. Etiketi çekip bir sonrakini yaklaştırın…`
            : `${written} tags written. Remove it and present the next one…`,
        });
        await delay(BATCH_GAP_MS, controller.signal);
      }
    } catch (error) {
      const aborted = (error as { name?: string })?.name === "AbortError";
      setStatus({
        type: aborted && written > 0 ? "success" : "error",
        text:
          aborted && written > 0
            ? tr
              ? `Durduruldu — ${written} etiket yazıldı.`
              : `Stopped — ${written} tags written.`
            : errorText(error, tr),
      });
    } finally {
      abortRef.current = null;
      setMode("idle");
    }
  }

  async function scanTag() {
    const controller = new AbortController();
    abortRef.current = controller;
    setMode("scanning");
    setScanned(null);
    setStatus({
      type: "info",
      text: tr ? "Okumak için etikete yaklaştırın…" : "Hold a tag to read it…",
    });

    try {
      const reader = new NDEFReader();
      reader.onreading = (event) => {
        setScanned({
          serial: event.serialNumber,
          records: Array.from(event.message.records).map((record) => describeRecord(record)),
        });
        setStatus({
          type: "success",
          text: tr ? "Etiket okundu." : "Tag read.",
        });
        controller.abort();
        abortRef.current = null;
        setMode("idle");
      };
      reader.onreadingerror = () => {
        setStatus({
          type: "error",
          text: tr
            ? "Etiket okunamadı — biçimi desteklenmiyor olabilir."
            : "Could not read the tag — its format may be unsupported.",
        });
      };
      await reader.scan({ signal: controller.signal });
    } catch (error) {
      setStatus({ type: "error", text: errorText(error, tr) });
      abortRef.current = null;
      setMode("idle");
    }
  }

  /* ── Dynamic Form ──────────────────────────── */
  function renderFields() {
    const inputCls = "mt-1.5 h-12 text-base";
    switch (contentType) {
      case "url":
        return (
          <div>
            <label className="text-sm font-medium">{tr ? "Web Adresi" : "URL"} *</label>
            <Input
              value={fields.url || ""}
              onChange={(e) => setField("url", e.target.value)}
              placeholder="renderhane.com"
              className={inputCls}
              type="url"
              inputMode="url"
              autoCapitalize="none"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tr
                ? "Başında https:// yoksa otomatik eklenir."
                : "https:// is added automatically when missing."}
            </p>
          </div>
        );
      case "vcard":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{tr ? "Ad" : "First Name"} *</label>
                <Input value={fields.firstName || ""} onChange={(e) => setField("firstName", e.target.value)} placeholder="Ahmet" className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium">{tr ? "Soyad" : "Last Name"}</label>
                <Input value={fields.lastName || ""} onChange={(e) => setField("lastName", e.target.value)} placeholder="Yilmaz" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{tr ? "Telefon" : "Phone"}</label>
                <Input value={fields.phone || ""} onChange={(e) => setField("phone", e.target.value)} placeholder="+905551234567" className={inputCls} type="tel" inputMode="tel" />
              </div>
              <div>
                <label className="text-sm font-medium">{tr ? "E-posta" : "Email"}</label>
                <Input value={fields.email || ""} onChange={(e) => setField("email", e.target.value)} placeholder="ahmet@firma.com" className={inputCls} type="email" inputMode="email" autoCapitalize="none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{tr ? "Firma" : "Company"}</label>
                <Input value={fields.org || ""} onChange={(e) => setField("org", e.target.value)} placeholder="Renderhane" className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium">{tr ? "Unvan" : "Title"}</label>
                <Input value={fields.title || ""} onChange={(e) => setField("title", e.target.value)} placeholder={tr ? "Satış Müdürü" : "Sales Manager"} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Web Sitesi" : "Website"}</label>
              <Input value={fields.website || ""} onChange={(e) => setField("website", e.target.value)} placeholder="https://renderhane.com" className={inputCls} type="url" autoCapitalize="none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Instagram</label>
                <Input value={fields.instagram || ""} onChange={(e) => setField("instagram", e.target.value)} placeholder={tr ? "kullaniciadi" : "username"} className={inputCls} autoCapitalize="none" />
              </div>
              <div>
                <label className="text-sm font-medium">WhatsApp</label>
                <Input value={fields.whatsapp || ""} onChange={(e) => setField("whatsapp", e.target.value)} placeholder="905551234567" className={inputCls} type="tel" inputMode="tel" />
              </div>
            </div>
          </div>
        );
      case "wifi":
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{tr ? "Ağ Adı (SSID)" : "Network Name (SSID)"} *</label>
              <Input value={fields.ssid || ""} onChange={(e) => setField("ssid", e.target.value)} placeholder="MyWiFi" className={inputCls} autoCapitalize="none" />
            </div>
            {(fields.encryption || "WPA") !== "nopass" && (
              <div>
                <label className="text-sm font-medium">{tr ? "Şifre" : "Password"}</label>
                <Input value={fields.password || ""} onChange={(e) => setField("password", e.target.value)} placeholder="********" className={inputCls} type="text" autoCapitalize="none" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">{tr ? "Şifreleme" : "Encryption"}</label>
              <div className="mt-1.5 flex gap-2">
                {(["WPA", "WEP", "nopass"] as const).map((enc) => (
                  <button
                    key={enc}
                    type="button"
                    onClick={() => setField("encryption", enc)}
                    className={`rounded-lg border px-4 py-2.5 text-sm transition-all ${
                      (fields.encryption || "WPA") === enc
                        ? "border-violet-400 bg-violet-500/10 font-medium text-violet-600 dark:text-violet-400"
                        : "border-muted hover:border-violet-300"
                    }`}
                  >
                    {enc === "nopass" ? (tr ? "Açık" : "Open") : enc === "WPA" ? "WPA/WPA2" : enc}
                  </button>
                ))}
              </div>
            </div>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {tr
                ? "WiFi etiketleri Android'de dokunuşla ağa bağlar. iPhone NFC ile WiFi'ye katılmaz — iPhone'lar için QR kod kullanın."
                : "Wi-Fi tags join the network on tap on Android. iPhones cannot join Wi-Fi over NFC — use a QR code for those."}
            </p>
          </div>
        );
      case "phone":
        return (
          <div>
            <label className="text-sm font-medium">{tr ? "Telefon Numarası" : "Phone Number"} *</label>
            <Input value={fields.phone || ""} onChange={(e) => setField("phone", e.target.value)} placeholder="+905551234567" className={inputCls} type="tel" inputMode="tel" />
          </div>
        );
      case "email":
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{tr ? "E-posta Adresi" : "Email Address"} *</label>
              <Input value={fields.email || ""} onChange={(e) => setField("email", e.target.value)} placeholder="info@renderhane.com" className={inputCls} type="email" inputMode="email" autoCapitalize="none" />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Konu" : "Subject"}</label>
              <Input value={fields.subject || ""} onChange={(e) => setField("subject", e.target.value)} placeholder={tr ? "Merhaba" : "Hello"} className={inputCls} />
            </div>
          </div>
        );
      case "sms":
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{tr ? "Telefon Numarası" : "Phone Number"} *</label>
              <Input value={fields.phone || ""} onChange={(e) => setField("phone", e.target.value)} placeholder="+905551234567" className={inputCls} type="tel" inputMode="tel" />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Mesaj" : "Message"}</label>
              <Input value={fields.body || ""} onChange={(e) => setField("body", e.target.value)} placeholder={tr ? "Merhaba" : "Hi"} className={inputCls} />
            </div>
          </div>
        );
      case "location":
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">{tr ? "Enlem" : "Latitude"} *</label>
              <Input value={fields.lat || ""} onChange={(e) => setField("lat", e.target.value)} placeholder="41.0082" className={inputCls} type="number" step="any" inputMode="decimal" />
            </div>
            <div>
              <label className="text-sm font-medium">{tr ? "Boylam" : "Longitude"} *</label>
              <Input value={fields.lon || ""} onChange={(e) => setField("lon", e.target.value)} placeholder="28.9784" className={inputCls} type="number" step="any" inputMode="decimal" />
            </div>
          </div>
        );
      case "app":
        return (
          <div>
            <label className="text-sm font-medium">{tr ? "Uygulama Paket Adı" : "App Package Name"} *</label>
            <Input value={fields.packageName || ""} onChange={(e) => setField("packageName", e.target.value)} placeholder="com.instagram.android" className={inputCls} autoCapitalize="none" />
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {tr
                ? "Android uygulamayı doğrudan açar (AAR kaydı); kurulu değilse Play Store'a gider. iPhone'da Play Store bağlantısı açılır."
                : "Opens the Android app directly (AAR record); falls back to the Play Store if it is not installed. iPhones open the Play Store link."}
            </p>
          </div>
        );
      case "text":
        return (
          <div>
            <label className="text-sm font-medium">{tr ? "Metin" : "Text"} *</label>
            <textarea
              value={fields.text || ""}
              onChange={(e) => setField("text", e.target.value)}
              placeholder={tr ? "Etikete yazılacak metin…" : "Text to write on the tag…"}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={3}
            />
          </div>
        );
    }
  }

  /* ── Support notice ────────────────────────── */
  function renderSupportNotice() {
    if (support === "checking" || support === "ready") return null;

    const text =
      support === "ios"
        ? tr
          ? "iPhone'da Safari NFC etiketine yazamaz (Apple Web NFC'yi desteklemiyor). iPhone'unuz etiketleri okuyabilir; yazmak için Android telefonda Chrome kullanın."
          : "Safari on iPhone cannot write NFC tags (Apple does not support Web NFC). Your iPhone can read tags; use Chrome on Android to write them."
        : support === "android-other"
          ? tr
            ? "Tarayıcınız Web NFC desteklemiyor. Android'de Chrome 89+ (veya Edge) ile açın ve telefon ayarlarından NFC'yi açın."
            : "Your browser does not support Web NFC. Open this page in Chrome 89+ (or Edge) on Android and turn NFC on in settings."
          : tr
            ? "NFC yazma yalnızca NFC donanımı olan telefonlarda çalışır. Bu sayfayı Android telefonunuzda Chrome ile açın."
            : "NFC writing only works on phones with NFC hardware. Open this page in Chrome on your Android phone.";

    return (
      <div className="mb-6 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {tr ? "Bu cihazda etiket yazılamıyor" : "This device cannot write tags"}
            </p>
            <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300/90">{text}</p>
            <p className="text-sm text-amber-800 dark:text-amber-300/90">
              {tr ? "İçeriği şimdi hazırlayıp " : "You can still prepare the content here, or "}
              <Link href={`/${locale}/araclar/qr-kod`} className="font-semibold underline underline-offset-2">
                {tr ? "QR kod olarak da paylaşabilirsiniz" : "share it as a QR code"}
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: Radio,
      title: tr ? "Kurulum Yok" : "No App Needed",
      desc: tr ? "Tarayıcıdan yazar" : "Writes from the browser",
      color: "text-violet-500",
      bg: "bg-violet-50 dark:bg-violet-500/10",
    },
    {
      icon: Layers,
      title: tr ? "Seri Yazma" : "Batch Writing",
      desc: tr ? "Yüzlerce etiket, tek ayar" : "Hundreds of tags, one setup",
      color: "text-fuchsia-500",
      bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10",
    },
    {
      icon: Laptop,
      title: tr ? "Bilgisayar ↔ Telefon" : "Desktop ↔ Phone",
      desc: tr ? "QR ile içerik devri" : "Hand off over QR",
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-500/10",
    },
    {
      icon: Lock,
      title: tr ? "Kalıcı Kilit" : "Permanent Lock",
      desc: tr ? "Kopyalanamaz hale getirin" : "Make tags read-only",
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Compact Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 pb-12 pt-4 text-white sm:pb-14 sm:pt-6">
        <div className="absolute inset-0">
          <div className="absolute left-1/3 top-0 h-[300px] w-[300px] rounded-full bg-white/5 blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        </div>

        <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 pb-4 sm:pb-6">
          <Link href={`/${locale}`} className="flex items-center gap-2 text-sm font-semibold text-white/80 transition-colors hover:text-white">
            <Box className="size-5" />
            Renderhane
          </Link>
          <AuthCta locale={locale} />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm sm:text-sm">
            <Radio className="size-3.5" />
            {tr ? "Tamamen Ücretsiz • Sınırsız Etiket" : "Completely Free • Unlimited Tags"}
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
            {tr ? "NFC Etiket " : "NFC Tag "}
            <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent">
              {tr ? "Programlama" : "Writer"}
            </span>
          </h1>

          <p className="mx-auto mt-2 max-w-lg text-sm text-white/75 sm:text-base">
            {tr
              ? "Telefonunuzla NFC kart ve etiketlere yazın: web adresi, dijital kartvizit, WiFi, konum. Uygulama kurmadan, doğrudan tarayıcıdan."
              : "Write NFC cards and tags straight from your phone: links, digital business cards, Wi-Fi, location. No app install, right in the browser."}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        {/* Main Tool Card */}
        <div className="-mt-8 mb-8">
          <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-2xl shadow-violet-200/30 dark:shadow-violet-900/20 sm:p-8">
            {renderSupportNotice()}

            {support === "ready" && (
              <div className="mb-6 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                {tr
                  ? "Cihazınız NFC yazmaya hazır. NFC'nin açık olduğundan emin olun."
                  : "Your device can write NFC tags. Make sure NFC is switched on."}
              </div>
            )}

            {/* Content Type Selector */}
            <div className="mb-6">
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                {tr ? "İçerik Tipi Seçin:" : "Choose Content Type:"}
              </p>
              <div className="scrollbar-hide flex snap-x gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-9 sm:overflow-visible sm:pb-0">
                {CONTENT_TYPES.map(({ id, icon: Icon, labelTr, labelEn, color }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setContentType(id);
                      setFields({});
                      setStatus(null);
                    }}
                    className={`flex min-w-[72px] shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all disabled:opacity-50 sm:min-w-0 sm:shrink ${
                      contentType === id
                        ? "border-violet-400 bg-violet-50 shadow-sm dark:border-violet-600 dark:bg-violet-500/10"
                        : "border-border/40 hover:border-violet-300 hover:bg-muted/50 dark:hover:border-violet-700"
                    }`}
                  >
                    <Icon className={`size-5 ${contentType === id ? color : "text-muted-foreground"}`} />
                    <span className={`whitespace-nowrap text-[10px] font-medium leading-tight ${contentType === id ? "text-foreground" : "text-muted-foreground"}`}>
                      {tr ? labelTr : labelEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Form */}
              <div className="space-y-4">{renderFields()}</div>

              {/* Tag panel */}
              <div className="space-y-4">
                {/* Byte budget */}
                <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      {tr ? "Etiket boyutu" : "Tag size"}
                    </span>
                    <span className="text-lg font-bold">
                      {bytes} <span className="text-xs font-normal text-muted-foreground">bytes</span>
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tagFit(bytes).map((tag) => (
                      <span
                        key={tag.id}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          tag.fits
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground line-through"
                        }`}
                      >
                        {tag.id}
                      </span>
                    ))}
                  </div>
                  {preview && (
                    <p className="mt-3 break-all rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground line-clamp-3">
                      {preview.value || preview.raw || "—"}
                    </p>
                  )}
                </div>

                {/* Options */}
                <div className="space-y-2 rounded-2xl border border-border/60 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={batch}
                      disabled={busy}
                      onChange={(e) => setBatch(e.target.checked)}
                      className="mt-0.5 size-4 accent-violet-600"
                    />
                    <span className="text-sm">
                      <span className="font-medium">{tr ? "Seri yazma" : "Batch mode"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {tr
                          ? "Durdurana kadar etiketleri arka arkaya yazar."
                          : "Keeps writing tag after tag until you stop."}
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={lockAfterWrite}
                      disabled={busy}
                      onChange={(e) => setLockAfterWrite(e.target.checked)}
                      className="mt-0.5 size-4 accent-red-600"
                    />
                    <span className="text-sm">
                      <span className="font-medium">{tr ? "Yazdıktan sonra kilitle" : "Lock after writing"}</span>
                      <span className="block text-xs text-red-600 dark:text-red-400">
                        {tr
                          ? "Geri alınamaz — etiket bir daha yazılamaz."
                          : "Irreversible — the tag can never be rewritten."}
                      </span>
                    </span>
                  </label>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  {mode === "writing" || mode === "scanning" ? (
                    <Button onClick={stop} variant="outline" className="h-14 w-full gap-2 border-violet-300 text-base font-semibold">
                      <Square className="size-4" fill="currentColor" />
                      {tr ? "Durdur" : "Stop"}
                    </Button>
                  ) : (
                    <Button
                      onClick={writeTag}
                      disabled={!isValid || support !== "ready"}
                      className="h-14 w-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-base font-semibold text-white shadow-lg shadow-violet-200/40 hover:from-violet-700 hover:to-fuchsia-700 dark:shadow-violet-900/30"
                    >
                      <Radio className="size-5" />
                      {lockAfterWrite
                        ? tr
                          ? "Yaz ve Kilitle"
                          : "Write & Lock"
                        : tr
                          ? "Etikete Yaz"
                          : "Write to Tag"}
                    </Button>
                  )}

                  <Button
                    onClick={scanTag}
                    disabled={busy || support !== "ready"}
                    variant="outline"
                    className="h-12 w-full gap-2"
                  >
                    <ScanLine className="size-4" />
                    {tr ? "Etiketi Oku" : "Read a Tag"}
                  </Button>
                </div>

                {/* Live status */}
                {(status || writeCount > 0) && (
                  <div
                    className={`rounded-xl px-4 py-3 text-sm font-medium ${
                      status?.type === "error"
                        ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                        : status?.type === "success"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {busy && (
                        <span className="relative flex size-2.5 shrink-0">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
                          <span className="relative inline-flex size-2.5 rounded-full bg-current" />
                        </span>
                      )}
                      <span>{status?.text}</span>
                    </div>
                    {batch && writeCount > 0 && (
                      <p className="mt-1 text-xs opacity-80">
                        {tr ? `Toplam yazılan: ${writeCount}` : `Total written: ${writeCount}`}
                      </p>
                    )}
                  </div>
                )}

                {/* Scan result */}
                {scanned && (
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      {tr ? "Okunan etiket" : "Tag read"} · {scanned.serial || "—"}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {scanned.records.length === 0 && (
                        <li className="text-sm text-muted-foreground">{tr ? "Etiket boş." : "Tag is empty."}</li>
                      )}
                      {scanned.records.map((record, i) => (
                        <li key={i} className="rounded-lg bg-background/60 px-3 py-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                            {record.kind}
                          </span>
                          <p className="break-all text-sm">{record.value || record.raw || "—"}</p>
                        </li>
                      ))}
                    </ul>
                    {recordsToForm(scanned.records) && (
                      <Button onClick={loadScanIntoForm} variant="outline" className="mt-3 h-11 w-full gap-2">
                        <PencilLine className="size-4" />
                        {tr ? "Forma yükle ve düzenle" : "Load into the form"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cross-device handoff */}
        <div className="mb-8 rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10">
                {support === "ready" ? (
                  <Laptop className="size-5 text-violet-600 dark:text-violet-400" />
                ) : (
                  <Smartphone className="size-5 text-violet-600 dark:text-violet-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {support === "ready"
                    ? tr
                      ? "Bilgisayarda düzenle"
                      : "Edit on your computer"
                    : tr
                      ? "Telefonda yaz"
                      : "Write from your phone"}
                </p>
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  {support === "ready"
                    ? tr
                      ? "Okuduğunuz veya hazırladığınız içeriği bağlantı olarak kendinize gönderin, bilgisayarda klavyeyle düzenleyin."
                      : "Send what you read or prepared to yourself as a link and finish editing on a keyboard."
                    : tr
                      ? "İçeriği burada hazırlayın, QR kodu telefonunuzun kamerasıyla okutun, yazma işlemini telefonda tamamlayın."
                      : "Prepare the content here, scan the QR with your phone camera, and write the tag there."}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setHandoffOpen((open) => !open)}
              disabled={!isValid}
              variant="outline"
              className="w-full shrink-0 gap-2 sm:w-auto"
            >
              <Share2 className="size-4" />
              {handoffOpen ? (tr ? "Gizle" : "Hide") : tr ? "Bağlantı Oluştur" : "Create Link"}
            </Button>
          </div>

          {handoffOpen && (
            <div className="mt-5 border-t pt-5">
              {isValid ? (
                <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
                  {shareQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shareQr}
                      alt={tr ? "İçerik devri QR kodu" : "Handoff QR code"}
                      className="mx-auto size-44 rounded-2xl border bg-white p-2 shadow-sm"
                    />
                  ) : (
                    <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {tr
                        ? "İçerik QR koda sığmayacak kadar uzun — bağlantıyı kopyalayarak gönderin."
                        : "Too long for a QR code — send the link instead."}
                    </p>
                  )}
                  <div className="space-y-3">
                    <p className="break-all rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {shareUrl}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={copyLink} variant="outline" className="h-11 gap-2">
                        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        {copied ? (tr ? "Kopyalandı" : "Copied") : tr ? "Bağlantıyı Kopyala" : "Copy Link"}
                      </Button>
                      {canShare && (
                        <Button onClick={shareLink} variant="outline" className="h-11 gap-2">
                          <Share2 className="size-4" />
                          {tr ? "Paylaş" : "Share"}
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {tr
                        ? "İçerik bağlantının # işaretinden sonrasında taşınır, sunucuya gönderilmez. Yine de WiFi şifresi gibi bilgiler bağlantının içindedir — yalnızca kendinize gönderin."
                        : "The content rides after the # in the link and never reaches the server. It is still inside the link though — send it only to yourself."}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {tr ? "Önce içerik alanlarını doldurun." : "Fill the content fields first."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Feature Cards */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:mb-12 sm:grid-cols-4 sm:gap-4">
          {features.map((f, i) => (
            <div key={i} className="group rounded-xl border border-border/60 bg-card p-3 text-center transition-all duration-300 hover:border-violet-200 hover:shadow-lg dark:hover:border-violet-800 sm:rounded-2xl sm:p-5">
              <div className={`mx-auto mb-2 flex size-10 items-center justify-center rounded-lg ${f.bg} transition-transform group-hover:scale-110 sm:mb-3 sm:size-12 sm:rounded-xl`}>
                <f.icon className={`size-5 ${f.color} sm:size-6`} />
              </div>
              <h3 className="text-xs font-bold sm:text-sm">{f.title}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Cross-link to QR */}
        <div className="mb-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:flex-row sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
              <QrCode className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">{tr ? "iPhone kullanıcıları için QR kod" : "QR codes for iPhone users"}</p>
              <p className="text-xs text-muted-foreground">
                {tr
                  ? "Aynı içeriği QR kod olarak da üretin — ücretsiz."
                  : "Generate the same content as a QR code — free."}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="w-full gap-2 sm:w-auto">
            <Link href={`/${locale}/araclar/qr-kod`}>
              {tr ? "QR Kod Oluştur" : "Create QR Code"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        {/* Upsell CTA */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-6 text-center text-white shadow-xl shadow-violet-200/30 dark:shadow-violet-900/20 sm:rounded-3xl sm:p-12">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <Star className="size-4 text-amber-300" fill="currentColor" />
              {tr ? "NFC Kartınızın Tasarımı" : "Design for Your NFC Card"}
            </div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">
              {tr ? "Etiketi yazdınız, ya kartın yüzü?" : "Tag written — now the card itself"}
            </h2>
            <p className="mt-3 text-white/80">
              {tr
                ? "Kartvizit görseli, logo tasarımı, ürün fotoğrafı ve 12+ AI aracı. 50 ücretsiz kredi ile başlayın."
                : "Card artwork, logo design, product photos and 12+ AI tools. Start with 50 free credits."}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="gap-2 bg-white font-bold text-violet-700 shadow-lg transition-all hover:bg-white/90">
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
        <div className="mb-12 space-y-6 rounded-2xl border border-border/40 bg-card/80 p-6 sm:p-8">
          <div>
            <h2 className="text-xl font-bold">
              {tr ? "NFC etiket nasıl programlanır?" : "How do you program an NFC tag?"}
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "NFC (Near Field Communication), telefonu bir etikete birkaç santimetre yaklaştırdığınızda veri aktaran kablosuz teknolojidir. Etikete yazılan veri NDEF adı verilen standart bir biçimde saklanır; bu sayfa telefonunuzun tarayıcısındaki Web NFC arayüzünü kullanarak bu NDEF mesajını doğrudan etikete yazar — aracı bir uygulama yoktur."
                  : "NFC (Near Field Communication) moves data when you hold a phone a few centimetres from a tag. What gets written is a standard NDEF message, and this page writes that message straight to the tag through your phone browser's Web NFC interface — no intermediary app."}
              </p>
              <p>
                {tr
                  ? "İçerik tipini seçin, alanları doldurun, \"Etikete Yaz\" düğmesine dokunun ve telefonu etikete değdirin. Yazma işlemi bir saniyeden kısa sürer. Seri yazma modunda ayarları bir kez yapar, etiketleri sırayla değdirerek yüzlercesini programlarsınız."
                  : "Pick a content type, fill the fields, tap \"Write to Tag\" and touch the tag with your phone. The write takes under a second. Batch mode configures once and programs hundreds of tags as you present them one by one."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr ? "Hangi telefonlar NFC etiketine yazabilir?" : "Which phones can write NFC tags?"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Yazma işlemi Web NFC gerektirir: NFC donanımı olan Android telefonlarda Chrome 89 ve üzeri (Edge dahil). iPhone'lar NFC etiketlerini okuyabilir ancak Safari Web NFC'yi desteklemediği için tarayıcıdan yazamaz. Masaüstü bilgisayarlarda NFC anteni bulunmaz."
                  : "Writing needs Web NFC: Chrome 89+ (and Edge) on Android phones with NFC hardware. iPhones can read NFC tags, but Safari does not support Web NFC, so they cannot write from the browser. Desktop machines have no NFC antenna."}
              </p>
              <p>
                {tr
                  ? "Sayfa HTTPS üzerinden çalışır ve NFC izni ilk yazma denemesinde sorulur. Telefon ayarlarından NFC kapalıysa tarayıcı hata döndürür."
                  : "The page runs over HTTPS and asks for NFC permission on your first write. If NFC is off in system settings, the browser returns an error."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr
                ? "Bilgisayarda hazırlayıp telefonda yazmak"
                : "Prepare on a computer, write from the phone"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Uzun bir kartvizit veya adresi telefon klavyesinde yazmak zahmetlidir. Bilgisayarda formu doldurun, \"Bağlantı Oluştur\" düğmesiyle çıkan QR kodu telefonunuzun kamerasıyla okutun: sayfa telefonda aynı içerikle dolu açılır ve tek dokunuşla etikete yazarsınız."
                  : "Typing a long contact card on a phone keyboard is a chore. Fill the form on your computer, tap \"Create Link\" and scan the QR with your phone camera: the page opens there already filled in, one tap from writing the tag."}
              </p>
              <p>
                {tr
                  ? "Ters yönü de çalışır: telefonda \"Etiketi Oku\" ile mevcut bir etiketi okuyun, \"Forma yükle ve düzenle\" deyin, çıkan bağlantıyı kendinize gönderin ve bilgisayarda düzenlemeye devam edin. İçerik bağlantının # işaretinden sonraki kısmında taşınır; tarayıcı bu kısmı sunucuya göndermez, dolayısıyla WiFi şifreniz veya iletişim bilgileriniz sunucu kayıtlarına düşmez."
                  : "It works the other way too: read an existing tag on your phone, tap \"Load into the form\", send yourself the link and keep editing on the computer. The content travels after the # in the link, which browsers never send to the server, so your Wi-Fi password or contact details stay out of server logs."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr ? "Hangi etiketi almalıyım? (NTAG213 / 215 / 216)" : "Which tag should I buy? (NTAG213 / 215 / 216)"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Etiketlerin kapasitesi farklıdır: NTAG213 132 bayt, NTAG215 492 bayt, NTAG216 872 bayt NDEF mesajı alır. Kısa bir bağlantı için NTAG213 fazlasıyla yeter; fotoğraflı olmayan bir dijital kartvizit (vCard) genellikle NTAG215 ister. Yukarıdaki boyut göstergesi, girdiğiniz içeriğin hangi etiketlere sığdığını yazarken canlı gösterir."
                  : "Capacities differ: NTAG213 holds a 132-byte NDEF message, NTAG215 492 bytes, NTAG216 872 bytes. A short link fits an NTAG213 easily; a digital business card (vCard) usually wants an NTAG215. The size meter above shows live which tags your content still fits."}
              </p>
              <p>
                {tr
                  ? "Metale yapıştırılacak etiketlerde \"on-metal\" (metale uygun) sürümü seçin — düz etiketler metal yüzeyde okunmaz."
                  : "For metal surfaces choose an \"on-metal\" tag — plain stickers will not read on metal."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr ? "Etiketi kilitlemek ne yapar?" : "What does locking a tag do?"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Kilitleme, etiketi kalıcı olarak salt-okunur yapar: içerik bir daha değiştirilemez, silinemez. Müşteriye teslim edilen veya halka açık yere yapıştırılan etiketlerde içeriğin değiştirilmesini önler. İşlem geri alınamaz — kilitlemeden önce etiketi okuyup doğruladığınızdan emin olun."
                  : "Locking makes the tag permanently read-only: the content can never be changed or erased again. It protects tags handed to customers or stuck in public places from being rewritten. It cannot be undone — read the tag back and verify it before you lock."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold">
              {tr ? "Verilerim nereye gidiyor?" : "Where does my data go?"}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {tr
                  ? "Hiçbir yere. Girdiğiniz bilgiler tarayıcınızda NDEF mesajına dönüştürülüp doğrudan etikete yazılır; Renderhane sunucularına gönderilmez, kaydedilmez. Kayıt da gerekmez."
                  : "Nowhere. What you type is turned into an NDEF message in your browser and written straight to the tag; it is never sent to or stored on Renderhane servers. No sign-up required either."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <Box className="size-4" /> Renderhane
          </Link>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3" />
            {tr
              ? "AI destekli görsel üretim platformu — E-ticaret, Oyun, 3D Baskı"
              : "AI-powered visual production platform — E-commerce, Gaming, 3D Printing"}
          </p>
        </div>
      </footer>
    </div>
  );
}
