export interface QueueSubmitResult {
  requestId: string;
}

export interface QueueStatusInfo {
  status: string;
  [key: string]: unknown;
}

export interface SubscribeResult<T = unknown> {
  data: T;
  requestId: string;
}

export interface SubscribeOptions {
  /** Persist the provider request ID before result polling starts. */
  onEnqueue?: (requestId: string) => void | Promise<void>;
  /** Optional signed completion webhook for recoverable synchronous calls. */
  webhookUrl?: string;
}

export interface AIProvider {
  submit(endpointId: string, input: Record<string, unknown>, webhookUrl?: string): Promise<QueueSubmitResult>;
  subscribe<T = unknown>(
    endpointId: string,
    input: Record<string, unknown>,
    options?: SubscribeOptions
  ): Promise<SubscribeResult<T>>;
  status(endpointId: string, requestId: string): Promise<QueueStatusInfo>;
  result<T = unknown>(endpointId: string, requestId: string): Promise<T>;
}
