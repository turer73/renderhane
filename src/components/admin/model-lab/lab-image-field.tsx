"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, ImagePlus, Link2, Loader2, RefreshCw, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePrepareDialog } from "@/components/media/image-prepare-dialog";
import { useImagePreparation } from "@/hooks/use-image-preparation";
import type { ImageInputLimits } from "@/lib/media/image-input-contract";
import { checkImageCount, type ImageInputIssue, type ImagePosition } from "@/lib/media/image-limit-check";

/** Puts a prepared file in private storage and returns its signed link, or null on failure. */
export type LabUploader = (file: File) => Promise<{ path: string; url: string } | null>;

type ItemStatus = "queued" | "preparing" | "uploading" | "ready" | "failed";

interface Item {
  id: string;
  source: "upload" | "url";
  status: ItemStatus;
  /** What the model receives once the item is ready. */
  url: string | null;
  /** Storage path of an upload, so a dropped upload can be deleted. */
  path: string | null;
  /** Object URL of the prepared file, or the typed address. */
  preview: string | null;
  /** The prepared file, kept so a failed upload can be retried. */
  file: File | null;
  adapted: boolean;
  /** "Change": the item this one replaces once it is ready. */
  replaces: string | null;
}

const BUSY: ReadonlySet<ItemStatus> = new Set(["queued", "preparing", "uploading"]);
const SMALL_BUTTON = "h-auto min-h-11 px-2 text-xs";
const CHECKERBOARD = "bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:16px_16px] dark:bg-[conic-gradient(#374151_25%,#1f2937_0_50%,#374151_0_75%,#1f2937_0)]";

export function isHttpsAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function Thumbnail({ item, alt }: { item: Item; alt: string }) {
  const t = useTranslations("modelLab");
  const [broken, setBroken] = useState<string | null>(null);
  if (!item.preview) return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden /></div>;
  if (broken === item.preview) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
        <ImageIcon className="size-5" aria-hidden />
        <span className="break-all">{t("image.addressPreview", { host: hostOf(item.preview) })}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.preview} alt={alt} referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={() => setBroken(item.preview)} />
  );
}

/**
 * One image input of a lab model: upload or drag and drop (prepared for the
 * model's limits first), or an HTTPS address. Each image can be previewed,
 * changed or removed; list fields take several. The field reports its value
 * (newline-joined links of ready images) and whether it is still busy.
 */
