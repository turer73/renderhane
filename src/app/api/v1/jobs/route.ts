import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { authenticateApiRequest } from "@/lib/api-keys/middleware";
import { submitJob } from "@/lib/jobs/submit";
import { submitJobSync } from "@/lib/jobs/submit-sync";
import { CreditError } from "@/lib/credits/engine";
import { TOOL_CREDITS, type ToolType } from "@/lib/fal/models";
import type { ModelTier } from "@/lib/fal/models";
import {
  orchestrateAplus,
  orchestrateTalkingAvatar,
  orchestrateSocialKit,
} from "@/lib/jobs/orchestrate";
import {
  claimSocialKitRequest,
  completeSocialKitRequest,
  hashSocialKitRequest,
  isValidIdempotencyKey,
  SocialKitSchemaUnavailableError,
} from "@/lib/jobs/social-kit-idempotency";

const VALID_TOOLS = Object.keys(TOOL_CREDITS);

/** Orchestration tools that spawn multiple jobs or have multi-step pipelines */
const ORCHESTRATION_TOOLS: ToolType[] = ["aplus", "social-kit", "talking-avatar"];

function hasPendingProviderReconciliation(result: {
  submissionState?: string;
  submissionStates?: Record<string, string>;
  reconciliationPending?: boolean;
}) {
  return (
    result.reconciliationPending === true ||
    (result.submissionState !== undefined &&
      result.submissionState !== "accepted") ||
    Object.values(result.submissionStates ?? {}).some(
      (state) => state !== "accepted"
    )
  );
}

function submissionResponse<T extends object>(result: T, successStatus = 201) {
  const pending = hasPendingProviderReconciliation(result);
  return NextResponse.json(result, {
    status: pending ? 202 : successStatus,
    ...(pending ? { headers: { "Retry-After": "30" } } : {}),
  });
}

/**
 * POST /api/v1/jobs — Submit a new job via public API.
 *
 * Headers:
 *   Authorization: Bearer rh_xxxxxxxxxxxx
 *   Idempotency-Key: client-generated-key      // required for social-kit
 *
 * Body (JSON):
 *   {
 *     "tool": "bg-remove",
 *     "imageUrl": "https://...",
 *     "imageUrls": ["https://...", ...],   // optional, for multi-image tools
 *     "tier": "standard",                   // optional: fast|standard|premium
 *     "prompt": "...",                       // optional, for scene/video/text tools
 *     "sync": true,                          // optional: wait for result (default: false)
 *     "script": "Hello world",               // optional: TTS text for talking-avatar
 *     "audioUrl": "https://...",              // optional: pre-made audio for talking-avatar
 *     "locale": "tr"                          // optional: tr|en for orchestration tools
 *   }
 *
 * Returns (simple async):  { "jobId": "uuid", "creditCost": 1, "estimatedTime": "~3s" }
 * Returns (simple sync):   { "jobId": "uuid", "creditCost": 1, "status": "completed", "output": { "url": "..." } }
 * Returns (orchestration):  { "jobIds": ["uuid", ...], "totalCost": 32, "estimatedTime": "~1min" }
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { tool, imageUrl, imageUrls, tier, prompt, sync, script, audioUrl, locale } = body;

    if (!tool || !VALID_TOOLS.includes(tool)) {
      return NextResponse.json(
        { error: `Invalid tool. Valid tools: ${VALID_TOOLS.join(", ")}` },
        { status: 400 }
      );
    }

    // ── Orchestration tools (multi-job pipelines) ────────────
    if (ORCHESTRATION_TOOLS.includes(tool as ToolType)) {
      return handleOrchestration(auth.userId, tool as ToolType, {
        imageUrl,
        script,
        audioUrl,
        locale,
        idempotencyKey: request.headers.get("idempotency-key"),
      });
    }

    // ── Standard single-job tools ────────────────────────────
    if (sync) {
      const result = await submitJobSync({
        userId: auth.userId,
        tool: tool as ToolType,
        tier: tier as ModelTier | undefined,
        imageUrl,
        imageUrls,
        prompt,
      });
      if (result.status === "processing") {
        return NextResponse.json(result, {
          status: 202,
          headers: { "Retry-After": "30" },
        });
      }
      return NextResponse.json(result, {
        status: result.status === "completed" ? 201 : 500,
      });
    }

    const result = await submitJob({
      userId: auth.userId,
      tool: tool as ToolType,
      tier: tier as ModelTier | undefined,
      imageUrl,
      imageUrls,
      prompt,
    });

    return submissionResponse(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/v1/jobs] submit error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Handle orchestration tools that require multi-step pipelines.
 */
