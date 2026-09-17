import { fal } from "@fal-ai/client";
import type {
  AIProvider,
  QueueSubmitResult,
  QueueStatusInfo,
  SubscribeOptions,
  SubscribeResult,
} from "./types";

// Bound queue admission so a request whose acknowledgement was lost cannot
// remain eligible to start forever. Reconciliation waits far longer than this
// before refunding an unacknowledged submission attempt.
const QUEUE_START_TIMEOUT_SECONDS = 30 * 60;

function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function readProviderField(error: unknown, field: string): unknown {
  if (!isObjectLike(error)) return undefined;

  try {
    return Reflect.get(error, field);
  } catch {
    return undefined;
  }
}

function withAcceptedRequestId(error: unknown, requestId: string): unknown {
  if (isObjectLike(error)) {
    try {
      Object.defineProperty(error, "requestId", {
        configurable: true,
        enumerable: true,
        value: requestId,
      });
      if (readProviderField(error, "requestId") === requestId) {
        return error;
      }
    } catch {
      // Frozen/non-extensible SDK errors cannot carry reconciliation metadata.
      // Fall through to a fresh wrapper while preserving classification fields.
    }
  }

  const providerMessage = readProviderField(error, "message");
  const wrapped = new Error(
    typeof error === "string"
      ? error
      : typeof providerMessage === "string"
        ? providerMessage
        : "Provider queue polling failed"
  );
  Object.defineProperty(wrapped, "requestId", {
    configurable: true,
    enumerable: true,
    value: requestId,
  });
  Object.defineProperty(wrapped, "cause", {
    configurable: true,
    value: error,
    writable: true,
  });

  for (const field of ["status", "body"] as const) {
    const value = readProviderField(error, field);
    if (value !== undefined) {
      Object.defineProperty(wrapped, field, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    }
  }

  return wrapped;
}

export class FalProvider implements AIProvider {
  constructor() {
    fal.config({ credentials: process.env.FAL_KEY });
  }

  async submit(
    endpointId: string,
    input: Record<string, unknown>,
    webhookUrl?: string
  ): Promise<QueueSubmitResult> {
    const result = await fal.queue.submit(endpointId, {
      input,
      webhookUrl,
      startTimeout: QUEUE_START_TIMEOUT_SECONDS,
    });
    return { requestId: result.request_id };
  }

  async subscribe<T = unknown>(
    endpointId: string,
    input: Record<string, unknown>,
    options?: SubscribeOptions
  ): Promise<SubscribeResult<T>> {
    // Do not use fal.subscribe here: it internally performs submit -> poll ->
    // result but only returns the final result. A polling/result error after a
    // successful enqueue would otherwise discard the only reconciliation key.
    const queued = await fal.queue.submit(endpointId, {
      input,
      webhookUrl: options?.webhookUrl,
      startTimeout: QUEUE_START_TIMEOUT_SECONDS,
    });
    const requestId = queued.request_id;

    try {
      await options?.onEnqueue?.(requestId);
      await fal.queue.subscribeToStatus(endpointId, { requestId });
      const result = await fal.queue.result(endpointId, { requestId });
      return { data: result.data as T, requestId };
    } catch (error) {
      throw withAcceptedRequestId(error, requestId);
    }
  }

  async status(endpointId: string, requestId: string): Promise<QueueStatusInfo> {
    return await fal.queue.status(endpointId, { requestId }) as unknown as QueueStatusInfo;
  }

  async result<T = unknown>(endpointId: string, requestId: string): Promise<T> {
    const result = await fal.queue.result(endpointId, { requestId });
    return result.data as T;
  }
}
