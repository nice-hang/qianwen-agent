import type { AgentEvent, ChatMessage, ChatStreamRequest, Conversation } from "./types";
import { decodeAgentEvent, parseSseLikeStreamChunk } from "./stream";

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface MessagesResponse {
  conversation: Conversation;
  messages: ChatMessage[];
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async listConversations(): Promise<ConversationsResponse> {
      const response = await fetchImpl(`${baseUrl}/api/conversations`);
      if (!response.ok) {
        throw new Error(`List conversations failed: ${response.status}`);
      }
      return response.json() as Promise<ConversationsResponse>;
    },

    async listMessages(conversationId: string): Promise<MessagesResponse> {
      const response = await fetchImpl(
        `${baseUrl}/api/conversations/${conversationId}/messages`
      );

      if (!response.ok) {
        throw new Error(`List messages failed: ${response.status}`);
      }

      return response.json() as Promise<MessagesResponse>;
    },

    async *streamChat(request: ChatStreamRequest): AsyncIterable<AgentEvent> {
      // POST stream 允许客户端发送 JSON，同时继续接收增量事件。
      const response = await fetchImpl(`${baseUrl}/api/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // 只解析完整 SSE-like block，末尾不完整部分继续留在 buffer。
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const boundary = buffer.lastIndexOf("\n\n");
        if (boundary === -1) continue;

        const ready = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        for (const chunk of parseSseLikeStreamChunk(ready)) {
          const event = decodeAgentEvent(chunk);
          if (event) yield event;
        }
      }

      for (const chunk of parseSseLikeStreamChunk(buffer)) {
        const event = decodeAgentEvent(chunk);
        if (event) yield event;
      }
    }
  };
}