async function handleOrchestration(
  userId: string,
  tool: ToolType,
  opts: {
    imageUrl?: string;
    script?: string;
    audioUrl?: string;
    locale?: string;
    idempotencyKey?: string | null;
  }
): Promise<NextResponse> {
  const { imageUrl, script, audioUrl, locale, idempotencyKey } = opts;

  // All orchestration tools require an image
  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json(
      { error: "imageUrl is required" },
      { status: 400 }
    );
  }

  try {
    switch (tool) {
      case "aplus": {
        const result = await orchestrateAplus({
          userId,
          imageUrl,
          locale,
        });
        return submissionResponse(result);
      }

      case "talking-avatar": {
        if (!script && !audioUrl) {
          return NextResponse.json(
            { error: "Either script (text) or audioUrl is required for talking-avatar" },
            { status: 400 }
          );
        }
        const result = await orchestrateTalkingAvatar({
          userId,
          imageUrl,
          script,
          audioUrl,
        });
        return submissionResponse(result);
      }

      case "social-kit": {
        if (process.env.SOCIAL_KIT_SUBMISSIONS_DISABLED === "true") {
          return NextResponse.json(
            { error: "social_kit_temporarily_unavailable" },
            { status: 503, headers: { "Retry-After": "300" } }
          );
        }

        const socialKitKey = idempotencyKey ?? null;
        if (!isValidIdempotencyKey(socialKitKey)) {
          return NextResponse.json(
            { error: "invalid_idempotency_key" },
            { status: 400 }
          );
        }

        const normalizedLocale = locale === "en" ? "en" : "tr";
        const sourceFingerprint = crypto
          .createHash("sha256")
          .update(imageUrl)
          .digest("hex");
        const requestHash = hashSocialKitRequest({
          sourceFingerprint,
          locale: normalizedLocale,
        });

        let claim;
        try {
          claim = await claimSocialKitRequest({
            userId,
            idempotencyKey: socialKitKey,
            requestHash,
          });
        } catch (error) {
          const retryAfter =
            error instanceof SocialKitSchemaUnavailableError ? "300" : "30";
          console.error("[api/v1/jobs] social-kit claim failed:", error);
          return NextResponse.json(
            { error: "social_kit_temporarily_unavailable" },
            {
              status: 503,
              headers: { "Retry-After": retryAfter },
            }
          );
        }

        if (claim.disposition === "conflict") {
          return NextResponse.json(
            { error: "idempotency_conflict" },
            { status: 409 }
          );
        }
        if (claim.disposition === "in_progress") {
          return NextResponse.json(
            {
              error: "request_in_progress",
              requestId: claim.requestId,
              idempotency: { outcome: "processing", keyAction: "retain" },
            },
            { status: 202, headers: { "Retry-After": "2" } }
          );
        }
        if (claim.disposition === "replay") {
          return NextResponse.json(claim.responseBody, {
            status: claim.responseStatus,
            headers: {
              ...claim.responseHeaders,
              "Idempotency-Replayed": "true",
            },
          });
        }

        const completeAndRespond = async (
          responseStatus: number,
          responseBody: Record<string, unknown>
        ) => {
          const durableBody = {
            ...responseBody,
            requestId: claim.requestId,
            idempotency: { outcome: "final", keyAction: "rotate" },
          };
          try {
            await completeSocialKitRequest({
              requestId: claim.requestId,
              userId,
              responseStatus,
              responseBody: durableBody,
            });
          } catch (error) {
            console.error(
              `[api/v1/jobs] social-kit response persistence failed for ${claim.requestId}:`,
              error
            );
            return NextResponse.json(
              {
                error: "social_kit_response_persistence_failed",
                requestId: claim.requestId,
                idempotency: { outcome: "indeterminate", keyAction: "retain" },
              },
              { status: 503, headers: { "Retry-After": "30" } }
            );
          }
          return NextResponse.json(durableBody, { status: responseStatus });
        };

        try {
          const result = await orchestrateSocialKit({
            userId,
            requestId: claim.requestId,
            imageUrl,
            locale: normalizedLocale,
          });
          if (hasPendingProviderReconciliation(result)) {
            return NextResponse.json(
              {
                ...result,
                requestId: claim.requestId,
                idempotency: {
                  outcome: "reconciliation_pending",
                  keyAction: "retain",
                },
              },
              { status: 202, headers: { "Retry-After": "30" } }
            );
          }
          return completeAndRespond(201, { ...result });
        } catch (error) {
          if (error instanceof CreditError && error.code === "INSUFFICIENT") {
            return completeAndRespond(402, { error: "insufficient_credits" });
          }
          console.error("[api/v1/jobs] social-kit orchestration indeterminate:", error);
          return NextResponse.json(
            {
              error: "social_kit_request_indeterminate",
              requestId: claim.requestId,
              idempotency: { outcome: "indeterminate", keyAction: "retain" },
            },
            { status: 503, headers: { "Retry-After": "30" } }
          );
        }
      }

      default:
        return NextResponse.json(
          { error: `Orchestration not implemented for tool: ${tool}` },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }
    const message = error instanceof Error ? error.message : "Processing failed";
    console.error(`[api/v1/jobs] ${tool} orchestration error:`, message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
