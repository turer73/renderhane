export type SocialPlatform =
  | "instagram"
  | "whatsapp"
  | "telegram"
  | "tiktok"
  | "x"
  | "facebook"
  | "linkedin"
  | "youtube"
  | "website";

export type ShareFields = Record<string, string | undefined>;

export const SOCIAL_PLATFORMS: ReadonlyArray<{
  id: SocialPlatform;
  label: string;
  labelEn: string;
  key: string;
  placeholder: string;
  placeholderEn: string;
}> = [
  { id: "instagram", label: "Instagram", labelEn: "Instagram", key: "i", placeholder: "@kullanici", placeholderEn: "@username" },
  { id: "whatsapp", label: "WhatsApp", labelEn: "WhatsApp", key: "w", placeholder: "+905551234567", placeholderEn: "+905551234567" },
  { id: "telegram", label: "Telegram", labelEn: "Telegram", key: "t", placeholder: "@kullanici", placeholderEn: "@username" },
  { id: "tiktok", label: "TikTok", labelEn: "TikTok", key: "k", placeholder: "@kullanici", placeholderEn: "@username" },
  { id: "x", label: "X", labelEn: "X", key: "x", placeholder: "@kullanici", placeholderEn: "@username" },
  { id: "facebook", label: "Facebook", labelEn: "Facebook", key: "f", placeholder: "kullanici", placeholderEn: "username" },
  { id: "linkedin", label: "LinkedIn", labelEn: "LinkedIn", key: "l", placeholder: "in/kullanici veya company/marka", placeholderEn: "in/username or company/brand" },
  { id: "youtube", label: "YouTube", labelEn: "YouTube", key: "y", placeholder: "@kanal", placeholderEn: "@channel" },
  { id: "website", label: "Web sitesi", labelEn: "Website", key: "u", placeholder: "https://…", placeholderEn: "https://…" },
];

const BY_ID = Object.fromEntries(SOCIAL_PLATFORMS.map((platform) => [platform.id, platform])) as Record<
  SocialPlatform,
  (typeof SOCIAL_PLATFORMS)[number]
>;
const BY_KEY = Object.fromEntries(SOCIAL_PLATFORMS.map((platform) => [platform.key, platform])) as Record<
  string,
  (typeof SOCIAL_PLATFORMS)[number]
>;

const HANDLE_RULES: Partial<Record<SocialPlatform, RegExp>> = {
  instagram: /^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  telegram: /^[A-Za-z0-9_]{5,32}$/,
  tiktok: /^(?!.*\.$)[A-Za-z0-9._]{2,24}$/,
  facebook: /^[A-Za-z0-9.]{1,50}$/,
  youtube: /^[A-Za-z0-9._-]{3,30}$/,
};
const ORIGIN = "https://www.renderhane.com";

function parseHttpUrl(raw: string): URL {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error("Geçerli bir bağlantı girin.");
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error("Yalnızca güvenli HTTP/HTTPS bağlantıları destekleniyor.");
  if (url.protocol === "http:") url.protocol = "https:";
  return url;
}

function exactHost(url: URL, hosts: readonly string[]): void {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!hosts.includes(host)) throw new Error("Seçilen sosyal ağa ait resmi bağlantıyı girin.");
}

function removeTrackingParams(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
}

function cleanHandle(raw: string, platform?: SocialPlatform): string {
  const value = raw.trim().replace(/^@/, "").replace(/\/+$/, "");
  if (platform === "youtube") {
    const length = [...value].length;
    if (length < 3 || length > 30 || !/^[\p{L}\p{N}._·-]+$/u.test(value))
      throw new Error("Geçerli bir kullanıcı adı girin.");
    return value;
  }
  const rule = (platform && HANDLE_RULES[platform]) || /^[A-Za-z0-9._-]{1,100}$/;
  if (!rule.test(value)) throw new Error("Geçerli bir kullanıcı adı girin.");
  return value;
}

/**
 * Converts either a handle/phone or a full official URL into one canonical URL.
 * Host checks are exact; look-alike subdomains are rejected.
 */
