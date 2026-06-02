import type { AgentEvent, ChatMessage, SearchSource, TokenUsage } from "@qianwen-agent/shared";

export type RuntimeEnv = Record<string, string | undefined>;

export interface RunAgentOptions {
  env?: RuntimeEnv;
  fetchImpl?: typeof fetch;
  onEvent?: (event: AgentEvent) => Promise<void> | void;
}

export interface AgentRunInput {
  conversationId: string;
  messages: ChatMessage[];
  mode?: "fast" | "deep";
  conversationSummary?: string | null;
}

export interface AgentRunResult {
  usage?: TokenUsage;
  sources: SearchSource[];
}
