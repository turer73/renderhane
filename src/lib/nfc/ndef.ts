/**
 * NDEF message building for the free NFC tag writer (/araclar/nfc-yaz).
 *
 * Pure data in / data out — no `NDEFReader` calls live here, so every payload
 * rule (URI prefixes, Wi-Fi WSC binary, byte budget) is unit testable on Node
 * while the page keeps only the browser-only Web NFC glue.
 *
 * Record shapes match `NDEFRecordInit`, so the result can be handed straight to
 * `new NDEFReader().write({ records })`.
 */

import { buildVCard, parseVCard, type VCardFields } from "@/lib/vcard";

export type NfcContentType =
  | "url"
  | "vcard"
  | "wifi"
  | "phone"
  | "email"
  | "sms"
  | "location"
  | "text"
  | "app";

export interface NfcRecordInit {
  recordType: string;
  mediaType?: string;
  lang?: string;
  data: string | Uint8Array;
}

/** Fields collected by the form, keyed the same way as the QR tool. */
export type NfcFields = Record<string, string>;

export const VCARD_MIME = "text/vcard";
/** Wi-Fi Simple Configuration — the MIME type Android provisions Wi-Fi from. */
export const WSC_MIME = "application/vnd.wfa.wsc";
/** Android Application Record: hands the tap to a specific app package. */
export const AAR_TYPE = "android.com:pkg";

/* ── URI record prefixes (NFC Forum RTD-URI, 0x00–0x23) ─────────── */

export const URI_PREFIXES = [
  "", // 0x00 — no abbreviation
  "http://www.",
  "https://www.",
  "http://",
  "https://",
  "tel:",
  "mailto:",
  "ftp://anonymous:anonymous@",
  "ftp://ftp.",
  "ftps://",
  "sftp://",
  "smb://",
  "nfs://",
  "ftp://",
  "dav://",
  "news:",
  "telnet://",
  "imap:",
  "rtsp://",
  "urn:",
  "pop:",
  "sip:",
  "sips:",
  "tftp:",
  "btspp://",
  "btl2cap://",
  "btgoep://",
  "tcpobex://",
  "irdaobex://",
  "file://",
  "urn:epc:id:",
  "urn:epc:tag:",
  "urn:epc:pat:",
  "urn:epc:raw:",
  "urn:epc:",
  "urn:nfc:",
] as const;

/**
 * Longest matching RTD-URI prefix for `uri`.
 * The prefix costs 1 byte on the tag instead of its full text, which is the
 * difference between fitting an NTAG213 and not.
 */
export function uriPrefixCode(uri: string): number {
  let best = 0;
  for (let i = 1; i < URI_PREFIXES.length; i++) {
    const p = URI_PREFIXES[i];
    if (uri.startsWith(p) && p.length > URI_PREFIXES[best].length) best = i;
  }
  return best;
}

/* ── Wi-Fi (WSC) binary payload ─────────────────────────────────── */

const WSC_FIELD = {
  credential: 0x100e,
  networkIndex: 0x1026,
  ssid: 0x1045,
  authType: 0x1003,
  encType: 0x100f,
  networkKey: 0x1027,
  macAddress: 0x1020,
} as const;

const WSC_AUTH = { open: 0x0001, wpaPsk: 0x0002, wpa2Psk: 0x0020, wpaWpa2Psk: 0x0022 } as const;
const WSC_ENC = { none: 0x0001, wep: 0x0002, aes: 0x0008, tkipAes: 0x000c } as const;

export type WifiEncryption = "WPA" | "WEP" | "nopass";

function tlv(type: number, value: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + value.length);
  out[0] = (type >> 8) & 0xff;
  out[1] = type & 0xff;
  out[2] = (value.length >> 8) & 0xff;
  out[3] = value.length & 0xff;
  out.set(value, 4);
  return out;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Wi-Fi Simple Configuration credential payload.
 *
 * Android's `NfcWifiProtectedSetup` reads the outer Credential TLV and joins
 * the network straight from the tap — no app, no keyboard. iOS ignores it
 * (iPhones cannot join Wi-Fi from an NFC tag), which the UI states.
 */
