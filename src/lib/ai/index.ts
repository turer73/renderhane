import { FalProvider } from "./fal-provider";
import type { AIProvider } from "./types";

export type {
  AIProvider,
  QueueSubmitResult,
  QueueStatusInfo,
  SubscribeOptions,
  SubscribeResult,
} from "./types";

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!_provider) {
    _provider = new FalProvider();
  }
  return _provider;
}
