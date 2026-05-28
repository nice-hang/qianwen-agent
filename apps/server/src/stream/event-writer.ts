import type { FastifyReply, FastifyRequest } from "fastify";
import type { AgentEvent } from "@qianwen-agent/shared";
import { encodeAgentEvent } from "@qianwen-agent/shared";

export function prepareEventStream(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const origin = request.headers.origin;

  // raw stream 会绕过 Fastify 普通响应处理，所以这里手动补 CORS。
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin"
  });
}

export function writeAgentEvent(reply: FastifyReply, event: AgentEvent): void {
  // 保持统一传输格式，方便 Web、移动端和后续 Debug 复用。
  reply.raw.write(encodeAgentEvent(event));
}