export function buildWifiWscPayload(opts: {
  ssid: string;
  password?: string;
  encryption?: WifiEncryption;
}): Uint8Array {
  const encoder = new TextEncoder();
  const encryption = opts.encryption || "WPA";
  const open = encryption === "nopass";
  const wep = encryption === "WEP";

  const authType = open ? WSC_AUTH.open : wep ? WSC_AUTH.open : WSC_AUTH.wpaWpa2Psk;
  const encType = open ? WSC_ENC.none : wep ? WSC_ENC.wep : WSC_ENC.tkipAes;
  const networkKey = open ? "" : opts.password || "";

  const credential = concat([
    tlv(WSC_FIELD.networkIndex, new Uint8Array([0x01])),
    tlv(WSC_FIELD.ssid, encoder.encode(opts.ssid)),
    tlv(WSC_FIELD.authType, u16(authType)),
    tlv(WSC_FIELD.encType, u16(encType)),
    tlv(WSC_FIELD.networkKey, encoder.encode(networkKey)),
    tlv(WSC_FIELD.macAddress, new Uint8Array(6)),
  ]);

  return tlv(WSC_FIELD.credential, credential);
}

/* ── URI builders ───────────────────────────────────────────────── */

/** URI for the types that ride on a single RTD-URI record ("url" is normalized separately). */
function buildUri(type: NfcContentType, f: NfcFields): string {
  switch (type) {
    case "phone":
      return `tel:${(f.phone || "").replace(/\s/g, "")}`;
    case "email": {
      const params: string[] = [];
      if (f.subject) params.push(`subject=${encodeURIComponent(f.subject)}`);
      if (f.body) params.push(`body=${encodeURIComponent(f.body)}`);
      const mailto = `mailto:${f.email || ""}`;
      return params.length ? `${mailto}?${params.join("&")}` : mailto;
    }
    case "sms": {
      const sms = `sms:${(f.phone || "").replace(/\s/g, "")}`;
      return f.body ? `${sms}?body=${encodeURIComponent(f.body)}` : sms;
    }
    case "location":
      // A maps URL rather than `geo:` — iPhones ignore geo: but open this.
      return `https://www.google.com/maps?q=${f.lat || "0"},${f.lon || "0"}`;
    case "app":
      return `https://play.google.com/store/apps/details?id=${(f.packageName || "").trim()}`;
    default:
      return "";
  }
}

/** Normalises a bare domain to https:// so the tag opens a browser, not a search. */
export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `https://${url}`;
}

/* ── Record building ────────────────────────────────────────────── */

/** Which fields must be non-empty before the tag is worth writing. */
const REQUIRED: Record<NfcContentType, string[]> = {
  url: ["url"],
  vcard: ["firstName"],
  wifi: ["ssid"],
  phone: ["phone"],
  email: ["email"],
  sms: ["phone"],
  location: ["lat", "lon"],
  text: ["text"],
  app: ["packageName"],
};

export function isNfcInputValid(type: NfcContentType, fields: NfcFields): boolean {
  return REQUIRED[type].every((key) => (fields[key] || "").trim().length > 0);
}

/**
 * Builds the NDEF records for one tag. Returns `[]` when required fields are
 * still empty, so callers can render an idle state without special-casing.
 */
export function buildNdefRecords(
  type: NfcContentType,
  fields: NfcFields,
  opts: { lang?: string } = {}
): NfcRecordInit[] {
  if (!isNfcInputValid(type, fields)) return [];
  const lang = opts.lang || "tr";
  const encoder = new TextEncoder();

  switch (type) {
    case "vcard":
      return [
        {
          recordType: "mime",
          mediaType: VCARD_MIME,
          data: encoder.encode(buildVCard(fields as VCardFields)),
        },
      ];
    case "wifi":
      return [
        {
          recordType: "mime",
          mediaType: WSC_MIME,
          data: buildWifiWscPayload({
            ssid: fields.ssid,
            password: fields.password,
            encryption: (fields.encryption as WifiEncryption) || "WPA",
          }),
        },
      ];
    case "text":
      return [{ recordType: "text", lang, data: fields.text }];
    case "app":
      // Play Store URL first so iOS and non-Android readers still land
      // somewhere useful; Android gives the AAR priority over the URI.
      return [
        { recordType: "url", data: buildUri("app", fields) },
        { recordType: AAR_TYPE, data: encoder.encode(fields.packageName.trim()) },
      ];
    case "url":
      return [{ recordType: "url", data: normalizeUrl(fields.url) }];
    default:
      return [{ recordType: "url", data: buildUri(type, fields) }];
  }
}

