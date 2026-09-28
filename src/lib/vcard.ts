/**
 * vCard 3.0 builder — shared by the free QR code tool and the NFC tag writer
 * so both tools encode contact cards byte-identically.
 */

export interface VCardFields {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  org?: string;
  title?: string;
  address?: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
}

const escapeValue = (value: string): string => value
  .replace(/\\/g, "\\\\")
  .replace(/\r?\n/g, "\\n")
  .replace(/;/g, "\\;")
  .replace(/,/g, "\\,")
  .trim();

const safeUriValue = (value: string): string => value.replace(/[\r\n]/g, "").trim();

const foldContentLine = (line: string): string[] => {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (current && bytes + size > 75) {
      folded.push(current);
      current = ` ${character}`;
      bytes = 1 + size;
    } else {
      current += character;
      bytes += size;
    }
  }
  folded.push(current);
  return folded;
};

const unescapeValue = (value: string): string => {
  let result = "";
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char !== "\\" || index === value.length - 1) {
      result += char;
      continue;
    }
    const escaped = value[++index];
    result += escaped === "n" || escaped === "N" ? "\n" : escaped;
  }
  return result;
};

const directWhatsAppNumber = (value: string): string => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "wa.me" || url.username || url.password) return "";
    return /^\/(\d+)\/?$/.exec(url.pathname)?.[1] || "";
  } catch {
    return "";
  }
};

const decodeQuotedPrintable = (value: string, charset = "utf-8"): string => {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "=" && /^[0-9A-F]{2}$/i.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(...encoder.encode(value[index]));
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
};

const splitEscaped = (value: string, separator: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      current += `\\${char}`;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === separator) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (escaped) current += "\\";
  parts.push(current);
  return parts;
};

/** Reverse of {@link buildVCard} — turns a scanned card back into form fields. */
export function parseVCard(text: string): VCardFields {
  const fields: VCardFields = {};
  // RFC 6350 folding applies to every property; quoted-printable soft breaks
  // apply only when that property explicitly declares the transfer encoding.
  const physical = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const lines: string[] = [];
  for (let index = 0; index < physical.length; index++) {
    let line = physical[index];
    const header = line.slice(0, Math.max(0, line.indexOf(":")));
    if (/(?:^|;)ENCODING=QUOTED-PRINTABLE(?:;|$)/i.test(header)) {
      while (line.endsWith("=") && index + 1 < physical.length)
        line = line.slice(0, -1) + physical[++index];
    }
    lines.push(line);
  }

  for (const line of lines) {
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const name = line.slice(0, sep);
    const encodedValue = line.slice(sep + 1).trim();
    const quotedPrintable = /(?:^|;)ENCODING=QUOTED-PRINTABLE(?:;|$)/i.test(name);
    const charset = /(?:^|;)CHARSET=([^;:]+)/i.exec(name)?.[1] || "utf-8";
    const rawValue = quotedPrintable ? decodeQuotedPrintable(encodedValue, charset) : encodedValue;
    const value = unescapeValue(rawValue);
    const property = name.split(";")[0].toUpperCase();
    const grouped = /^ITEM\d+\./.test(property);
    const base = property.replace(/^ITEM\d+\./, "");

    if (base === "N") {
      const [last, first] = splitEscaped(rawValue, ";").map(unescapeValue);
      if (first) fields.firstName = first.trim();
      if (last) fields.lastName = last.trim();
    } else if (base === "FN" && !fields.firstName) {
      const [first, ...rest] = value.split(" ");
      fields.firstName = first;
      if (rest.length) fields.lastName = rest.join(" ");
    } else if (base === "TEL") {
      const phone = value.replace(/^tel:/i, "");
      if (fields.phone && phone && fields.phone !== phone)
        throw new Error("Birden fazla telefon numarası içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.phone ||= phone;
    } else if (base === "EMAIL") {
      if (fields.email && value && fields.email !== value)
        throw new Error("Birden fazla e-posta adresi içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.email ||= value;
    } else if (base === "ORG") {
      fields.org ||= value;
    } else if (base === "TITLE") {
      fields.title ||= value;
    } else if (base === "ADR") {
      const parts = splitEscaped(rawValue, ";").map(unescapeValue);
      const address = parts.map((part) => part.trim()).filter(Boolean).join(", ");
      if (fields.address && address && fields.address !== address)
        throw new Error("Birden fazla adres içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.address ||= address;
    } else if (base === "URL" && grouped) {
      const instagram = /https?:\/\/(?:www\.)?instagram\.com\//i.test(value) ? value : "";
      const whatsapp = directWhatsAppNumber(value);
      if (instagram) fields.instagram ||= instagram;
      else if (whatsapp) fields.whatsapp ||= whatsapp;
      else fields.website ||= value;
    } else if (base === "URL") {
      fields.website ||= value;
    }
  }

  if (!fields.address) delete fields.address;
  return fields;
}

export function buildVCard(fields: VCardFields): string {
  const firstName = escapeValue(fields.firstName || "");
  const lastName = escapeValue(fields.lastName || "");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${lastName};${firstName};;;`,
    `FN:${firstName} ${lastName}`.trim(),
  ];
  if (fields.phone) lines.push(`TEL;TYPE=CELL:${escapeValue(fields.phone)}`);
  if (fields.email) lines.push(`EMAIL:${escapeValue(fields.email)}`);
  if (fields.org) lines.push(`ORG:${escapeValue(fields.org)}`);
  if (fields.title) lines.push(`TITLE:${escapeValue(fields.title)}`);
  if (fields.address) lines.push(`ADR;TYPE=WORK:;;${escapeValue(fields.address)};;;;`);
  if (fields.website) lines.push(`URL:${safeUriValue(fields.website)}`);
  // Social links use Apple item-grouping (itemN.URL + X-ABLabel) so they
  // show up labeled on iOS Contacts and as tappable URLs on Android.
  let socialIdx = 1;
  if (fields.instagram) {
    const handle = fields.instagram
      .trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/\/+$/, "");
    if (handle) {
      lines.push(`item${socialIdx}.URL:https://www.instagram.com/${handle}`);
      lines.push(`item${socialIdx}.X-ABLabel:Instagram`);
      socialIdx++;
    }
  }
  if (fields.whatsapp) {
    const num = fields.whatsapp.replace(/\D/g, "");
    if (num) {
      lines.push(`item${socialIdx}.URL:https://wa.me/${num}`);
      lines.push(`item${socialIdx}.X-ABLabel:WhatsApp`);
      socialIdx++;
    }
  }
  lines.push("END:VCARD");
  return lines.flatMap(foldContentLine).join("\r\n");
}
