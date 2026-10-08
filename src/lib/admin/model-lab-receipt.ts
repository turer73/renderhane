import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const DOMAIN = "renderhane:model-lab-receipt:v1";
const MAX_RECEIPT_LENGTH = 4096;
const TTL_MS = 24 * 60 * 60 * 1000;

export type ModelLabReceipt = Readonly<{
  userId: string;
  modelKey: string;
  endpoint: string;
  requestId: string;
  issuedAt: number;
  expiresAt: number;
}>;

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${DOMAIN}.${payload}`, "utf8").digest();
}

function hasOnlyReceiptFields(value: Record<string, unknown>): value is ModelLabReceipt {
  const expected = ["userId", "modelKey", "endpoint", "requestId", "issuedAt", "expiresAt"];
  if (Object.keys(value).length !== expected.length || !expected.every((key) => Object.hasOwn(value, key))) return false;
  const issuedAt = value.issuedAt;
  const expiresAt = value.expiresAt;
  return typeof value.userId === "string" && value.userId.length > 0 && value.userId.length <= 256 &&
    typeof value.modelKey === "string" && value.modelKey.length > 0 && value.modelKey.length <= 256 &&
    typeof value.endpoint === "string" && value.endpoint.length > 0 && value.endpoint.length <= 512 &&
    typeof value.requestId === "string" && value.requestId.length > 0 && value.requestId.length <= 512 &&
    typeof issuedAt === "number" && typeof expiresAt === "number" &&
    Number.isSafeInteger(issuedAt) && Number.isSafeInteger(expiresAt) &&
    expiresAt === issuedAt + TTL_MS;
}

export function issueModelLabReceipt(
  fields: Omit<ModelLabReceipt, "issuedAt" | "expiresAt">,
  secret: string,
  now = Date.now()
): string {
  if (!secret || !Number.isSafeInteger(now)) throw new Error("receipt_secret_unavailable");
  const claims: ModelLabReceipt = { ...fields, issuedAt: now, expiresAt: now + TTL_MS };
  if (!hasOnlyReceiptFields(claims)) throw new Error("invalid_receipt_claims");
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${encode(sign(payload, secret))}`;
}

export function verifyModelLabReceipt(
  receipt: unknown,
  secret: string,
  now = Date.now()
): ModelLabReceipt | null {
  if (typeof receipt !== "string" || !secret || receipt.length === 0 || receipt.length > MAX_RECEIPT_LENGTH || !Number.isSafeInteger(now)) return null;
  const parts = receipt.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  let provided: Buffer;
  const expected = sign(parts[0], secret);
  try { provided = Buffer.from(parts[1], "base64url"); } catch { return null; }
  if (encode(provided) !== parts[1] || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return null; }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) || Object.getPrototypeOf(decoded) !== Object.prototype || !hasOnlyReceiptFields(decoded as Record<string, unknown>)) return null;
  const claims = decoded as ModelLabReceipt;
  if (claims.issuedAt > now || claims.expiresAt <= now) return null;
  return claims;
}

export const MODEL_LAB_RECEIPT_TTL_MS = TTL_MS;