/* ── Byte budget ────────────────────────────────────────────────── */

function payloadLength(record: NfcRecordInit): number {
  const encoder = new TextEncoder();
  const data =
    typeof record.data === "string" ? encoder.encode(record.data) : record.data;

  switch (record.recordType) {
    case "url": {
      const uri = typeof record.data === "string" ? record.data : "";
      const prefix = URI_PREFIXES[uriPrefixCode(uri)];
      return 1 + encoder.encode(uri.slice(prefix.length)).length;
    }
    case "text":
      // status byte + language code + text
      return 1 + encoder.encode(record.lang || "tr").length + data.length;
    default:
      return data.length;
  }
}

function typeLength(record: NfcRecordInit): number {
  const encoder = new TextEncoder();
  switch (record.recordType) {
    case "url":
      return 1; // "U"
    case "text":
      return 1; // "T"
    case "mime":
      return encoder.encode(record.mediaType || "").length;
    default:
      return encoder.encode(record.recordType).length;
  }
}

/**
 * Exact on-tag size of the NDEF message (record headers included), so the UI
 * can say "this needs an NTAG215" before the user buys 500 of the wrong tag.
 */
export function ndefMessageBytes(records: NfcRecordInit[]): number {
  return records.reduce((total, record) => {
    const payload = payloadLength(record);
    // header + type length + payload length (short record = 1 byte, else 4)
    return total + 1 + 1 + (payload < 256 ? 1 : 4) + typeLength(record) + payload;
  }, 0);
}

/** NDEF message capacity of the tags people actually buy, in bytes. */
export const NFC_TAG_CAPACITIES = [
  { id: "Ultralight", capacity: 46 },
  { id: "NTAG213", capacity: 132 },
  { id: "NTAG215", capacity: 492 },
  { id: "NTAG216", capacity: 872 },
] as const;

export function tagFit(bytes: number) {
  return NFC_TAG_CAPACITIES.map((tag) => ({ ...tag, fits: bytes > 0 && bytes <= tag.capacity }));
}

/* ── Reading back ───────────────────────────────────────────────── */

export interface DecodedRecord {
  /** Stable key the UI maps to a localized label. */
  kind: "url" | "text" | "vcard" | "wifi" | "app" | "mime" | "empty" | "unknown";
  value: string;
  raw?: string;
  /** Reverse mapping, so a scanned tag can be loaded straight back into the form. */
  form?: { type: NfcContentType; fields: NfcFields };
}

/** Maps a URI record back to the content type that would have produced it. */
function uriToForm(uri: string): { type: NfcContentType; fields: NfcFields } {
  if (/^tel:/i.test(uri)) return { type: "phone", fields: { phone: uri.slice(4) } };

  if (/^mailto:/i.test(uri)) {
    const [address, query = ""] = uri.slice(7).split("?");
    const params = new URLSearchParams(query);
    const fields: NfcFields = { email: address };
    if (params.get("subject")) fields.subject = params.get("subject") as string;
    if (params.get("body")) fields.body = params.get("body") as string;
    return { type: "email", fields };
  }

  if (/^sms:/i.test(uri)) {
    const [number, query = ""] = uri.slice(4).split("?");
    const params = new URLSearchParams(query);
    const fields: NfcFields = { phone: number };
    if (params.get("body")) fields.body = params.get("body") as string;
    return { type: "sms", fields };
  }

  const maps = /[?&]q=(-?[\d.]+),\s*(-?[\d.]+)/.exec(uri);
  if (maps && /maps/i.test(uri)) {
    return { type: "location", fields: { lat: maps[1], lon: maps[2] } };
  }

  const play = /play\.google\.com\/store\/apps\/details\?id=([^&\s]+)/i.exec(uri);
  if (play) return { type: "app", fields: { packageName: play[1] } };

  return { type: "url", fields: { url: uri } };
}

/**
 * Best form state for a scanned tag. An Android app record wins over the Play
 * Store URL that ships alongside it; otherwise the first decodable record wins.
 */
