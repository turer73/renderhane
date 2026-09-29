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

const directInstagramUrl = (value: string): string => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "instagram.com" && !url.username && !url.password ? value : "";
  } catch {
    return "";
  }
};

const editableHttpUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return value;
  } catch {
    return "";
  }
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
  let formattedName: string | undefined;
  let structuredNameSeen = false;
  const groupedKinds = new Map<string, "instagram" | "whatsapp" | "website">();
  const groupedLabels = new Map<string, string>();
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
    const charset = (/(?:^|;)CHARSET=([^;:]+)/i.exec(name)?.[1] || "utf-8")
      .replace(/^(["'])(.*)\1$/, "$2");
    const rawValue = quotedPrintable ? decodeQuotedPrintable(encodedValue, charset) : encodedValue;
    const value = unescapeValue(rawValue);
    const property = name.split(";")[0].toUpperCase();
    const group = /^(ITEM\d+)\./.exec(property)?.[1];
    const grouped = Boolean(group);
    const base = property.replace(/^ITEM\d+\./, "");

    if (base === "N") {
      const [last, first, additional, prefix, suffix] =
        splitEscaped(rawValue, ";").map(unescapeValue);
      if ([additional, prefix, suffix].some((part) => part?.trim()))
        throw new Error("Ek ad, unvan veya son ek içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.firstName = first?.trim() || undefined;
      fields.lastName = last?.trim() || undefined;
      structuredNameSeen = true;
    } else if (base === "FN") {
      const nextFormattedName = value.trim();
      if (formattedName && nextFormattedName && formattedName !== nextFormattedName)
        throw new Error("Birden fazla biçimlendirilmiş adı olan kişi kartları güvenli biçimde düzenlenemez.");
      formattedName ||= nextFormattedName;
    } else if (base === "TEL") {
      const typeParam = /(?:^|;)TYPE=([^;:]+)/i.exec(name)?.[1];
      const types = typeParam ? typeParam.split(",").map((type) => type.trim().toUpperCase()) : [];
      const legacyType = /(?:^|;)(WORK|HOME|VOICE|FAX|PAGER)(?:;|$)/i.exec(name)?.[1];
      if (types.some((type) => type !== "CELL") || legacyType)
        throw new Error("Telefon türü bilgisi içeren kişi kartları güvenli biçimde düzenlenemez.");
      const phone = value.replace(/^tel:/i, "");
      if (fields.phone && phone && fields.phone !== phone)
        throw new Error("Birden fazla telefon numarası içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.phone ||= phone;
    } else if (base === "EMAIL") {
      const emailType = /(?:^|;)TYPE=([^;:]+)/i.exec(name)?.[1];
      const legacyEmailType = /(?:^|;)(WORK|HOME|INTERNET)(?:;|$)/i.exec(name)?.[1];
      if (emailType || legacyEmailType)
        throw new Error("E-posta türü bilgisi içeren kişi kartları güvenli biçimde düzenlenemez.");
      if (fields.email && value && fields.email !== value)
        throw new Error("Birden fazla e-posta adresi içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.email ||= value;
    } else if (base === "ORG") {
      const organization = splitEscaped(rawValue, ";").map(unescapeValue);
      if (organization.slice(1).some((part) => part.trim()))
        throw new Error("Birim bilgisi içeren kuruluşlar güvenli biçimde düzenlenemez.");
      const nextOrganization = organization[0]?.trim() || "";
      if (fields.org && nextOrganization && fields.org !== nextOrganization)
        throw new Error("Birden fazla kuruluş içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.org ||= nextOrganization;
    } else if (base === "TITLE") {
      const nextTitle = value.trim();
      if (fields.title && nextTitle && fields.title !== nextTitle)
        throw new Error("Birden fazla unvan içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.title ||= nextTitle;
    } else if (base === "ADR") {
      const typeParam = /(?:^|;)TYPE=([^;:]+)/i.exec(name)?.[1];
      const types = typeParam ? typeParam.split(",").map((type) => type.trim().toUpperCase()) : [];
      const legacyWork = /(?:^|;)WORK(?:;|$)/i.test(name);
      if (!(types.length === 1 && types[0] === "WORK") && !legacyWork)
        throw new Error("Adres türü bilgisi korunamayan kişi kartları güvenli biçimde düzenlenemez.");
      const parts = splitEscaped(rawValue, ";").map(unescapeValue);
      if (parts.some((part, index) => index !== 2 && part.trim()))
        throw new Error("Yapılandırılmış adres içeren kişi kartları güvenli biçimde düzenlenemez.");
      const address = (parts[2] || "").trim();
      if (fields.address && address && fields.address !== address)
        throw new Error("Birden fazla adres içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.address ||= address;
    } else if (base === "URL" && grouped && group) {
      const instagram = directInstagramUrl(value);
      const whatsapp = directWhatsAppNumber(value);
      if (instagram) {
        if (fields.instagram && fields.instagram !== instagram)
          throw new Error("Birden fazla Instagram adresi içeren kişi kartları güvenli biçimde düzenlenemez.");
        fields.instagram ||= instagram;
        groupedKinds.set(group, "instagram");
      } else if (whatsapp) {
        if (fields.whatsapp && fields.whatsapp !== whatsapp)
          throw new Error("Birden fazla WhatsApp adresi içeren kişi kartları güvenli biçimde düzenlenemez.");
        fields.whatsapp ||= whatsapp;
        groupedKinds.set(group, "whatsapp");
      } else {
        const website = editableHttpUrl(value);
        if (!website)
          throw new Error("HTTP dışındaki web adresleri güvenli biçimde düzenlenemez.");
        if (fields.website && website && fields.website !== website)
          throw new Error("Birden fazla web adresi içeren kişi kartları güvenli biçimde düzenlenemez.");
        fields.website ||= website;
        groupedKinds.set(group, "website");
      }
    } else if (base === "URL") {
      const website = editableHttpUrl(value);
      if (!website)
        throw new Error("HTTP dışındaki web adresleri güvenli biçimde düzenlenemez.");
      if (fields.website && website && fields.website !== website)
        throw new Error("Birden fazla web adresi içeren kişi kartları güvenli biçimde düzenlenemez.");
      fields.website ||= website;
    } else if (base === "X-ABLABEL" && grouped && group) {
      const label = value.trim();
      if (groupedLabels.has(group) && groupedLabels.get(group) !== label)
        throw new Error("Birden fazla bağlantı etiketi içeren kişi kartları güvenli biçimde düzenlenemez.");
      groupedLabels.set(group, label);
    } else if (!["BEGIN", "END", "VERSION", "PRODID", "REV"].includes(base)) {
      throw new Error("Desteklenmeyen kişi kartı alanları güvenli biçimde düzenlenemez.");
    }
  }

  for (const [group, label] of groupedLabels) {
    const expected = groupedKinds.get(group) === "instagram"
      ? "Instagram"
      : groupedKinds.get(group) === "whatsapp"
        ? "WhatsApp"
        : "";
    if (!expected || label !== expected)
      throw new Error("Özel bağlantı etiketi içeren kişi kartları güvenli biçimde düzenlenemez.");
  }

  if (structuredNameSeen) {
    const canonical = [fields.firstName, fields.lastName].filter(Boolean).join(" ");
    if (formattedName && formattedName !== canonical)
      throw new Error("Biçimlendirilmiş adı farklı kişi kartları güvenli biçimde düzenlenemez.");
  } else if (formattedName) {
    const [first, ...rest] = formattedName.split(/\s+/);
    fields.firstName = first;
    if (rest.length) fields.lastName = rest.join(" ");
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
