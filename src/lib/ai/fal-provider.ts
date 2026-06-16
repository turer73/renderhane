import { fal } from "@fal-ai/client";
import type { AIProvider, QueueSubmitResult, QueueStatusInfo, SubscribeResult } from "./types";

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
    });
    return { requestId: result.request_id };
  }

  async subscribe<T = unknown>(
    endpointId: string,
    input: Record<string, unknown>
  ): Promise<SubscribeResult<T>> {
    const result = await fal.subscribe(endpointId, { input });
    return { data: result.data as T };
  }

  async cancel(endpointId: string, requestId: string): Promise<void> {
    await fal.queue.cancel(endpointId, { requestId });
  }

  async status(endpointId: string, requestId: string): Promise<QueueStatusInfo> {
    return await fal.queue.status(endpointId, { requestId }) as unknown as QueueStatusInfo;
  }

  async result<T = unknown>(endpointId: string, requestId: string): Promise<T> {
    const result = await fal.queue.result(endpointId, { requestId });
    return result.data as T;
  }
}
