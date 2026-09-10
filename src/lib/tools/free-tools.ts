/**
 * Free tools — single source of truth for every place that links to
 * /araclar/*: landing header, footer, hero banner, and the logged-in app
 * (workspace header menu + sidebar).
 *
 * Adding a tool here surfaces it everywhere; before this list existed the
 * links were copy-pasted and the app area had none at all, so signing in
 * left users with no route back to the free tools.
 */

import { Eraser, QrCode, Radio, type LucideIcon } from "lucide-react";

export interface FreeTool {
  /** Path segment under /{locale}/araclar/ */
  slug: string;
  icon: LucideIcon;
  /** Key inside the "footer" i18n namespace, for next-intl consumers. */
  i18nKey: string;
  /** Inline copy for consumers that render outside the i18n provider. */
  title: { tr: string; en: string };
  subtitle: { tr: string; en: string };
  badge: { tr: string; en: string };
  gradient: string;
  hoverGradient: string;
}

export const FREE_TOOLS: FreeTool[] = [
  {
    slug: "arka-plan-kaldirma",
    icon: Eraser,
    i18nKey: "footer.bgRemoveFree",
    title: { tr: "Arka Plan Kaldır", en: "Remove Background" },
    subtitle: { tr: "Kayıt olmadan • Günde 3 hak", en: "No signup • 3/day free" },
    badge: { tr: "Ücretsiz", en: "Free" },
    gradient: "from-indigo-600 to-purple-600",
    hoverGradient: "hover:from-indigo-700 hover:to-purple-700",
  },
  {
    slug: "qr-kod",
    icon: QrCode,
    i18nKey: "footer.qrCodeFree",
    title: { tr: "QR Kod Oluşturucu", en: "QR Code Generator" },
    subtitle: { tr: "URL, vCard, WiFi, SVG indirme", en: "URL, vCard, WiFi, SVG download" },
    badge: { tr: "Sınırsız", en: "Unlimited" },
    gradient: "from-emerald-600 to-teal-600",
    hoverGradient: "hover:from-emerald-700 hover:to-teal-700",
  },
  {
    slug: "nfc-yaz",
    icon: Radio,
    i18nKey: "footer.nfcWriteFree",
    title: { tr: "NFC Etiket Yaz", en: "NFC Tag Writer" },
    subtitle: {
      tr: "Telefondan programla • Uygulama yok",
      en: "Program from your phone • No app",
    },
    badge: { tr: "Mobil", en: "Mobile" },
    gradient: "from-violet-600 to-fuchsia-600",
    hoverGradient: "hover:from-violet-700 hover:to-fuchsia-700",
  },
];

export function freeToolHref(locale: string, tool: FreeTool): string {
  return `/${locale}/araclar/${tool.slug}`;
}
