import type { AgentEvent } from "@qianwen-agent/shared";

export type TraceEventKind =
  | "run_started"
  | "agent_event"
  | "provider_request"
  | "provider_response"
  | "run_finished"
  | "run_failed";

export interface TraceEvent {
  id: string;
  runId: string;
  kind: TraceEventKind;
  timestamp: string;
  agentEvent?: AgentEvent;
  metadata?: Record<string, unknown>;
}

export interface ModelUsage {
  runId: string;
  provider: "qwen" | "unknown";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface TraceSink {
  recordEvent(event: TraceEvent): Promise<void>;
  recordModelUsage(usage: ModelUsage): Promise<void>;
}

export function createNoopTraceSink(): TraceSink {
  return {
    async recordEvent() {},
    async recordModelUsage() {}
  };
}
