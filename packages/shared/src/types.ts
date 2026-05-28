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
    }
  | { type: "error"; message: string; code?: string; conversationId?: string };

export interface ChatStreamRequest {
  conversationId?: string;
  message: string;
}
