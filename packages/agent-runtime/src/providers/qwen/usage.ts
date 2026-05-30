import type { TokenUsage } from "@qianwen-agent/shared";
import type { QwenUsage } from "./types";

export function toTokenUsage(usage: QwenUsage, model: string): TokenUsage {
  return {
    provider: "qwen",
    model,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
    totalTokens: usage.total_tokens,
    raw: usage
  };
}
