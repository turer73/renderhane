import { createClient } from "@/lib/supabase/server";
import { orchestrateSocialKit } from "@/lib/jobs/orchestrate";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { validateImageUrl } from "@/lib/jobs/api-helpers";
import {
  claimSocialKitRequest,
  completeSocialKitRequest,
  hashSocialKitRequest,
  isValidIdempotencyKey,
  isValidSourceFingerprint,
  SocialKitSchemaUnavailableError,
} from "@/lib/jobs/social-kit-idempotency";

// Social Kit submits 5 parallel jobs — needs extended timeout
export const maxDuration = 120;

const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notClaimed = { outcome: "not_claimed", keyAction: "rotate" } as const;
const retainUnknown = { outcome: "indeterminate", keyAction: "retain" } as const;

export async function POST(request: NextRequest) {
  if (process.env.SOCIAL_KIT_SUBMISSIONS_DISABLED === "true") {
    return NextResponse.json(
      {
        error: "social_kit_temporarily_unavailable",
        idempotency: retainUnknown,
      },
      { status: 503, headers: { "Retry-After": "300" } }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", idempotency: notClaimed },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", idempotency: notClaimed },
      { status: 400 }
    );
  }

  const { imageUrl, sourceFingerprint } = body;
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const idempotencyKey = request.headers.get("idempotency-key");

  const urlError = validateImageUrl(imageUrl);
  if (urlError) {
    return NextResponse.json(
      { error: urlError, idempotency: notClaimed },
      { status: 400 }
    );
  }
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return NextResponse.json(
      { error: "invalid_idempotency_key", idempotency: notClaimed },
      { status: 400 }
    );
  }
  if (!isValidSourceFingerprint(sourceFingerprint)) {
    return NextResponse.json(
      { error: "invalid_source_fingerprint", idempotency: notClaimed },
      { status: 400 }
    );
  }

  if (projectId) {
    if (!PROJECT_ID_PATTERN.test(projectId)) {
      return NextResponse.json(
        { error: "invalid_project_id", idempotency: notClaimed },
        { status: 400 }
      );
    }

    const { data: ownedProject, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) {
      console.error("[submit-social-kit] project ownership lookup failed:", projectError);
      return NextResponse.json(
        {
          error: "social_kit_temporarily_unavailable",
          idempotency: retainUnknown,
        },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }
    if (!ownedProject) {
      return NextResponse.json(
        { error: "project_not_found", idempotency: notClaimed },
        { status: 404 }
      );
    }
  }

  // Detect locale
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", user.id)
    .single();
  if (profileError) {
    console.error("[submit-social-kit] profile lookup failed:", profileError);
    return NextResponse.json(
      {
        error: "social_kit_temporarily_unavailable",
        idempotency: retainUnknown,
      },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }
  const locale = (profile?.locale || "tr") as "tr" | "en";
  const requestHash = hashSocialKitRequest({
    sourceFingerprint,
    projectId,
    locale,
  });

  let claim;
  try {
    claim = await claimSocialKitRequest({
      userId: user.id,
      idempotencyKey,
      requestHash,
    });
  } catch (error) {
    if (error instanceof SocialKitSchemaUnavailableError) {
      console.error("[submit-social-kit] database capability missing:", error);
      return NextResponse.json(
        {
          error: "social_kit_temporarily_unavailable",
          idempotency: retainUnknown,
        },
        { status: 503, headers: { "Retry-After": "300" } }
      );
    }
    console.error("[submit-social-kit] idempotency claim failed:", error);
    return NextResponse.json(
      {
        error: "social_kit_temporarily_unavailable",
        idempotency: retainUnknown,
      },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }

  if (claim.disposition === "conflict") {
    return NextResponse.json(
      { error: "idempotency_conflict", idempotency: notClaimed },
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
    responseBody: Record<string, unknown>,
    headers?: Record<string, string>,
    idempotency: { outcome: string; keyAction: "rotate" | "retain" } = {
      outcome: "final",
      keyAction: "rotate",
    }
  ) => {
    const durableBody = {
      ...responseBody,
      requestId: claim.requestId,
      idempotency,
    };
    try {
      await completeSocialKitRequest({
        requestId: claim.requestId,
        userId: user.id,
        responseStatus,
        responseBody: durableBody,
        responseHeaders: headers,
      });
    } catch (completionError) {
      console.error(
        `[submit-social-kit] Failed to persist response for ${claim.requestId}:`,
        completionError
      );
      return NextResponse.json(
        {
          error: "social_kit_response_persistence_failed",
          requestId: claim.requestId,
          idempotency: retainUnknown,
        },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }

    return NextResponse.json(durableBody, { status: responseStatus, headers });
  };

  // Replays bypass the limiter; only the request that won the durable claim
  // consumes submission capacity.
  const rl = await rateLimit(`job-submit-social:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return completeAndRespond(
      429,
      { error: "Too many requests. Please wait." },
      {
        "Retry-After": String(
          Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
        ),
      }
    );
  }

  try {
    const result = await orchestrateSocialKit({
      userId: user.id,
      projectId,
      imageUrl: imageUrl as string,
      locale,
      requestId: claim.requestId,
    });

    const reconciliationPending =
      result.reconciliationPending === true ||
      Object.values(result.submissionStates ?? {}).some(
        (state) => state !== "accepted"
      );

    if (reconciliationPending) {
      // Do not terminalize the durable claim: the processing-only partial
      // unique index is the semantic double-charge guard. A second key must
      // remain blocked until every child reservation is reconciled.
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

    return completeAndRespond(200, { ...result });
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return completeAndRespond(402, { error: "insufficient_credits" });
    }
    if (error instanceof SocialKitSchemaUnavailableError) {
      return completeAndRespond(
        503,
        { error: "social_kit_temporarily_unavailable" },
        { "Retry-After": "300" }
      );
    }

    const message = error instanceof Error ? error.message : "Social Kit submission failed";
    console.error("[submit-social-kit] orchestration error:", message, error);
    // Orchestration may already have reserved credits or submitted a subset of
    // provider jobs. Keep the durable request processing until reconciliation
    // can prove every reservation was refunded; terminalizing here would let a
    // new key charge the same semantic request again.
    return NextResponse.json(
      {
        error: "social_kit_request_indeterminate",
        requestId: claim.requestId,
        idempotency: retainUnknown,
      },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }
}
