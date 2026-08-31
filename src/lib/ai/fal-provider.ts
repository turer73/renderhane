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

function attachAcceptedRequestId(error: unknown, requestId: string): never {
  if (error && typeof error === "object") {
    try {
      Object.defineProperty(error, "requestId", {
        configurable: true,
        enumerable: true,
        value: requestId,
      });
      throw error;
    } catch (attachmentError) {
      if (attachmentError === error) throw error;
      // Frozen/non-extensible SDK errors cannot carry reconciliation metadata.
      // Fall through to a fresh wrapper while preserving classification fields.
    }
  }

  const wrapped = new Error(
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Provider queue polling failed"
  );
  if (error && typeof error === "object") {
    const providerError = error as { status?: unknown; body?: unknown };
    Object.assign(wrapped, {
      cause: error,
      ...(providerError.status !== undefined
        ? { status: providerError.status }
        : {}),
      ...(providerError.body !== undefined ? { body: providerError.body } : {}),
    });
  }
  Object.defineProperty(wrapped, "requestId", {
    configurable: true,
    enumerable: true,
    value: requestId,
  });
  throw wrapped;
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
      attachAcceptedRequestId(error, requestId);
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
