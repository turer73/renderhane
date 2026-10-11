import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Remesh runs a paid fal request without a job row, so the status route has no
 * owner to check. The submit route hands the caller a token bound to their user
 * id and the fal request id; status only answers for a matching token.
 */
function secret(): string {
  const value = process.env.FAL_WEBHOOK_SECRET;
  if (!value) throw new Error("FAL_WEBHOOK_SECRET is not configured");
  return value;
}

function sign(userId: string, requestId: string): Buffer {
  return createHmac("sha256", secret()).update(`remesh:${userId}:${requestId}`, "utf8").digest();
}

export function createRemeshToken(userId: string, requestId: string): string {
  return sign(userId, requestId).toString("base64url");
}

export function verifyRemeshToken(userId: string, requestId: string, token: string | null): boolean {
  if (!token) return false;
  const provided = Buffer.from(token, "base64url");
  const expected = sign(userId, requestId);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
