export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "aborted"
  | "failed";

export interface Attachment {
  id: string;
  type: "image" | "file";
  mimeType: string;
  filename: string;
  size: number;
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  status: MessageStatus;
  content: string;
  attachments?: Attachment[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  snippet?: string;
}

export type AgentEvent =
  | { type: "phase"; phase: "thinking" | "answering" }
  | { type: "reasoning_delta"; text: string }
  | { type: "thinking_summary"; text: string }
  | { type: "sources_found"; count: number; sources: Source[] }
  | { type: "answer_delta"; text: string }
  | { type: "done"; runId: string; messageId: string }
  | { type: "error"; message: string; code?: string };

export interface ChatStreamRequest {
  conversationId?: string;
  message: string;
  attachmentIds?: string[];
  mode?: "fast" | "deep";
  search?: "auto" | "off" | "force";
}