export function normalizeSocialLink(platform: SocialPlatform, raw: string): { url: string; token: string } {
  const value = raw.trim();
  if (!value) throw new Error("Sosyal ağ bilgisini girin.");

  if (platform === "website") {
    const url = parseHttpUrl(value);
    removeTrackingParams(url);
    return { url: url.href, token: url.href };
  }

  if (platform === "whatsapp") {
    let phone = value;
    if (/^https?:\/\//i.test(value)) {
      const url = parseHttpUrl(value);
      exactHost(url, ["wa.me", "api.whatsapp.com", "whatsapp.com", "chat.whatsapp.com"]);
      removeTrackingParams(url);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const pathSegments = url.pathname.split("/").filter(Boolean);
      const hasPhoneTarget = host === "wa.me"
        ? pathSegments.length === 1
        : url.searchParams.has("phone");
      phone = host === "wa.me" ? pathSegments[0] || "" : url.searchParams.get("phone") || "";
      if (hasPhoneTarget) {
        if (!/^\+?[\d\s()-]+$/.test(phone))
          throw new Error("WhatsApp numarasını ülke koduyla girin.");
        const digits = phone.replace(/\D/g, "");
        if (!/^[1-9]\d{6,14}$/.test(digits))
          throw new Error("WhatsApp numarasını ülke koduyla girin.");
        const phoneOnlyUrl =
          (host === "wa.me" && !url.search) ||
          (host !== "wa.me" && [...url.searchParams.keys()].every((key) => key === "phone"));
        if (phoneOnlyUrl) return { url: `https://wa.me/${digits}`, token: digits };
      }
      return { url: url.href, token: url.href };
    }
    if (!/^\+?[\d\s()-]+$/.test(phone))
      throw new Error("WhatsApp numarasını ülke koduyla girin.");
    const digits = phone.replace(/\D/g, "");
    if (!/^[1-9]\d{6,14}$/.test(digits)) throw new Error("WhatsApp numarasını ülke koduyla girin.");
    return { url: `https://wa.me/${digits}`, token: digits };
  }

  if (platform === "linkedin") {
    let path = value.replace(/^@/, "").replace(/^\/+|\/+$/g, "");
    if (/^https?:\/\//i.test(value)) {
      const url = parseHttpUrl(value);
      exactHost(url, ["linkedin.com"]);
      path = url.pathname.replace(/^\/+|\/+$/g, "");
      if (!/^(in|company)\/[A-Za-z0-9._%\-]{1,100}$/.test(path)) {
        removeTrackingParams(url);
        return { url: url.href, token: url.href };
      }
    }
    if (!/^(in|company)\/[A-Za-z0-9._%\-]{1,100}$/.test(path))
      path = `in/${cleanHandle(path, platform)}`;
    return { url: `https://www.linkedin.com/${path}`, token: path };
  }

  const rules: Record<Exclude<SocialPlatform, "website" | "whatsapp" | "linkedin">, {
    hosts: string[];
    prefix: string;
    fromPath: (path: string) => string;
  }> = {
    instagram: { hosts: ["instagram.com"], prefix: "https://www.instagram.com/", fromPath: (path) => path },
    telegram: { hosts: ["t.me", "telegram.me"], prefix: "https://t.me/", fromPath: (path) => path },
    tiktok: { hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"], prefix: "https://www.tiktok.com/@", fromPath: (path) => path.replace(/^@/, "") },
    x: { hosts: ["x.com", "twitter.com"], prefix: "https://x.com/", fromPath: (path) => path },
    facebook: { hosts: ["facebook.com", "m.facebook.com", "fb.com"], prefix: "https://www.facebook.com/", fromPath: (path) => path },
    youtube: { hosts: ["youtube.com", "m.youtube.com", "youtu.be"], prefix: "https://www.youtube.com/@", fromPath: (path) => path.replace(/^@/, "") },
  };
  const rule = rules[platform];
  let handle = value;
  if (/^https?:\/\//i.test(value)) {
    const url = parseHttpUrl(value);
    exactHost(url, rule.hosts);
    removeTrackingParams(url);
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0)
      throw new Error("Sosyal ağ profil veya paylaşım bağlantısını girin.");
    const isSimpleProfile = segments.length === 1 && !url.search && (
      platform !== "youtube" || url.hostname.toLowerCase().replace(/^www\./, "") === "youtube.com"
    );
    if (!isSimpleProfile) return { url: url.href, token: url.href };
    let segment = segments[0] || "";
    try {
      segment = decodeURIComponent(segment);
    } catch {
      return { url: url.href, token: url.href };
    }
    if ((platform === "telegram" && segment.startsWith("+")) ||
        (platform === "youtube" && !segment.startsWith("@")) ||
        (platform === "tiktok" && !segment.startsWith("@")))
      return { url: url.href, token: url.href };
    handle = rule.fromPath(segment);
  }
  handle = cleanHandle(handle, platform);
  return { url: `${rule.prefix}${handle}`, token: handle };
}

