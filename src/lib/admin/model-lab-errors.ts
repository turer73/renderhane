// Locale-neutral transport semantics. Never show a server-language error as UI copy.
export function labResponseErrorKey(status: number, phase: "submit" | "status") {
  if (status === 401 || status === 403) return "accessDenied";
  if (status === 429) return "rateLimited";
  if (status === 413) return "tooLarge";
  if (status === 400 || status === 422) return "invalidRequest";
  if (status === 503) return "configurationMissing";
  return phase === "submit" ? "uncertain" : "statusReadError";
}

export class LocalizedLabError extends Error {}
