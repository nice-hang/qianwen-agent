export type MessageRole = "user" | "assistant";

export type MessageStatus = "streaming" | "completed" | "failed";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  status: MessageStatus;
  content: string;
  reasoningContent?: string | null;
  sources?: SearchSource[];
  attachments?: ChatAttachment[];
  activity?: string;
  createdAt: string;
}

export interface ChatAttachment {
  id: string;
  conversationId?: string | null;
  messageId?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind?: "image" | "file";
  parseStatus?: "uploaded" | "parsing" | "ready" | "error";
  parseError?: string | null;
  chunkCount?: number | null;
  parsedAt?: string | null;
  url: string;
  imageDataUrl?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  summary?: string | null;
  summaryMessageId?: string | null;
  summaryUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentEvent =
  | {
      type: "provider_request";
      requestId: string;
      iteration: number;
      model: string;
      mode: "fast" | "deep";
      messages: unknown[];
      tools: unknown[];
    }
  | {
      type: "provider_response";
      requestId: string;
      iteration: number;
      finishReason?: string;
      usage?: TokenUsage;
      durationMs: number;
    }
  | {
      type: "tool_call_started";
      toolName: string;
      toolCallId: string;
      input?: unknown;
    }
  | {
      type: "tool_call_done";
      toolName: string;
      toolCallId: string;
      output?: unknown;
      rawOutput?: unknown;
    }
  | {
      type: "search_results";
      toolCallId: string;
      query: string;
      sources: SearchSource[];
    }
  | { type: "reasoning_delta"; text: string }
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
  mode?: "fast" | "deep";
  attachmentIds?: string[];
}

export interface UploadImageRequest {
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface UploadFileRequest {
  conversationId?: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface SearchSource {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  siteName?: string;
  publishedAt?: string;
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
  ttfrMs?: number | null;
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
