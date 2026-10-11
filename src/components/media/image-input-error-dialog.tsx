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
import { useLocale } from "next-intl";
import { issueMessage, type ImageInputIssue } from "@/lib/media/image-limit-check";
import { useLocaleText } from "@/hooks/use-locale-text";

/**
 * Modal for an image that cannot be made to fit the model. The form
 * behind it keeps every input; the user can pick another file or close.
 */
export function ImageInputErrorDialog({
  issues,
  note,
  onClose,
  onChooseAnother,
}: {
  issues: ImageInputIssue[] | null;
  /** E.g. the unverified-limits note for the selected model. */
  note?: string | null;
  onClose: () => void;
  onChooseAnother?: () => void;
}) {
  const l = useLocaleText();
  const locale = useLocale();
  return (
    <Dialog open={issues !== null && issues.length > 0} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{l("Görsel bu model için uygun değil", "This image is not suitable for this model")}</DialogTitle>
          <DialogDescription>
            {l("Girdiğiniz diğer bilgiler korunuyor. Başka bir görsel seçebilirsiniz.", "Everything else you entered is kept. You can choose another image.")}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm" role="alert">
          {issues?.map((issue, index) => (
            <li key={`${issue.code}-${issue.index}-${index}`} className="break-words text-destructive">
              {issueMessage(issue, locale)}
            </li>
          ))}
        </ul>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{l("Kapat", "Close")}</Button>
          {onChooseAnother && (
            <Button type="button" onClick={() => { onClose(); onChooseAnother(); }}>{l("Başka görsel seç", "Choose another image")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
