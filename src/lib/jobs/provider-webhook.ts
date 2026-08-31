import crypto from "crypto";

export class ProviderReconciliationStateChangedError extends Error {
  constructor() {
    super("Provider reconciliation state changed before it could be persisted");
    this.name = "ProviderReconciliationStateChangedError";
  }
}

export function signWebhookPayload(data: string): string {
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) throw new Error("FAL_WEBHOOK_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function buildFalWebhookUrl(jobId: string, txId: string | null): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set");

  const signature = signWebhookPayload(`${jobId}:${txId || ""}`);
  return `${baseUrl}/api/webhook/fal?jobId=${jobId}${
    txId ? `&txId=${txId}` : ""
  }&sig=${signature}`;
}

export function getAcceptedProviderRequestId(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const requestId = (error as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && requestId.length > 0
    ? requestId
    : null;
}
