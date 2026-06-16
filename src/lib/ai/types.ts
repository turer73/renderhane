export interface QueueSubmitResult {
  requestId: string;
}

export interface QueueStatusInfo {
  status: string;
  [key: string]: unknown;
}

export interface SubscribeResult<T = unknown> {
  data: T;
}

export interface AIProvider {
  submit(endpointId: string, input: Record<string, unknown>, webhookUrl?: string): Promise<QueueSubmitResult>;
  subscribe<T = unknown>(endpointId: string, input: Record<string, unknown>): Promise<SubscribeResult<T>>;
  cancel(endpointId: string, requestId: string): Promise<void>;
  status(endpointId: string, requestId: string): Promise<QueueStatusInfo>;
  result<T = unknown>(endpointId: string, requestId: string): Promise<T>;
}
