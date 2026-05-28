import type { AgentEvent, ChatStreamRequest } from "./types";
import { decodeAgentEvent, parseSseLikeStreamChunk } from "./stream";

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async health(): Promise<HealthResponse> {
      const response = await fetchImpl(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return response.json() as Promise<HealthResponse>;
    },

    async *streamChat(request: ChatStreamRequest): AsyncIterable<AgentEvent> {
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
