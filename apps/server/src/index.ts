import Fastify from "fastify";
import { createAgentRuntime } from "@qianwen-agent/agent-runtime";
import { createNoopTraceSink } from "@qianwen-agent/observability";
import type { AgentEvent } from "@qianwen-agent/shared";

export function buildServer() {
  const app = Fastify({ logger: true });
  const agentRuntime = createAgentRuntime();
  const traceSink = createNoopTraceSink();

  app.get("/health", async () => {
    const event: AgentEvent = { type: "phase", phase: "answering" };

    await traceSink.recordEvent({
      id: "stage0-health-event",
      runId: "stage0-health",
      kind: "agent_event",
      timestamp: new Date().toISOString(),
      agentEvent: event
    });

    return {
      ok: true,
      service: "qianwen-agent-server",
      imports: {
        agentRuntime: typeof agentRuntime.run === "function",
        observability: typeof traceSink.recordEvent === "function",
        shared: event.type
      }
    };
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";
  const app = buildServer();

  await app.listen({ port, host });
}
