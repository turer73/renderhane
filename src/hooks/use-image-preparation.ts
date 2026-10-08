"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserImageCodec } from "@/lib/media/browser-image-codec";
import type { ImageInputLimits } from "@/lib/media/image-input-contract";
import type { ImageInputIssue, ImagePosition } from "@/lib/media/image-limit-check";
import {
  ImagePreparationCancelled,
  ImagePreparationError,
  prepareImageForLimits,
  type PreparedImage,
} from "@/lib/media/optimize-image";

export type ImagePreparationResult =
  | { kind: "ready"; prepared: PreparedImage }
  /** The user chose not to use the optimized version. */
  | { kind: "declined" }
  /** A newer preparation, a cancel or an unmount superseded this one. */
  | { kind: "cancelled" }
  | { kind: "rejected"; issues: ImageInputIssue[] };

/** An optimization waiting for the user's choice, with preview URLs. */
export interface PendingImageConfirmation {
  prepared: PreparedImage;
  originalUrl: string;
  preparedUrl: string;
}

interface PendingConfirmation extends PendingImageConfirmation {
  resolve: (accepted: boolean) => void;
}

/**
 * Runs the shared image preparation for one upload field: optimization with
 * cancel, a confirmation step for visible loss, and the issues to show in the
 * error dialog. Starting a new preparation cancels the previous one, so a
 * late result never overwrites a newer choice.
 */
export function useImagePreparation() {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [issues, setIssues] = useState<ImageInputIssue[] | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const settlePending = useCallback((accepted: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (!current) return;
    // Preview URLs live exactly as long as the confirmation.
    URL.revokeObjectURL(current.originalUrl);
    URL.revokeObjectURL(current.preparedUrl);
    current.resolve(accepted);
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    settlePending(false);
  }, [settlePending]);

  useEffect(() => cancel, [cancel]);

  const prepare = useCallback(async (
    file: File,
    limits: ImageInputLimits,
    position: ImagePosition | null = null
  ): Promise<ImagePreparationResult> => {
    cancel();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIssues(null);
    setBusy(true);
    try {
      const prepared = await prepareImageForLimits(file, limits, {
        codec: browserImageCodec,
        signal: controller.signal,
        position,
      });
      if (controller.signal.aborted) return { kind: "cancelled" };
      if (prepared.confirmationReasons.length === 0) return { kind: "ready", prepared };
      const accepted = await new Promise<boolean>((resolve) => {
        const confirmation: PendingConfirmation = {
          prepared,
          originalUrl: URL.createObjectURL(prepared.original),
          preparedUrl: URL.createObjectURL(prepared.file),
          resolve,
        };
        pendingRef.current = confirmation;
        setPending(confirmation);
      });
      if (controller.signal.aborted) return { kind: "cancelled" };
      return accepted ? { kind: "ready", prepared } : { kind: "declined" };
    } catch (error) {
      if (error instanceof ImagePreparationCancelled || controller.signal.aborted) return { kind: "cancelled" };
      const found = error instanceof ImagePreparationError
        ? error.issues
        : [{ code: "corrupt" as const, index: position?.index ?? null, message: "Görsel hazırlanırken beklenmeyen bir hata oluştu. Tekrar deneyin." }];
      setIssues(found);
      return { kind: "rejected", issues: found };
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  }, [cancel]);

  return {
    busy,
    pending: pending as PendingImageConfirmation | null,
    issues,
    prepare,
    cancel,
    accept: useCallback(() => settlePending(true), [settlePending]),
    decline: useCallback(() => settlePending(false), [settlePending]),
    /** Show issues that came from elsewhere, e.g. a server 422. */
    showIssues: setIssues,
    clearIssues: useCallback(() => setIssues(null), []),
  };
}
