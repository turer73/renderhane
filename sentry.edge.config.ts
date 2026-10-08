import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/lib/sentry-privacy";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    debug: false,
  });
}
