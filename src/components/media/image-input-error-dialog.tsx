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
import type { ImageInputIssue } from "@/lib/media/image-limit-check";

/**
 * Turkish modal for an image that cannot be made to fit the model. The form
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
  return (
    <Dialog open={issues !== null && issues.length > 0} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Görsel bu model için uygun değil</DialogTitle>
          <DialogDescription>Girdiğiniz diğer bilgiler korunuyor. Başka bir görsel seçebilirsiniz.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm" role="alert">
          {issues?.map((issue, index) => (
            <li key={`${issue.code}-${issue.index}-${index}`} className="break-words text-destructive">
              {issue.message}
            </li>
          ))}
        </ul>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Kapat</Button>
          {onChooseAnother && (
            <Button type="button" onClick={() => { onClose(); onChooseAnother(); }}>Başka görsel seç</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
