"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import {
  BUSINESS_TITLES,
  businessEntries,
  formatBusinessText,
  formatIbanForDisplay,
  parseBusinessLandingHash,
  type BusinessLocale,
} from "@/lib/nfc/business-card";

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** Clipboard API first; a hidden textarea keeps copying working on older WebViews. */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

export function BusinessCardView({ locale }: { locale: BusinessLocale }) {
  // The details live only in the fragment, which the server never sees.
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => null);
  const details = useMemo(() => (hash === null ? null : parseBusinessLandingHash(hash, locale)), [hash, locale]);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const tr = locale === "tr";

  async function copy(id: string, value: string) {
    const ok = await copyText(value);
    window.clearTimeout(timer.current);
    setCopied(ok ? id : null);
    if (ok) timer.current = window.setTimeout(() => setCopied(null), 2000);
  }

  if (hash === null) return <div className="mx-auto h-96 max-w-xl animate-pulse rounded-3xl bg-muted" />;

  if (!details) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">{tr ? "Bilgiler okunamadı" : "Details could not be read"}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {tr
            ? "Bağlantı eksik veya bozuk. Etiketi yeniden okut ya da gönderenden bilgileri tekrar iste."
            : "The link is incomplete or damaged. Tap the tag again or ask the sender for the details."}
        </p>
      </section>
    );
  }

  const entries = businessEntries(details, locale);
  const heading = entries[0]?.value || "";
  const bank = details.kind === "bank";

  return (
    <section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <header className="bg-primary p-7 text-primary-foreground sm:p-10">
        <p className="text-xs font-semibold tracking-widest opacity-80">{BUSINESS_TITLES[details.kind][locale]}</p>
        <h1 className="mt-2 break-words text-3xl font-bold tracking-tight">{heading}</h1>
        <p className="mt-2 text-sm opacity-80">
          {tr ? "Her bilginin yanındaki düğmeyle kopyalayıp uygulamana yapıştır." : "Copy each detail with its button and paste it into your app."}
        </p>
      </header>
      <ul className="grid gap-3 p-6 sm:p-8">
        {entries.map((entry) => {
          const iban = entry.key === "iban";
          const done = copied === entry.key;
          return (
            <li
              key={entry.key}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${iban ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{entry.label}</p>
                <p className={`select-all break-words ${iban ? "font-mono text-lg font-semibold tracking-wide" : "font-medium"}`} translate="no">
                  {iban ? formatIbanForDisplay(entry.value) : entry.value}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copy(entry.key, entry.value)}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`${entry.label} ${tr ? "kopyala" : "copy"}`}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {done ? (tr ? "Kopyalandı" : "Copied") : tr ? "Kopyala" : "Copy"}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => void copy("all", formatBusinessText({ ...details, locale }))}
            className="mt-2 w-full rounded-xl bg-primary px-5 py-4 text-center font-semibold text-primary-foreground"
          >
            {copied === "all" ? (tr ? "Tümü kopyalandı" : "All copied") : tr ? "Tümünü kopyala" : "Copy all"}
          </button>
        </li>
      </ul>
      <div className="grid gap-2 px-6 pb-6 text-center text-xs text-muted-foreground sm:px-8 sm:pb-8">
        {bank && (
          <p>
            {tr
              ? "Ödemeden önce bankanın gösterdiği alıcı adının bu adla aynı olduğunu kontrol et."
              : "Before paying, check that the recipient name your bank shows matches this name."}
          </p>
        )}
        <p>
          {tr
            ? "Bilgiler bağlantının # bölümünde taşınır; sunucuya gönderilmez ve kaydedilmez. Etiketi okutan herkes görebilir."
            : "The details travel in the link's # part; they are not sent to the server or stored. Anyone who taps the tag can see them."}
        </p>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? (tr ? "Panoya kopyalandı" : "Copied to clipboard") : ""}
      </p>
    </section>
  );
}
