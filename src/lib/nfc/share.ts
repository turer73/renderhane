/**
 * Cross-device handoff for the NFC writer.
 *
 * The form state is packed into the URL **fragment** (`#d=…`), never the query
 * string: fragments are not sent to the server, so Wi-Fi passwords and contact
 * details in a shared link never reach Vercel logs or analytics.
 *
 * Desktop → phone: show the link as a QR code, scan it, write the tag.
 * Phone → desktop: share the link with yourself, finish editing on a keyboard.
 */

import type { NfcContentType, NfcFields } from "./ndef";

export interface NfcShareState {
  type: NfcContentType;
  fields: NfcFields;
}

const VERSION = 1;
const HASH_KEY = "d";
/** Decoder safety limit; retained so existing handoff links remain readable. */
const MAX_ENCODED = 3000;
/** Conservative byte budget below QR version 40 / error-correction H capacity. */
const MAX_QR_HANDOFF_BYTES = 1200;

const CONTENT_TYPES: readonly NfcContentType[] = [
  "url",
  "vcard",
  "wifi",
  "phone",
  "email",
  "sms",
  "location",
  "text",
  "app",
  "social",
];

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Packs form state into a fragment-safe token. Empty fields are dropped. */
export function encodeNfcState(state: NfcShareState): string {
  const fields: NfcFields = {};
  for (const [key, value] of Object.entries(state.fields)) {
    if (value && value.trim()) fields[key] = value;
  }
  const json = JSON.stringify({ v: VERSION, t: state.type, f: fields });
  const token = toBase64Url(new TextEncoder().encode(json));
  if (token.length > MAX_ENCODED)
    throw new Error("Paylaşım bağlantısı için içerik çok uzun.");
  return token;
}

/** Reverse of {@link encodeNfcState}; returns null for anything unrecognisable. */
export function decodeNfcState(token: string): NfcShareState | null {
  if (!token || token.length > MAX_ENCODED) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(token));
    const parsed = JSON.parse(json) as { v?: number; t?: string; f?: unknown };
    if (parsed.v !== VERSION) return null;
    if (!CONTENT_TYPES.includes(parsed.t as NfcContentType)) return null;
    if (!parsed.f || typeof parsed.f !== "object" || Array.isArray(parsed.f)) return null;

    const fields: NfcFields = {};
    for (const [key, value] of Object.entries(parsed.f as Record<string, unknown>)) {
      if (typeof value === "string") fields[key] = value;
    }
    return { type: parsed.t as NfcContentType, fields };
  } catch {
    return null;
  }
}

/** Reads the handoff token out of a `#d=…` fragment (with or without the `#`). */
export function readShareHash(hash: string): NfcShareState | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const token = new URLSearchParams(raw).get(HASH_KEY);
  return token ? decodeNfcState(token) : null;
}

/** Absolute link that reopens this tool with the same content prefilled. */
export function buildShareUrl(origin: string, path: string, state: NfcShareState): string {
  const url = `${origin}${path}#${HASH_KEY}=${encodeNfcState(state)}`;
  if (new TextEncoder().encode(url).length > MAX_QR_HANDOFF_BYTES)
    throw new Error("Paylaşım bağlantısı için içerik çok uzun.");
  return url;
}
