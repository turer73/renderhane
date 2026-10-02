import { IMAGE_FORMATS, MIN_IMAGE_DIMENSION, type ImageFormat, type ImageInputLimits } from "./image-formats";
import type { ImageProbe } from "./image-probe";

/**
 * Pure limit checks shared by the browser and the server. Messages are
 * Turkish user copy and never contain a URL, so a signed storage token or a
 * provider response cannot leak through an error.
 */

export type ImageInputIssueCode =
  | "too_many_images"
  | "too_few_images"
  | "too_large"
  | "unsupported_format"
  | "corrupt"
  | "dimensions_too_small"
  | "dimensions_too_large"
  | "too_many_pixels"
  | "unreachable"
  | "timeout";

export interface ImageInputIssue {
  code: ImageInputIssueCode;
  /** Zero-based position of the image in the request, or null for the set. */
  index: number | null;
  message: string;
  /** Form field the image came from, when a form has several image fields. */
  field?: string;
}

export interface ImageFacts {
  bytes: number;
  probe: ImageProbe;
}

/** Where an image sits in its request; the message names it only in a set. */
export interface ImagePosition {
  index: number;
  count: number;
}

const MB = 1_000_000;

export function formatBytesTr(bytes: number): string {
  if (bytes >= MB) {
    const value = bytes / MB;
    const shown = value >= 10 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1).replace(".", ",");
    return `${shown} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export function formatListTr(formats: readonly ImageFormat[]): string {
  const labels = formats.map((format) => IMAGE_FORMATS[format].label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} veya ${labels[labels.length - 1]}`;
}

function issue(code: ImageInputIssueCode, position: ImagePosition | null, message: string): ImageInputIssue {
  const named = position !== null && position.count > 1 ? `${position.index + 1}. görsel: ` : "";
  return { code, index: position?.index ?? null, message: `${named}${message}` };
}

export function checkImageCount(count: number, limits: ImageInputLimits): ImageInputIssue | null {
  if (count > limits.maxImages) {
    return issue(
      "too_many_images",
      null,
      limits.maxImages === 0
        ? "Bu model görsel girdisi kabul etmiyor."
        : `En fazla ${limits.maxImages} görsel seçebilirsiniz (seçilen: ${count}).`
    );
  }
  if (count < limits.minImages) {
    return issue("too_few_images", null, `Bu model için en az ${limits.minImages} görsel gerekli.`);
  }
  return null;
}

/** Every limit the image breaks; empty when it can be sent as is. */
export function checkImageFacts(facts: ImageFacts, limits: ImageInputLimits, position: ImagePosition | null): ImageInputIssue[] {
  const issues: ImageInputIssue[] = [];
  const { probe } = facts;
  const pixels = probe.width * probe.height;
  if (pixels > limits.maxPixels) {
    issues.push(issue(
      "too_many_pixels",
      position,
      `Görsel ${(pixels / 1_000_000).toFixed(0)} megapiksel; işlenebilecek en büyük boyut ${(limits.maxPixels / 1_000_000).toFixed(0)} megapiksel.`
    ));
  }
  if (!limits.formats.includes(probe.format)) {
    issues.push(issue(
      "unsupported_format",
      position,
      `${IMAGE_FORMATS[probe.format].label} biçimi bu modelde desteklenmiyor. Desteklenen biçimler: ${formatListTr(limits.formats)}.`
    ));
  }
  if (facts.bytes > limits.maxBytes) {
    issues.push(issue(
      "too_large",
      position,
      `Dosya ${formatBytesTr(facts.bytes)}; bu model en fazla ${formatBytesTr(limits.maxBytes)} kabul ediyor.`
    ));
  }
  const shortSide = Math.min(probe.width, probe.height);
  const longSide = Math.max(probe.width, probe.height);
  if (shortSide < limits.minDimension) {
    issues.push(issue(
      "dimensions_too_small",
      position,
      `Görsel ${probe.width}×${probe.height} piksel; her kenar en az ${limits.minDimension} piksel olmalı.`
    ));
  }
  if (limits.maxDimension !== null && longSide > limits.maxDimension) {
    issues.push(issue(
      "dimensions_too_large",
      position,
      `Görsel ${probe.width}×${probe.height} piksel; bu model en fazla ${limits.maxDimension} piksel kenar kabul ediyor.`
    ));
  }
  return issues;
}

