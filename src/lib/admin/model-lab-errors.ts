// Locale-neutral transport semantics. Never show a server-language error as UI copy.
export function labResponseErrorKey(status: number, phase: "submit" | "status") {
  if (status === 401 || status === 403) return "accessDenied";
  if (status === 429) return "rateLimited";
  if (status === 413) return "tooLarge";
  if (status === 400 || status === 422) return "invalidRequest";
  if (status === 404) return "runNotFound";
  if (status === 409) return "runConflict";
  if (status === 503) return "configurationMissing";
  return phase === "submit" ? "uncertain" : "statusReadError";
}

const RUN_ERROR_CODES = [
  "submission_uncertain",
  "submission_unacknowledged",
  "receipt_invalid",
  "provider_failed",
  "manually_resolved",
] as const;

/** Message key for a run's stored error code; unknown codes get a generic message. */
export function labRunErrorKey(code: string | null): `runErrors.${(typeof RUN_ERROR_CODES)[number] | "other"}` | null {
  if (!code) return null;
  return `runErrors.${(RUN_ERROR_CODES as readonly string[]).includes(code) ? (code as (typeof RUN_ERROR_CODES)[number]) : "other"}`;
}

export class LocalizedLabError extends Error {}