/** Routes containing third-party contact data must never initialize analytics. */
export function isPrivateSharePath(pathname: string): boolean {
  return /^\/[a-z]{2}\/(?:k|s)\/?$/.test(pathname);
}

export function buildSocialLandingUrl(fields: ShareFields, locale: "tr" | "en" = "tr"): string {
  const params = new URLSearchParams();
  for (const platform of SOCIAL_PLATFORMS) {
    const raw = fields[platform.id]?.trim();
    if (!raw) continue;
    params.set(platform.key, normalizeSocialLink(platform.id, raw).token);
  }
  if ([...params].length < 2) throw new Error("Bağlantılı kart için en az iki sosyal ağ girin.");
  const name = fields.profileName?.trim();
  if (name) params.set("n", name.slice(0, 80));
  return `${ORIGIN}/${locale}/s?${params.toString()}`;
}

export function buildSocialPayload(fields: ShareFields, locale: "tr" | "en" = "tr"): string {
  if ((fields.socialMode || "single") === "card") return buildSocialLandingUrl(fields, locale);
  const platform = (fields.platform || "instagram") as SocialPlatform;
  if (!Object.hasOwn(BY_ID, platform)) throw new Error("Desteklenen bir sosyal ağ seçin.");
  return normalizeSocialLink(platform, fields.socialValue || "").url;
}

export function socialLinksFromParams(
  params: URLSearchParams,
  locale: "tr" | "en" = "tr"
): Array<{ platform: SocialPlatform; label: string; url: string }> {
  const links: Array<{ platform: SocialPlatform; label: string; url: string }> = [];
  for (const [key, token] of params) {
    const platform = BY_KEY[key];
    if (!platform || !token) continue;
    try {
      links.push({
        platform: platform.id,
        label: locale === "en" ? platform.labelEn : platform.label,
        url: normalizeSocialLink(platform.id, token).url,
      });
    } catch {
      // Ignore invalid public query values instead of rendering unsafe links.
    }
  }
  return links;
}

export function normalizeContactWebsite(raw: string): string | null {
  try {
    const url = parseHttpUrl(raw);
    return url.href.length <= 1000 ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeContactPhone(raw: string): string | null {
  const phone = raw.trim().replace(/[\s()-]/g, "");
  return /^\+?\d{5,15}$/.test(phone) ? phone : null;
}

export function normalizeContactEmail(raw: string): string | null {
  const email = raw.trim();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~.-]+$/.test(local)) return null;
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(domain)
    ? email
    : null;
}

export function buildContactLandingUrl(fields: ShareFields, locale: "tr" | "en" = "tr"): string {
  const firstName = fields.firstName?.trim() || "";
  const lastName = fields.lastName?.trim() || "";
  if (!firstName) throw new Error("Ad alanını doldurun.");
  if (firstName.length > 80 || lastName.length > 80)
    throw new Error("Ad ve soyad en fazla 80 karakter olabilir.");
  const params = new URLSearchParams({ n: firstName });
  if (lastName) params.set("s", lastName);
  if (fields.phone?.trim()) {
    const phone = normalizeContactPhone(fields.phone);
    if (!phone) throw new Error("Telefon numarasını ülke koduyla girin.");
    params.set("p", phone);
  }
  if (fields.email?.trim()) {
    const email = normalizeContactEmail(fields.email);
    if (!email) throw new Error("Geçerli bir e-posta adresi girin.");
    params.set("e", email);
  }
  if (fields.org?.trim()) params.set("o", fields.org.trim());
  if ((fields.org?.trim().length || 0) > 120)
    throw new Error("Kurum / marka en fazla 120 karakter olabilir.");
  if (fields.website?.trim()) {
    const website = normalizeContactWebsite(fields.website);
    if (!website) throw new Error("Web adresi en fazla 1000 karakter olabilir.");
    params.set("u", website);
  }
  return `${ORIGIN}/${locale}/k?${params.toString()}`;
}
