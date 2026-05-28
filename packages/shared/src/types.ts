export type MessageRole = "user" | "assistant";

export type MessageStatus = "streaming" | "completed" | "failed";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  status: MessageStatus;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentEvent =
  | { type: "answer_delta"; text: string }
  | {
      type: "done";
      runId: string;
      messageId?: string;
      conversationId?: string;
      usage?: TokenUsage;
    }
  | { type: "error"; message: string; code?: string; conversationId?: string };

export interface ChatStreamRequest {
  conversationId?: string;
  message: string;
}

export interface AgentRunSummary {
  id: string;
  conversationId?: string | null;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  ttfeMs?: number | null;
  ttfaMs?: number | null;
  ttcMs?: number | null;
  providerMs?: number | null;
}

export interface AgentTraceEvent {
  id: string;
  runId: string;
  type: string;
  at: string;
  offsetMs: number;
  message?: string | null;
  data?: unknown;
}

export interface TokenUsage {
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
  raw?: unknown;
}

export interface ModelUsage extends TokenUsage {
  id: string;
  runId: string;
}
