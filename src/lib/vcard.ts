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

/** Reverse of {@link buildVCard} — turns a scanned card back into form fields. */
export function parseVCard(text: string): VCardFields {
  const fields: VCardFields = {};
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const name = line.slice(0, sep);
    const value = line.slice(sep + 1).trim();
    const base = name.split(";")[0].toUpperCase();

    if (base === "N") {
      const [last, first] = value.split(";");
      if (first) fields.firstName = first.trim();
      if (last) fields.lastName = last.trim();
    } else if (base === "FN" && !fields.firstName) {
      const [first, ...rest] = value.split(" ");
      fields.firstName = first;
      if (rest.length) fields.lastName = rest.join(" ");
    } else if (base === "TEL") {
      fields.phone ||= value;
    } else if (base === "EMAIL") {
      fields.email ||= value;
    } else if (base === "ORG") {
      fields.org ||= value;
    } else if (base === "TITLE") {
      fields.title ||= value;
    } else if (base === "ADR") {
      const parts = value.split(";");
      fields.address ||= parts[2]?.trim() || "";
    } else if (base === "URL") {
      fields.website ||= value;
    } else if (/^ITEM\d+\.URL$/.test(base)) {
      const instagram = /instagram\.com\/([^/?#]+)/i.exec(value)?.[1];
      const whatsapp = /wa\.me\/(\d+)/i.exec(value)?.[1];
      if (instagram) fields.instagram ||= instagram;
      if (whatsapp) fields.whatsapp ||= whatsapp;
    }
  }

  if (!fields.address) delete fields.address;
  return fields;
}

export function buildVCard(fields: VCardFields): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${fields.lastName || ""};${fields.firstName || ""};;;`,
    `FN:${fields.firstName || ""} ${fields.lastName || ""}`.trim(),
  ];
  if (fields.phone) lines.push(`TEL;TYPE=CELL:${fields.phone}`);
  if (fields.email) lines.push(`EMAIL:${fields.email}`);
  if (fields.org) lines.push(`ORG:${fields.org}`);
  if (fields.title) lines.push(`TITLE:${fields.title}`);
  if (fields.address) lines.push(`ADR;TYPE=WORK:;;${fields.address};;;;`);
  if (fields.website) lines.push(`URL:${fields.website}`);
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
  return lines.join("\n");
}