export function LabImageField({
  id,
  label,
  required,
  multiple,
  limits,
  limitsText,
  error,
  disabled,
  upload,
  discard,
  onChange,
  onBusyChange,
  onIssues,
}: {
  id: string;
  label: string;
  required: boolean;
  multiple: boolean;
  limits: ImageInputLimits;
  /** Localized lines describing the model's limits. */
  limitsText: readonly string[];
  error: string | null;
  disabled: boolean;
  upload: LabUploader;
  /** Delete an upload that will not be used (the server keeps files a run uses). */
  discard: (path: string) => void;
  onChange: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
  onIssues: (issues: ImageInputIssue[]) => void;
}) {
  const t = useTranslations("modelLab");
  const optionalText = t("optional");
  const max = multiple ? Math.max(1, Math.min(limits.maxImages, 4)) : 1;
  const [items, setItems] = useState<Item[]>([]);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [dragging, setDragging] = useState(false);
  const { prepare, cancel: cancelPreparation, pending, accept, decline } = useImagePreparation();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<string | null>(null);
  const live = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(false);
  const nextId = useRef(0);
  const itemsRef = useRef(items);
  const callbacks = useRef({ onChange, onBusyChange, onIssues, discard, upload });

  useEffect(() => {
    callbacks.current = { onChange, onBusyChange, onIssues, discard, upload };
    itemsRef.current = items;
  });

  const value = useMemo(
    () => items.filter((item) => item.status === "ready" && item.url).map((item) => item.url).join("\n"),
    [items]
  );
  const busy = items.some((item) => BUSY.has(item.status));
  useEffect(() => callbacks.current.onChange(value), [value]);
  useEffect(() => callbacks.current.onBusyChange(busy), [busy]);

  /** Let go of an item's resources: its preview and, for an upload, the stored file. */
  const release = useCallback((item: Item) => {
    live.current.delete(item.id);
    if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
    if (item.path) callbacks.current.discard(item.path);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      // The model changed or the page is closing: nothing here will be submitted.
      mounted.current = false;
      for (const item of itemsRef.current) release(item);
      callbacks.current.onBusyChange(false);
    };
  }, [release]);

  const patch = useCallback((itemId: string, change: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...change } : item)));
  }, []);

  const drop = useCallback((itemId: string) => {
    const item = itemsRef.current.find((entry) => entry.id === itemId);
    live.current.delete(itemId);
    if (item) release(item);
    setItems((current) => current.filter((entry) => entry.id !== itemId));
  }, [release]);

  const startUpload = useCallback(async (itemId: string, file: File) => {
    patch(itemId, { status: "uploading" });
    let uploaded: Awaited<ReturnType<LabUploader>>;
    try {
      uploaded = await callbacks.current.upload(file);
    } catch {
      // A thrown upload must not leave the image (and the run button) stuck.
      uploaded = null;
    }
    if (!mounted.current || !live.current.has(itemId)) {
      // Removed or cancelled while uploading: the late file is not used.
      if (uploaded) callbacks.current.discard(uploaded.path);
      return;
    }
    if (!uploaded) {
      patch(itemId, { status: "failed" });
      return;
    }
    const replacing = itemsRef.current.find((entry) => entry.id === itemId)?.replaces ?? null;
    const replaced = replacing ? itemsRef.current.find((entry) => entry.id === replacing) ?? null : null;
    setItems((current) => {
      const item = current.find((entry) => entry.id === itemId);
      if (!item) return current;
      const ready: Item = { ...item, status: "ready", url: uploaded.url, path: uploaded.path, replaces: null };
      const target = item.replaces ? current.findIndex((entry) => entry.id === item.replaces) : -1;
      if (target === -1) return current.map((entry) => (entry.id === itemId ? ready : entry));
      // The new image takes the old one's place.
      return current.flatMap((entry) => (entry.id === itemId ? [] : entry.id === item.replaces ? [ready] : [entry]));
    });
    if (replaced) release(replaced);
  }, [patch, release]);

  const processFile = useCallback(async (file: File, itemId: string, position: ImagePosition | null) => {
    if (!mounted.current || !live.current.has(itemId)) return;
    patch(itemId, { status: "preparing" });
    const result = await prepare(file, limits, position);
    if (!mounted.current || !live.current.has(itemId)) return;
    if (result.kind !== "ready") {
      // Declined, cancelled or not fixable: an image being changed stays as it was.
      drop(itemId);
      if (result.kind === "rejected") callbacks.current.onIssues(result.issues);
      return;
    }
    const prepared = result.prepared;
    patch(itemId, { preview: URL.createObjectURL(prepared.file), file: prepared.file, adapted: prepared.transform !== null });
    await startUpload(itemId, prepared.file);
  }, [drop, limits, patch, prepare, startUpload]);

  const addFiles = useCallback((files: File[]) => {
    const current = itemsRef.current.filter((item) => !item.replaces);
    let replaceId = replaceRef.current;
    replaceRef.current = null;
    // A single-image field swaps its image instead of refusing a second one.
    if (!replaceId && !multiple && current.length === 1) replaceId = current[0].id;
    const room = replaceId ? 1 : max - current.length;
    if (files.length > room) {
      const issue = checkImageCount(current.length + files.length, { ...limits, minImages: 0, maxImages: max });
      if (issue) callbacks.current.onIssues([issue]);
    }
    const accepted = files.slice(0, Math.max(0, room));
    if (accepted.length === 0) return;
    const created: Item[] = accepted.map(() => ({
      id: `${id}-${++nextId.current}`,
      source: "upload",
      status: "queued",
      url: null,
      path: null,
      preview: null,
      file: null,
      adapted: false,
      replaces: replaceId,
    }));
    for (const item of created) live.current.add(item.id);
    setItems((list) => [...list, ...created]);
    const replacedIndex = replaceId ? current.findIndex((item) => item.id === replaceId) : -1;
    accepted.forEach((file, index) => {
      const position: ImagePosition | null = multiple
        ? replaceId ? { index: replacedIndex, count: current.length } : { index: current.length + index, count: current.length + accepted.length }
        : null;
      queue.current = queue.current.then(() => processFile(file, created[index].id, position)).catch(() => undefined);
    });
  }, [id, limits, max, multiple, processFile]);

  const addAddress = useCallback(() => {
    const value = address.trim();
    if (!isHttpsAddress(value)) {
      setAddressError(t("image.invalidUrl"));
      return;
    }
    const current = itemsRef.current.filter((item) => !item.replaces);
    const replaced = !multiple && current.length === 1 ? current[0] : null;
    if (!replaced && current.length >= max) {
      setAddressError(t("image.full", { max }));
      return;
    }
    const item: Item = {
      id: `${id}-${++nextId.current}`,
      source: "url",
      status: "ready",
      url: value,
      path: null,
      preview: value,
      file: null,
      adapted: false,
      replaces: null,
    };
    live.current.add(item.id);
    if (replaced) {
      if (itemsRef.current.some((entry) => entry.status === "preparing")) cancelPreparation();
      for (const entry of itemsRef.current) release(entry);
      setItems([item]);
    } else {
      setItems((list) => [...list, item]);
    }
    setAddress("");
    setAddressError("");
  }, [address, cancelPreparation, id, max, multiple, release, t]);

  const removeItem = useCallback((itemId: string) => {
    const related = itemsRef.current.filter((item) => item.id === itemId || item.replaces === itemId);
    if (related.some((item) => item.status === "preparing")) cancelPreparation();
    for (const item of related) release(item);
    setItems((current) => current.filter((item) => item.id !== itemId && item.replaces !== itemId));
  }, [cancelPreparation, release]);

  const cancelReplacement = useCallback((itemId: string) => {
    const replacement = itemsRef.current.find((item) => item.replaces === itemId);
    if (!replacement) return;
    if (replacement.status === "preparing") cancelPreparation();
    drop(replacement.id);
  }, [cancelPreparation, drop]);

  const retry = useCallback((itemId: string) => {
    const item = itemsRef.current.find((entry) => entry.id === itemId);
    if (item?.file) void startUpload(itemId, item.file);
  }, [startUpload]);

  const shown = items.filter((item) => !item.replaces);
  const canAdd = !disabled && shown.length < max;
  const busyLabel = (status: ItemStatus) => (status === "uploading" ? t("image.uploading") : t("image.preparing"));

  return (
    <fieldset className="min-w-0 space-y-3" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-sm font-medium leading-none">{label}{required ? " *" : ` ${optionalText}`}</legend>

      {shown.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((item, index) => {
            const replacement = items.find((entry) => entry.replaces === item.id) ?? null;
            const working = BUSY.has(item.status) ? item.status : replacement && BUSY.has(replacement.status) ? replacement.status : null;
            return (
              <li key={item.id} className="min-w-0 overflow-hidden rounded-lg border">
                <div className={`relative aspect-square ${CHECKERBOARD}`}>
                  <Thumbnail item={item} alt={t("image.previewAlt", { field: label, index: index + 1 })} />
                  {working && (
                    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 p-2 text-center text-xs">
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                      {busyLabel(working)}
                    </div>
                  )}
                </div>
                {item.adapted && <p className="px-2 pt-1 text-[11px] text-muted-foreground">{t("image.adapted")}</p>}
                {item.status === "failed" && <p role="alert" className="px-2 pt-1 text-xs text-destructive">{t("image.uploadFailed")}</p>}
                <div className="flex flex-wrap gap-1 p-1">
                  {replacement ? (
                    <Button type="button" variant="ghost" className={SMALL_BUTTON} onClick={() => cancelReplacement(item.id)}>{t("image.cancel")}</Button>
                  ) : (
                    <>
                      {item.status === "ready" && (
                        <Button type="button" variant="ghost" className={SMALL_BUTTON} disabled={disabled} onClick={() => { replaceRef.current = item.id; inputRef.current?.click(); }}>
                          {t("image.change")}
                        </Button>
                      )}
                      {item.status === "failed" && (
                        <Button type="button" variant="ghost" className={`${SMALL_BUTTON} gap-1`} disabled={disabled} onClick={() => retry(item.id)}>
                          <RefreshCw className="size-3.5" aria-hidden />{t("image.retryUpload")}
                        </Button>
                      )}
                      <Button type="button" variant="ghost" className={SMALL_BUTTON} disabled={disabled && !BUSY.has(item.status)} onClick={() => removeItem(item.id)}>
                        {BUSY.has(item.status) ? t("image.cancel") : t("image.remove")}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canAdd && (
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); replaceRef.current = null; addFiles([...event.dataTransfer.files]); }}
          className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors ${dragging ? "border-primary bg-primary/5" : "border-input"}`}
        >
          <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-muted-foreground">{multiple ? t("image.dropMany") : t("image.drop")}</p>
          <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => { replaceRef.current = null; inputRef.current?.click(); }}>
            <Upload className="size-4" aria-hidden />{t("image.choose")}
          </Button>
          {multiple && <p className="text-xs text-muted-foreground">{t("image.count", { count: shown.length, max })}</p>}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) addFiles(files);
          else replaceRef.current = null;
        }}
      />

      {(canAdd || !multiple) && !disabled && <p className="text-xs text-muted-foreground">{t("image.orUrl")}</p>}
      {(canAdd || !multiple) && !disabled && (
        <div className="-mt-1 flex min-w-0 flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Link2 className="absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              id={id}
              type="url"
              inputMode="url"
              maxLength={4096}
              placeholder={t("image.urlPlaceholder")}
              aria-label={`${label} — ${t("image.orUrl")}`}
              aria-invalid={addressError ? true : undefined}
              className="h-11 pl-9"
              value={address}
              onChange={(event) => { setAddress(event.target.value); setAddressError(""); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAddress(); } }}
            />
          </div>
          <Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={!address.trim()} onClick={addAddress}>{t("image.addUrl")}</Button>
        </div>
      )}

      {limitsText.map((line) => <p key={line} className="text-xs text-muted-foreground">{line}</p>)}
      {addressError && <p role="alert" className="text-sm text-destructive">{addressError}</p>}
      {error && <p id={`${id}-error`} role="alert" className="break-words text-sm text-destructive">{error}</p>}

      <ImagePrepareDialog pending={pending} onAccept={accept} onDecline={decline} />
    </fieldset>
  );
}
