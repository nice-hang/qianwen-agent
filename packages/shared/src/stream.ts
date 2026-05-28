import type { AgentEvent } from "./types";

export interface SseLikeChunk {
  event?: string;
  data: string;
}

export function parseSseLikeStreamChunk(input: string): SseLikeChunk[] {
  // 解析一个或多个由空行分隔的完整 SSE-like block。
  return input
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const chunk: SseLikeChunk = { data: "" };

      for (const line of block.split(/\n/)) {
        if (line.startsWith("event:")) {
          chunk.event = line.slice("event:".length).trim();
        }

        if (line.startsWith("data:")) {
          const dataLine = line.slice("data:".length).trimStart();
          chunk.data = chunk.data ? `${chunk.data}\n${dataLine}` : dataLine;
        }
      }

      return chunk;
    })
    .filter((chunk) => chunk.data.length > 0);
}

export function encodeAgentEvent(event: AgentEvent): string {
  // 使用 text/event-stream framing，payload 仍保持 shared JSON。
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function decodeAgentEvent(chunk: SseLikeChunk): AgentEvent | null {
  try {
    const event = JSON.parse(chunk.data) as AgentEvent;
    return typeof event?.type === "string" ? event : null;
  } catch {
    return null;
  }
}
