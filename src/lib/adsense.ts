const ADSENSE_CLIENT_RE = /^ca-pub-\d{16}$/;
const ADSENSE_SLOT_RE = /^\d{10}$/;

export function isValidAdSenseClientId(value: string): boolean {
  return ADSENSE_CLIENT_RE.test(value);
}

export function isValidAdSenseSlotId(value: string): boolean {
  return ADSENSE_SLOT_RE.test(value);
}

export function getAdSenseScriptUrl(clientId: string): string | null {
  if (!isValidAdSenseClientId(clientId)) return null;
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
}
