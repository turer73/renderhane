// Next.js instrumentation hook — runs once when the server boots.
// Sentry uses this to register itself for both nodejs and edge runtimes.
// When SENTRY_DSN is unset the per-runtime config files no-op, so the only
// cost in DSN-less environments is loading two tiny modules.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
