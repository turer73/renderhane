import "server-only";
import crypto from "crypto";

/**
 * Generate a per-job HMAC token derived from the global webhook secret + jobId.
 * This way the global secret never appears in any URL.
 */
export function signWebhookToken(jobId: string): string {
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing FAL_WEBHOOK_SECRET");

  return crypto
    .createHmac("sha256", secret)
    .update(jobId)
    .digest("hex");
}

/**
 * Verify a per-job HMAC token using timing-safe comparison.
 */
export function verifyWebhookToken(jobId: string, token: string): boolean {
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret || !token) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(jobId)
    .digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(token, "hex");
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}
