"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Download, ExternalLink, Play } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { LabRunOutputDto } from "@/lib/admin/model-lab-flow";
import { proxyUrl } from "@/lib/proxy-url";

const ModelViewer = dynamic(() => import("@/components/viewer/model-viewer").then((mod) => mod.ModelViewer), { ssr: false });

/** Larger stored audio/video is fetched only on request: previews load the whole file. */
export const AUTO_PREVIEW_BYTES = 25_000_000;
const LINK = "inline-flex min-h-11 items-center gap-1.5 text-sm text-primary underline underline-offset-4";

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function formatLabBytes(bytes: number, locale: string): string {
  const mb = bytes / 1_000_000;
  if (mb >= 1) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: mb >= 10 ? 0 : 1 }).format(mb)} MB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(1, bytes / 1000))} KB`;
}

/**
 * Where the browser may load an output inline under the site CSP: stored
 * files straight from private storage (images, 3D) or as a fetched blob
 * (audio, video — media-src does not list storage); provider files through
 * the same-origin asset proxy. Anything else is offered as a link only.
 */
export function labPreviewSource(output: LabRunOutputDto): { url: string; viaBlob: boolean } | null {
  if (!isHttpsUrl(output.url)) return null;
  const media = output.kind === "video" || output.kind === "audio";
  if (output.stored) return { url: output.url, viaBlob: media };
  const proxied = proxyUrl(output.url);
  if (proxied !== output.url) return { url: proxied, viaBlob: false };
  return output.kind === "image" ? { url: output.url, viaBlob: false } : null;
}

/** An object URL for a fetched file; revoked when the source changes or on unmount. */
function useBlobUrl(url: string | null, onFail: () => void): { blobUrl: string | null; failed: boolean } {
  const [state, setState] = useState<{ source: string; blobUrl: string | null; failed: boolean } | null>(null);
  const onFailRef = useRef(onFail);
  useEffect(() => {
    onFailRef.current = onFail;
  });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        objectUrl = URL.createObjectURL(await response.blob());
        setState({ source: url, blobUrl: objectUrl, failed: false });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ source: url, blobUrl: null, failed: true });
        onFailRef.current();
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return state && state.source === url ? state : { blobUrl: null, failed: false };
}

function MediaPreview({ kind, src, onError }: { kind: "video" | "audio"; src: string; onError: () => void }) {
  return kind === "video"
    ? <video src={src} controls preload="metadata" className="max-h-80 w-full rounded-lg bg-black/5" onError={onError} />
    : <audio src={src} controls preload="metadata" className="w-full" onError={onError} />;
}

function BlobMedia({ kind, url, onExpired }: { kind: "video" | "audio"; url: string; onExpired: () => void }) {
  const t = useTranslations("modelLab");
  const { blobUrl, failed } = useBlobUrl(url, onExpired);
  if (failed) return <p className="text-sm text-muted-foreground">{t("previewUnavailable")}</p>;
  if (!blobUrl) return <div className="h-12 animate-pulse rounded-lg bg-muted" aria-hidden />;
  return <MediaPreview kind={kind} src={blobUrl} onError={onExpired} />;
}

/**
 * One output: an inline preview when the CSP allows it, and always an open
 * and a download link. Provider links are labelled as temporary.
 */
export function LabOutput({
  output,
  index,
  modelName,
  onExpired,
}: {
  output: LabRunOutputDto;
  index: number;
  modelName: string;
  /** A stored link failed to load: refresh the run's links. */
  onExpired: () => void;
}) {
  const t = useTranslations("modelLab");
  const locale = useLocale();
  const source = labPreviewSource(output);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(false);
  if (!isHttpsUrl(output.url)) return null;

  const failed = source !== null && failedUrl === source.url;
  const fail = () => {
    if (!source) return;
    setFailedUrl(source.url);
    if (output.stored) onExpired();
  };
  const large = output.bytes !== null && output.bytes > AUTO_PREVIEW_BYTES;
  const mediaKind = output.kind === "video" || output.kind === "audio" ? output.kind : null;

  let preview: ReactNode = <p className="text-sm text-muted-foreground">{t("previewUnavailable")}</p>;
  if (source && !failed) {
    if (output.kind === "image") {
      preview = (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source.url} alt={t("outputAlt", { model: modelName, index: index + 1 })} referrerPolicy="no-referrer" className="max-h-80 w-full rounded-lg bg-muted/40 object-contain" onError={fail} />
      );
    } else if (mediaKind && source.viaBlob) {
      preview = large && requested !== source.url
        ? <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => setRequested(source.url)}><Play className="size-4" />{t("loadPreview", { size: formatLabBytes(output.bytes ?? 0, locale) })}</Button>
        : <BlobMedia kind={mediaKind} url={source.url} onExpired={onExpired} />;
    } else if (mediaKind) {
      preview = <MediaPreview kind={mediaKind} src={source.url} onError={fail} />;
    } else if (output.kind === "glb") {
      preview = show3d
        ? <ModelViewer url={source.url} className="h-72 w-full sm:h-80" autoRotate />
        : <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => setShow3d(true)}><Box className="size-4" />{t("show3d")}</Button>;
    } else {
      preview = null;
    }
  }

  return (
    <figure className="min-w-0 space-y-2 rounded-lg border p-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-medium">
          {t(`outputKinds.${output.kind}`)}
          {output.bytes !== null && <span className="font-normal text-muted-foreground"> · {formatLabBytes(output.bytes, locale)}</span>}
        </span>
        <span className={output.stored ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}>
          {output.stored ? t("storedFile") : t("temporaryLink")}
        </span>
      </figcaption>
      {preview}
      <div className="flex flex-wrap gap-x-4">
        <a href={output.url} target="_blank" rel="noopener noreferrer" className={LINK}>{t("open")} <ExternalLink className="size-3.5" aria-hidden /></a>
        {isHttpsUrl(output.downloadUrl) && (
          <a href={output.downloadUrl} download rel="noopener noreferrer" className={LINK}>{t("download")} <Download className="size-3.5" aria-hidden /></a>
        )}
      </div>
    </figure>
  );
}
