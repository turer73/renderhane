const PRIVATE_SHARE_URL =
  /((?:https?:\/\/[^/\s]+)?(?:\/[a-z]{2}\/(?:k|s|b)\/?|\/api\/contact-card\/?))(?:\?[^#\s]*)?(?:#[^\s]*)?/gi;

/**
 * Removes query strings and fragments from contact/social share routes before
 * telemetry leaves the browser, server, or edge runtime.
 */
export function sanitizePrivateShareText(value: string): string {
  return value.replace(PRIVATE_SHARE_URL, "$1");
}

export function isPrivateShareRoute(value: string): boolean {
  return /(?:^|\s|https?:\/\/[^/\s]+)(?:\/[a-z]{2}\/(?:k|s|b)\/?|\/api\/contact-card\/?)(?:[?#\s]|$)/i.test(value);
}

export function scrubSentryEvent<T>(event: T): T | null {
  const mutable = event as {
    request?: {
      url?: string;
      query_string?: unknown;
      headers?: Record<string, unknown>;
    };
    transaction?: string;
    breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
    spans?: Array<{ description?: string; data?: Record<string, unknown> }>;
  };

  const privateRequest =
    isPrivateShareRoute(mutable.request?.url || "") ||
    isPrivateShareRoute(mutable.transaction || "");
  // Private landing-page events can repeat the full URL in arbitrary root
  // fields. Dropping them is safer than trying to maintain a partial allowlist.
  if (privateRequest) return null;
  if (mutable.request?.url)
    mutable.request.url = sanitizePrivateShareText(mutable.request.url);
  if (privateRequest && mutable.request)
    delete mutable.request.query_string;
  for (const [key, value] of Object.entries(mutable.request?.headers || {})) {
    if (/^referr?er$/i.test(key) && typeof value === "string" && mutable.request?.headers)
      mutable.request.headers[key] = sanitizePrivateShareText(value);
  }
  if (mutable.transaction)
    mutable.transaction = sanitizePrivateShareText(mutable.transaction);

  for (const breadcrumb of mutable.breadcrumbs || []) {
    if (!breadcrumb.data) continue;
    for (const key of ["url", "from", "to"]) {
      const value = breadcrumb.data[key];
      if (typeof value === "string")
        breadcrumb.data[key] = sanitizePrivateShareText(value);
    }
  }

  for (const span of mutable.spans || []) {
    if (span.description)
      span.description = sanitizePrivateShareText(span.description);
    for (const [key, value] of Object.entries(span.data || {})) {
      if (typeof value === "string" && span.data)
        span.data[key] = sanitizePrivateShareText(value);
    }
  }

  return event;
}
