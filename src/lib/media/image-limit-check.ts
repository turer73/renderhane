import { IMAGE_FORMATS, MIN_IMAGE_DIMENSION, type ImageFormat, type ImageInputLimits } from "./image-formats";
import type { ImageProbe } from "./image-probe";

/**
 * Pure limit checks shared by the browser and the server. Messages are
 * Turkish user copy (with an English `messageEn`) and never contain a URL, so
 * a signed storage token or a provider response cannot leak through an error.
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
  /** English copy of `message`; read it through `issueMessage`. */
  messageEn?: string;
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

export function formatBytesEn(bytes: number): string {
  return formatBytesTr(bytes).replace(",", ".");
}

export function formatListTr(formats: readonly ImageFormat[]): string {
  const labels = formats.map((format) => IMAGE_FORMATS[format].label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} veya ${labels[labels.length - 1]}`;
}

export function formatListEn(formats: readonly ImageFormat[]): string {
  const labels = formats.map((format) => IMAGE_FORMATS[format].label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/** Copy in both locales, for notes shown next to an image field. */
export interface LocalizedText {
  tr: string;
  en: string;
}

export function pickText(text: LocalizedText, locale: string | undefined): string {
  return locale === "en" ? text.en : text.tr;
}

/** The issue's message in the given locale (Turkish when no English copy exists). */
export function issueMessage(issue: Pick<ImageInputIssue, "message" | "messageEn">, locale: string | undefined): string {
  return locale === "en" && issue.messageEn ? issue.messageEn : issue.message;
}

/** Prefixes "2. görsel:" / "Image 2:" when the request holds several images. */
export function positionedIssue(
  code: ImageInputIssueCode,
  position: ImagePosition | null,
  tr: string,
  en: string
): ImageInputIssue {
  const many = position !== null && position.count > 1;
  return {
    code,
    index: position?.index ?? null,
    message: `${many ? `${position.index + 1}. görsel: ` : ""}${tr}`,
    messageEn: `${many ? `Image ${position.index + 1}: ` : ""}${en}`,
  };
}

const issue = positionedIssue;

export function checkImageCount(count: number, limits: ImageInputLimits): ImageInputIssue | null {
  if (count > limits.maxImages) {
    return issue(
      "too_many_images",
      null,
      limits.maxImages === 0
        ? "Bu model görsel girdisi kabul etmiyor."
        : `En fazla ${limits.maxImages} görsel seçebilirsiniz (seçilen: ${count}).`,
      limits.maxImages === 0
        ? "This model does not take image input."
        : `You can select up to ${limits.maxImages} images (selected: ${count}).`
    );
  }
  if (count < limits.minImages) {
    return issue("too_few_images", null, `Bu model için en az ${limits.minImages} görsel gerekli.`, `This model needs at least ${limits.minImages} images.`);
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
      `Görsel ${(pixels / 1_000_000).toFixed(0)} megapiksel; işlenebilecek en büyük boyut ${(limits.maxPixels / 1_000_000).toFixed(0)} megapiksel.`,
      `The image is ${(pixels / 1_000_000).toFixed(0)} megapixels; the largest size that can be processed is ${(limits.maxPixels / 1_000_000).toFixed(0)} megapixels.`
    ));
  }
  if (!limits.formats.includes(probe.format)) {
    issues.push(issue(
      "unsupported_format",
      position,
      `${IMAGE_FORMATS[probe.format].label} biçimi bu modelde desteklenmiyor. Desteklenen biçimler: ${formatListTr(limits.formats)}.`,
      `${IMAGE_FORMATS[probe.format].label} is not supported by this model. Supported formats: ${formatListEn(limits.formats)}.`
    ));
  }
  if (facts.bytes > limits.maxBytes) {
    issues.push(issue(
      "too_large",
      position,
      `Dosya ${formatBytesTr(facts.bytes)}; bu model en fazla ${formatBytesTr(limits.maxBytes)} kabul ediyor.`,
      `The file is ${formatBytesEn(facts.bytes)}; this model accepts up to ${formatBytesEn(limits.maxBytes)}.`
    ));
  }
  const shortSide = Math.min(probe.width, probe.height);
  const longSide = Math.max(probe.width, probe.height);
  if (shortSide < limits.minDimension) {
    issues.push(issue(
      "dimensions_too_small",
      position,
      `Görsel ${probe.width}×${probe.height} piksel; her kenar en az ${limits.minDimension} piksel olmalı.`,
      `The image is ${probe.width}×${probe.height} pixels; each side must be at least ${limits.minDimension} pixels.`
    ));
  }
  if (limits.maxDimension !== null && longSide > limits.maxDimension) {
    issues.push(issue(
      "dimensions_too_large",
      position,
      `Görsel ${probe.width}×${probe.height} piksel; bu model en fazla ${limits.maxDimension} piksel kenar kabul ediyor.`,
      `The image is ${probe.width}×${probe.height} pixels; this model accepts sides up to ${limits.maxDimension} pixels.`
    ));
  }
  return issues;
}

export function unreadableImageIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("corrupt", position, "Dosya okunamadı ya da desteklenen bir görsel değil. Dosyayı yeniden kaydedip tekrar deneyin.", "The file could not be read or is not a supported image. Save it again and retry.");
}

/** The header was valid, but the pixel data could not be decoded. */
export function undecodableImageIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("corrupt", position, "Görselin piksel verisi çözülemedi; dosya bozuk veya eksik görünüyor. Dosyayı yeniden kaydedip tekrar deneyin.", "The image's pixel data could not be decoded; the file looks damaged or incomplete. Save it again and retry.");
}

export function decodeTimeoutIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("timeout", position, "Görsel zamanında çözümlenemedi. Daha küçük bir dosyayla tekrar deneyin.", "The image could not be decoded in time. Try again with a smaller file.");
}

export function unreachableImageIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("unreachable", position, "Görsele ulaşılamadı. Bağlantının süresi dolmuş olabilir; görseli yeniden yükleyin.", "The image could not be reached. Its link may have expired; upload the image again.");
}

export function timeoutImageIssue(position: ImagePosition | null): ImageInputIssue {
  return issue("timeout", position, "Görsel zamanında indirilemedi. Lütfen tekrar deneyin.", "The image could not be downloaded in time. Please try again.");
}

export function tooLargeToReadIssue(position: ImagePosition | null, limits: ImageInputLimits): ImageInputIssue {
  return issue(
    "too_large",
    position,
    `Dosya bu model için çok büyük; en fazla ${formatBytesTr(limits.maxBytes)} kabul ediliyor.`,
    `The file is too large for this model; up to ${formatBytesEn(limits.maxBytes)} is accepted.`
  );
}

/** Non-blocking provider guidance, e.g. a preferred aspect ratio. */
export function adviseImageFacts(facts: ImageFacts, limits: ImageInputLimits): LocalizedText[] {
  const notes: LocalizedText[] = [];
  const { width, height } = facts.probe;
  for (const advisory of limits.advisories) {
    if (advisory.code === "preferred_min_short_side" && Math.min(width, height) < advisory.pixels) {
      notes.push({
        tr: `Bu model en az ${advisory.pixels}p çözünürlük öneriyor; sonuç kalitesi düşebilir.`,
        en: `This model recommends at least ${advisory.pixels}p; the result may lose quality.`,
      });
    }
    if (advisory.code === "preferred_aspect") {
      const ratio = width / height;
      const matches = advisory.ratios.some((value) => {
        const [w, h] = value.split(":").map(Number);
        return Math.abs(ratio - w / h) < 0.02;
      });
      if (!matches) {
        notes.push({
          tr: `Bu model ${advisory.ratios.join(" veya ")} oranı öneriyor; görsel sağlayıcıda kırpılabilir.`,
          en: `This model recommends a ${advisory.ratios.join(" or ")} ratio; the provider may crop the image.`,
        });
      }
    }
  }
  return notes;
}

/** One-line summary of what the model accepts, for helper text. */
export function limitsSummary(limits: ImageInputLimits, locale?: string): string {
  const en = locale === "en";
  const parts = [
    en ? formatListEn(limits.formats) : formatListTr(limits.formats),
    en ? `up to ${formatBytesEn(limits.maxBytes)}` : `en fazla ${formatBytesTr(limits.maxBytes)}`,
  ];
  if (limits.maxDimension !== null) {
    parts.push(`${limits.minDimension}–${limits.maxDimension} ${en ? "pixels" : "piksel"}`);
  } else if (limits.minDimension > MIN_IMAGE_DIMENSION) {
    parts.push(en ? `at least ${limits.minDimension} pixels` : `en az ${limits.minDimension} piksel`);
  }
  if (limits.maxImages > 1) parts.push(en ? `up to ${limits.maxImages} images` : `en fazla ${limits.maxImages} görsel`);
  return parts.join(" · ");
}

export function limitsSummaryTr(limits: ImageInputLimits): string {
  return limitsSummary(limits, "tr");
}

/** Note for limits the provider does not document. */
export function unverifiedLimitsNote(limits: ImageInputLimits, locale?: string): string | null {
  const formats = !limits.verification.formats;
  const size = !limits.verification.size;
  if (!formats && !size) return null;
  if (locale === "en") {
    const missing = [formats ? "format" : null, size ? "file size" : null].filter(Boolean).join(" and ");
    return `The provider does not document a ${missing} limit for this model; general safety limits apply (${formatListEn(limits.formats)}, up to ${formatBytesEn(limits.maxBytes)}).`;
  }
  const missing = [formats ? "biçim" : null, size ? "dosya boyutu" : null].filter(Boolean).join(" ve ");
  return `Sağlayıcı bu model için ${missing} sınırını belgelemiyor; genel güvenlik sınırları uygulanıyor (${formatListTr(limits.formats)}, en fazla ${formatBytesTr(limits.maxBytes)}).`;
}

export function unverifiedLimitsNoteTr(limits: ImageInputLimits): string | null {
  return unverifiedLimitsNote(limits, "tr");
}