export function recordsToForm(
  records: DecodedRecord[]
): { type: NfcContentType; fields: NfcFields } | null {
  const priority: DecodedRecord["kind"][] = ["app", "wifi", "vcard", "text", "url"];
  for (const kind of priority) {
    const hit = records.find((record) => record.kind === kind && record.form);
    if (hit?.form) return hit.form;
  }
  return records.find((record) => record.form)?.form ?? null;
}

function toText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return new TextDecoder().decode(data);
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new TextDecoder().decode(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    );
  }
  return "";
}

export interface WscCredentials {
  ssid: string;
  password: string;
  encryption: WifiEncryption;
}

/**
 * Reads a WSC credential blob back into form fields, so a Wi-Fi tag scanned on
 * a phone can be re-edited (and re-written) elsewhere.
 */
export function readWscCredentials(data: Uint8Array): WscCredentials {
  const decoder = new TextDecoder();
  let ssid = "";
  let password = "";
  let authType = 0;
  let encType = 0;

  const walk = (buf: Uint8Array, depth: number) => {
    let i = 0;
    while (i + 4 <= buf.length) {
      const type = (buf[i] << 8) | buf[i + 1];
      const len = (buf[i + 2] << 8) | buf[i + 3];
      const start = i + 4;
      if (start + len > buf.length) break;
      const value = buf.subarray(start, start + len);
      if (type === WSC_FIELD.ssid && !ssid) ssid = decoder.decode(value);
      else if (type === WSC_FIELD.networkKey && !password) password = decoder.decode(value);
      else if (type === WSC_FIELD.authType && len === 2) authType = (value[0] << 8) | value[1];
      else if (type === WSC_FIELD.encType && len === 2) encType = (value[0] << 8) | value[1];
      else if (type === WSC_FIELD.credential && depth < 3) walk(value, depth + 1);
      i = start + len;
    }
  };
  walk(data, 0);

  const encryption: WifiEncryption =
    authType === WSC_AUTH.open
      ? encType === WSC_ENC.wep || password
        ? "WEP"
        : "nopass"
      : "WPA";

  return { ssid, password, encryption };
}

/** Reads the SSID out of a WSC credential blob so scans show a usable name. */
export function readWscSsid(data: Uint8Array): string {
  return readWscCredentials(data).ssid;
}

/** Turns a written or scanned record into something the UI can print. */
export function describeRecord(record: {
  recordType: string;
  mediaType?: string | null;
  data?: unknown;
}): DecodedRecord {
  const { recordType, mediaType } = record;

  if (recordType === "url" || recordType === "absolute-url") {
    const value = toText(record.data);
    return { kind: "url", value, form: uriToForm(value) };
  }
  if (recordType === "text") {
    const value = toText(record.data);
    return { kind: "text", value, form: { type: "text", fields: { text: value } } };
  }
  if (recordType === "empty") {
    return { kind: "empty", value: "" };
  }
  if (recordType === "mime") {
    if (mediaType === WSC_MIME) {
      const bytes =
        record.data instanceof Uint8Array
          ? record.data
          : ArrayBuffer.isView(record.data)
            ? new Uint8Array(
                (record.data as ArrayBufferView).buffer,
                (record.data as ArrayBufferView).byteOffset,
                (record.data as ArrayBufferView).byteLength
              )
            : new Uint8Array(0);
      const credentials = readWscCredentials(bytes);
      return {
        kind: "wifi",
        value: credentials.ssid,
        form: {
          type: "wifi",
          fields: {
            ssid: credentials.ssid,
            password: credentials.password,
            encryption: credentials.encryption,
          },
        },
      };
    }
    if (mediaType === VCARD_MIME || mediaType === "text/x-vcard") {
      const raw = toText(record.data);
      const fn = /^FN:(.*)$/m.exec(raw)?.[1]?.trim();
      const fields: NfcFields = {};
      for (const [key, value] of Object.entries(parseVCard(raw))) {
        if (value) fields[key] = value;
      }
      return { kind: "vcard", value: fn || "", raw, form: { type: "vcard", fields } };
    }
    return { kind: "mime", value: mediaType || "", raw: toText(record.data) };
  }
  if (recordType === AAR_TYPE) {
    const value = toText(record.data);
    return { kind: "app", value, form: { type: "app", fields: { packageName: value } } };
  }
  return { kind: "unknown", value: recordType, raw: toText(record.data) };
}
