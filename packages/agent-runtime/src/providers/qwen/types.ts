import type { TokenUsage } from "@qianwen-agent/shared";

export interface QwenStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: QwenToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: QwenUsage | null;
}

export interface QwenToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface QwenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export type QwenTextStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | {
      type: "tool_call_delta";
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }
  | { type: "finish"; reason: string }
  | { type: "usage"; usage: TokenUsage };

export interface QwenToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
