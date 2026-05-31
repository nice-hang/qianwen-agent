import type {
  AgentEvent,
  AgentRunSummary,
  AgentTraceEvent,
  ChatAttachment,
  ChatMessage,
  ChatStreamRequest,
  UploadImageRequest,
  Conversation,
  ModelUsage
} from "./types";
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

export interface UploadImageResponse {
  attachment: ChatAttachment;
}

export interface RunsResponse {
  runs: AgentRunSummary[];
}

export interface RunDetailResponse {
  run: AgentRunSummary;
  events: AgentTraceEvent[];
  usage?: ModelUsage;
}

export interface StreamChatOptions {
  onEvent: (event: AgentEvent) => Promise<void> | void;
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

    async listRuns(): Promise<RunsResponse> {
      const response = await fetchImpl(`${baseUrl}/debug/runs`);
      if (!response.ok) {
        throw new Error(`List runs failed: ${response.status}`);
      }
      return response.json() as Promise<RunsResponse>;
    },

    async getRun(runId: string): Promise<RunDetailResponse> {
      const response = await fetchImpl(`${baseUrl}/debug/runs/${runId}`);
      if (!response.ok) {
        throw new Error(`Get run failed: ${response.status}`);
      }
      return response.json() as Promise<RunDetailResponse>;
    },

    async uploadImage(request: UploadImageRequest): Promise<UploadImageResponse> {
      const response = await fetchImpl(`${baseUrl}/api/attachments/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`Upload image failed: ${response.status}`);
      }

      return response.json() as Promise<UploadImageResponse>;
    },

    async streamChat(
      request: ChatStreamRequest,
      streamOptions: StreamChatOptions
    ): Promise<void> {
      // POST stream 允许客户端发送 JSON，同时继续接收增量事件。
      const response = await fetchImpl(`${baseUrl}/api/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`Chat stream failed: ${response.status}`);
      }

      if (!response.body) {
        for (const chunk of parseSseLikeStreamChunk(await response.text())) {
          const event = decodeAgentEvent(chunk);
          if (event) await streamOptions.onEvent(event);
        }
        return;
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
          if (event) await streamOptions.onEvent(event);
        }
      }

      for (const chunk of parseSseLikeStreamChunk(buffer)) {
        const event = decodeAgentEvent(chunk);
        if (event) await streamOptions.onEvent(event);
      }
    }
  };
}
