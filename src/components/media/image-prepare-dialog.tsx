"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PendingImageConfirmation } from "@/hooks/use-image-preparation";
import { useLocale } from "next-intl";
import { describeTransform } from "@/lib/media/optimize-image";
import { useLocaleText } from "@/hooks/use-locale-text";

const REASON_TEXT = {
  transparency: {
    tr: "Bu model saydam görsel kabul etmiyor: saydam alanlar beyaz zemine dönüştürülecek.",
    en: "This model does not accept transparent images: transparent areas will be turned white.",
  },
  quality: {
    tr: "Görsel bu modelin sınırına sığması için küçültüldü veya sıkıştırıldı; ayrıntı kaybı olabilir.",
    en: "The image was downsized or compressed to fit this model's limit; some detail may be lost.",
  },
} as const;

/**
 * Before/after preview for an optimization with visible loss. Nothing is
 * uploaded until the user chooses; the original stays available.
 */
export function ImagePrepareDialog({
  pending,
  onAccept,
  onDecline,
}: {
  pending: PendingImageConfirmation | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const prepared = pending?.prepared;
  const l = useLocaleText();
  const locale = useLocale();
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) onDecline(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{l("Görsel bu model için hazırlandı", "Image prepared for this model")}</DialogTitle>
          <DialogDescription>
            {l(
              "Yüklemeden önce farkı kontrol edin. Orijinal dosyanız değişmeden saklanır.",
              "Check the difference before uploading. Your original file is kept unchanged."
            )}
          </DialogDescription>
        </DialogHeader>
        {pending && prepared && (
          <div className="space-y-3">
            <ul className="space-y-1 text-sm text-foreground/80">
              {prepared.confirmationReasons.map((reason) => (
                <li key={reason}>• {l(REASON_TEXT[reason].tr, REASON_TEXT[reason].en)}</li>
              ))}
            </ul>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { label: l("Orijinal", "Original"), url: pending.originalUrl },
                { label: l("Hazırlanan", "Prepared"), url: pending.preparedUrl },
              ].map(({ label, url }) => (
                <figure key={label} className="min-w-0 space-y-1">
                  {/* Checkerboard reveals lost transparency in the comparison. */}
                  <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg border bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={l(`${label} görsel`, `${label} image`)} className="max-h-full max-w-full object-contain" />
                  </div>
                  <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
                </figure>
              ))}
            </div>
            {prepared.transform && (
              <p className="break-words text-xs text-muted-foreground">{describeTransform(prepared.transform, locale)}</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDecline}>{l("Vazgeç", "Cancel")}</Button>
          <Button type="button" onClick={onAccept}>{l("Hazırlanan görseli kullan", "Use prepared image")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
