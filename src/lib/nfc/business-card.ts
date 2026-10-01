/**
 * Bank and invoice details for the NFC writer.
 *
 * A plain NDEF text record is not shown by iPhones and only reaches a generic
 * viewer on Android, so the default tag stores a link to `/{locale}/b` instead.
 * The details ride in the URL **fragment**: any phone that taps the tag opens a
 * page with one copy button per field, and the fragment never reaches the
 * server, its logs or analytics.
 *
 * Field order matches the compact record schema (`renderhane.com:c`), so the
 * same `fields` array moves between the link, compact and text encodings.
 */

import { ORIGIN } from "@/lib/share-links";

export type BusinessKind = "bank" | "invoice";
export type BusinessLocale = "tr" | "en";

export interface BusinessDetails {
  kind: BusinessKind;
  locale: BusinessLocale;
  /** Fixed schema order; optional fields are empty strings. */
  fields: readonly string[];
}

export interface BusinessFieldDef {
  /** Editor field name in the NFC tool. */
  key: string;
  /** Short fragment parameter, kept to one letter to save tag bytes. */
  param: string;
  label: Record<BusinessLocale, string>;
  required?: boolean;
}

export const BUSINESS_FIELDS: Record<BusinessKind, readonly BusinessFieldDef[]> = {
  bank: [
    { key: "accountName", param: "n", label: { tr: "Alıcı", en: "Recipient" }, required: true },
    { key: "iban", param: "i", label: { tr: "IBAN", en: "IBAN" }, required: true },
    { key: "bankName", param: "b", label: { tr: "Banka", en: "Bank" } },
    { key: "branch", param: "r", label: { tr: "Şube", en: "Branch" } },
    { key: "description", param: "d", label: { tr: "Açıklama", en: "Reference" } },
  ],
  invoice: [
    { key: "title", param: "n", label: { tr: "Unvan", en: "Legal name" }, required: true },
    { key: "taxOffice", param: "o", label: { tr: "Vergi dairesi", en: "Tax office" } },
    { key: "taxNumber", param: "v", label: { tr: "Vergi/T.C. no", en: "Tax/ID no" }, required: true },
    { key: "address", param: "a", label: { tr: "Adres", en: "Address" }, required: true },
    { key: "invoiceEmail", param: "e", label: { tr: "E-posta", en: "Email" } },
  ],
};

export const BUSINESS_TITLES: Record<BusinessKind, Record<BusinessLocale, string>> = {
  bank: { tr: "BANKA BİLGİLERİ", en: "BANK DETAILS" },
  invoice: { tr: "FATURA BİLGİLERİ", en: "INVOICE DETAILS" },
};

/** Fragment value that marks an invoice card; bank cards omit it to save bytes. */
const INVOICE_MARKER = "f";
const MAX_FIELD_LENGTH = 500;
const LANDING_PATH = /^\/(tr|en)\/b\/?$/;

function clean(value: string | null | undefined): string {
  return (value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_FIELD_LENGTH);
}

function fromFields(
  kind: BusinessKind,
  locale: BusinessLocale,
  read: (def: BusinessFieldDef) => string | null | undefined
): BusinessDetails | null {
  const defs = BUSINESS_FIELDS[kind];
  const fields = defs.map((def) => clean(read(def)));
  if (defs.some((def, index) => def.required && !fields[index])) return null;
  return { kind, locale, fields };
}

/** Link written to the tag; details live after `#` and never reach the server. */
export function buildBusinessLandingUrl(details: BusinessDetails): string {
  const params = new URLSearchParams();
  if (details.kind === "invoice") params.set("t", INVOICE_MARKER);
  BUSINESS_FIELDS[details.kind].forEach((def, index) => {
    const value = details.fields[index]?.trim();
    if (value) params.set(def.param, value);
  });
  return `${ORIGIN}/${details.locale}/b#${params.toString()}`;
}

/** Reads a `/b` fragment (with or without `#`); null when required fields are missing. */
export function parseBusinessLandingHash(hash: string, locale: BusinessLocale): BusinessDetails | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const kind: BusinessKind = params.get("t") === INVOICE_MARKER ? "invoice" : "bank";
  return fromFields(kind, locale, (def) => params.get(def.param));
}

/** Recognizes a production `/b` link read back from a tag. */
export function businessFromLandingUrl(uri: string): BusinessDetails | null {
  try {
    const url = new URL(uri);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const route = LANDING_PATH.exec(url.pathname);
    if (url.protocol !== "https:" || url.port || host !== "renderhane.com" || !route) return null;
    return parseBusinessLandingHash(url.hash, route[1] as BusinessLocale);
  } catch {
    return null;
  }
}

/** Plain-text form used by the "standard" storage mode and the copy-all action. */
export function formatBusinessText(details: BusinessDetails): string {
  const { kind, locale } = details;
  return [
    BUSINESS_TITLES[kind][locale],
    ...BUSINESS_FIELDS[kind].map((def, index) =>
      details.fields[index] ? `${def.label[locale]}: ${details.fields[index]}` : ""
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Parses {@link formatBusinessText} output (either locale) back into details. */
export function businessFromText(text: string): BusinessDetails | null {
  const [header = "", ...lines] = text.replace(/\r\n?/g, "\n").split("\n");
  for (const kind of ["bank", "invoice"] as const) {
    for (const locale of ["tr", "en"] as const) {
      if (header.trim() !== BUSINESS_TITLES[kind][locale]) continue;
      const values = new Map<string, string>();
      for (const line of lines) {
        const def = BUSINESS_FIELDS[kind].find((field) => line.startsWith(`${field.label[locale]}: `));
        if (def) values.set(def.key, line.slice(def.label[locale].length + 2));
      }
      return fromFields(kind, locale, (def) => values.get(def.key));
    }
  }
  return null;
}

/** Labelled, non-empty rows for a copy-per-field screen. */
export function businessEntries(
  details: BusinessDetails,
  locale: BusinessLocale = details.locale
): Array<{ key: string; label: string; value: string }> {
  return BUSINESS_FIELDS[details.kind]
    .map((def, index) => ({ key: def.key, label: def.label[locale], value: details.fields[index] || "" }))
    .filter((entry) => entry.value);
}

/** Editor fields for the NFC tool, keyed like its form inputs. */
export function businessFormFields(details: BusinessDetails): Record<string, string> {
  const fields: Record<string, string> = {};
  BUSINESS_FIELDS[details.kind].forEach((def, index) => {
    if (details.fields[index]) fields[def.key] = details.fields[index];
  });
  return fields;
}

/** Groups an IBAN in fours for reading; copying always uses the ungrouped value. */
export function formatIbanForDisplay(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}
