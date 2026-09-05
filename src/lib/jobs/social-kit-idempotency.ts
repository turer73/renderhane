import "server-only";
import crypto from "crypto";
import { CreditError, type CreditReservationItem } from "@/lib/credits/engine";
import { createAdminClient } from "@/lib/supabase/admin";

export type SocialKitClaim =
  | { disposition: "acquired"; requestId: string }
  | { disposition: "in_progress"; requestId: string }
  | { disposition: "conflict"; requestId: string }
  | {
      disposition: "replay";
      requestId: string;
      responseStatus: number;
      responseBody: Record<string, unknown>;
      responseHeaders: Record<string, string>;
    };

interface ClaimRow {
  request_id: string;
  disposition: SocialKitClaim["disposition"];
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  response_headers: Record<string, unknown> | null;
}

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const SCHEMA_ERROR_CODES = new Set(["PGRST202", "42883", "42P01"]);

export class SocialKitSchemaUnavailableError extends Error {
  constructor(message = "Social Kit database capability is unavailable") {
    super(message);
    this.name = "SocialKitSchemaUnavailableError";
  }
}

export function isValidIdempotencyKey(value: string | null): value is string {
  return Boolean(
    value &&
      value.length >= 8 &&
      value.length <= 128 &&
      /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

export function isValidSourceFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function hashSocialKitRequest(input: {
  sourceFingerprint: string;
  projectId?: string;
  locale: "tr" | "en";
}): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: "social-kit:v2",
        sourceFingerprint: input.sourceFingerprint,
        projectId: input.projectId ?? null,
        locale: input.locale,
      })
    )
    .digest("hex");
}

function isSchemaError(error: SupabaseErrorLike | null): boolean {
  if (!error) return false;
  if (error.code && SCHEMA_ERROR_CODES.has(error.code)) return true;

  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    message.includes("schema cache") ||
    message.includes("social_kit_schema_incomplete") ||
    message.includes("claim_social_kit_request") ||
    message.includes("reserve_social_kit_request_bundle") ||
    message.includes("complete_social_kit_request") ||
    message.includes("reserve_credit_bundle")
  );
}

function throwRpcError(operation: string, error: SupabaseErrorLike): never {
  if (isSchemaError(error)) {
    throw new SocialKitSchemaUnavailableError(
      `Social Kit database capability is unavailable: ${error.message ?? operation}`
    );
  }
  throw new Error(`${operation}: ${error.message ?? "unknown database error"}`);
}

export async function claimSocialKitRequest(input: {
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<SocialKitClaim> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_social_kit_request", {
    p_user_id: input.userId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
  });

  if (error) throwRpcError("Failed to claim Social Kit request", error);

  const row = Array.isArray(data) ? (data[0] as ClaimRow | undefined) : undefined;
  if (!row?.request_id || !row.disposition) {
    throw new Error("Failed to claim Social Kit request: invalid database response");
  }

  if (row.disposition === "replay") {
    if (
      typeof row.response_status !== "number" ||
      !row.response_body ||
      typeof row.response_body !== "object" ||
      Array.isArray(row.response_body)
    ) {
      throw new Error("Failed to replay Social Kit request: invalid stored response");
    }
    const responseHeaders = row.response_headers ?? {};
    if (
      typeof responseHeaders !== "object" ||
      Array.isArray(responseHeaders) ||
      Object.values(responseHeaders).some((value) => typeof value !== "string")
    ) {
      throw new Error("Failed to replay Social Kit request: invalid stored headers");
    }
    return {
      disposition: "replay",
      requestId: row.request_id,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      responseHeaders: responseHeaders as Record<string, string>,
    };
  }

  return { disposition: row.disposition, requestId: row.request_id };
}

export async function reserveSocialKitRequestBundle(input: {
  requestId: string;
  userId: string;
  items: CreditReservationItem[];
}): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "reserve_social_kit_request_bundle",
    {
      p_request_id: input.requestId,
      p_user_id: input.userId,
      p_amounts: input.items.map((item) => item.amount),
      p_descriptions: input.items.map((item) => item.description),
    }
  );

  if (error) {
    if (error.message?.includes("insufficient_credits")) {
      throw new CreditError("Insufficient credits", "INSUFFICIENT");
    }
    if (error.message?.includes("user_not_found")) {
      throw new CreditError("User not found", "NOT_FOUND");
    }
    throwRpcError("Failed to reserve Social Kit request bundle", error);
  }

  if (!Array.isArray(data) || data.length !== input.items.length) {
    throw new Error(
      "Failed to reserve Social Kit request bundle: invalid transaction list"
    );
  }

  return data as string[];
}

export async function completeSocialKitRequest(input: {
  requestId: string;
  userId: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  responseHeaders?: Record<string, string>;
}): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("complete_social_kit_request", {
    p_request_id: input.requestId,
    p_user_id: input.userId,
    p_response_status: input.responseStatus,
    p_response_body: input.responseBody,
    p_response_headers: input.responseHeaders ?? {},
  });

  if (error) throwRpcError("Failed to complete Social Kit request", error);
  if (data !== true) {
    throw new Error(
      "Failed to complete Social Kit request: response was not persisted"
    );
  }
}