export function unreadableImageIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("corrupt", position, "Dosya okunamadı ya da desteklenen bir görsel değil. Dosyayı yeniden kaydedip tekrar deneyin.");
}

/** The header was valid, but the pixel data could not be decoded. */
export function undecodableImageIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("corrupt", position, "Görselin piksel verisi çözülemedi; dosya bozuk veya eksik görünüyor. Dosyayı yeniden kaydedip tekrar deneyin.");
}

export function decodeTimeoutIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("timeout", position, "Görsel zamanında çözümlenemedi. Daha küçük bir dosyayla tekrar deneyin.");
}

export function unreachableImageIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("unreachable", position, "Görsele ulaşılamadı. Bağlantının süresi dolmuş olabilir; görseli yeniden yükleyin.");
}

export function timeoutImageIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("timeout", position, "Görsel zamanında indirilemedi. Lütfen tekrar deneyin.");
}

export function tooLargeToReadIssue(position: ImagePosition | null, limits: ImageInputLimits): ImageInputIssue {
  return issue(
    "too_large",
    position,
    `Dosya bu model için çok büyük; en fazla ${formatBytesTr(limits.maxBytes)} kabul ediliyor.`
  );
}

/** Non-blocking provider guidance, e.g. a preferred aspect ratio. */
export function adviseImageFacts(facts: ImageFacts, limits: ImageInputLimits): string[] {
  const notes: string[] = [];
  const { width, height } = facts.probe;
  for (const advisory of limits.advisories) {
    if (advisory.code === "preferred_min_short_side" && Math.min(width, height) < advisory.pixels) {
      notes.push(`Bu model en az ${advisory.pixels}p çözünürlük öneriyor; sonuç kalitesi düşebilir.`);
    }
    if (advisory.code === "preferred_aspect") {
      const ratio = width / height;
      const matches = advisory.ratios.some((value) => {
        const [w, h] = value.split(":").map(Number);
        return Math.abs(ratio - w / h) < 0.02;
      });
      if (!matches) {
        notes.push(`Bu model ${advisory.ratios.join(" veya ")} oranı öneriyor; görsel sağlayıcıda kırpılabilir.`);
      }
    }
  }
  return notes;
}

/** One-line Turkish summary of what the model accepts, for helper text. */
export function limitsSummaryTr(limits: ImageInputLimits): string {
  const parts = [formatListTr(limits.formats), `en fazla ${formatBytesTr(limits.maxBytes)}`];
  if (limits.maxDimension !== null) {
    parts.push(`${limits.minDimension}–${limits.maxDimension} piksel`);
  } else if (limits.minDimension > MIN_IMAGE_DIMENSION) {
    parts.push(`en az ${limits.minDimension} piksel`);
  }
  if (limits.maxImages > 1) parts.push(`en fazla ${limits.maxImages} görsel`);
  return parts.join(" · ");
}

/** Turkish note for limits the provider does not document. */
export function unverifiedLimitsNoteTr(limits: ImageInputLimits): string | null {
  const missing: string[] = [];
  if (!limits.verification.formats) missing.push("biçim");
  if (!limits.verification.size) missing.push("dosya boyutu");
  if (missing.length === 0) return null;
  return `Sağlayıcı bu model için ${missing.join(" ve ")} sınırını belgelemiyor; genel güvenlik sınırları uygulanıyor (${formatListTr(limits.formats)}, en fazla ${formatBytesTr(limits.maxBytes)}).`;
}
