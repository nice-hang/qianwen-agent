import type { ChatMessage } from "@qianwen-agent/shared";

export type RuntimeEnv = Record<string, string | undefined>;

export interface RunAgentOptions {
  env?: RuntimeEnv;
  fetchImpl?: typeof fetch;
}

export interface AgentRunInput {
  conversationId: string;
  messages: ChatMessage[];
  mode?: "fast" | "deep";
}
