const PRIVATE_SHARE_URL =
  /((?:https?:\/\/[^/\s]+)?\/[a-z]{2}\/(?:k|s)\/?)(?:\?[^#\s]*)?(?:#[^\s]*)?/gi;

/**
 * Removes query strings and fragments from contact/social share routes before
 * telemetry leaves the browser, server, or edge runtime.
 */
export function sanitizePrivateShareText(value: string): string {
  return value.replace(PRIVATE_SHARE_URL, "$1");
}

export function isPrivateShareRoute(value: string): boolean {
  return /(?:^|https?:\/\/[^/\s]+)\/[a-z]{2}\/(?:k|s)\/?(?:[?#\s]|$)/i.test(value);
}

export function scrubSentryEvent<T>(event: T): T {
  const mutable = event as {
    request?: { url?: string; query_string?: unknown };
    transaction?: string;
    breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
    spans?: Array<{ description?: string }>;
  };

  const privateRequest =
    isPrivateShareRoute(mutable.request?.url || "") ||
    isPrivateShareRoute(mutable.transaction || "");
  if (mutable.request?.url)
    mutable.request.url = sanitizePrivateShareText(mutable.request.url);
  if (privateRequest && mutable.request)
    delete mutable.request.query_string;
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
  }

  return event;
}
