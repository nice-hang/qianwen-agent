import Fastify from "fastify";
import cors from "@fastify/cors";
import { runAgent } from "@qianwen-agent/agent-runtime";
import { registerChatRoutes } from "./api/chat";
import { registerAttachmentRoutes } from "./api/attachments";
import { registerConversationRoutes } from "./api/conversations";
import { registerDebugRoutes } from "./api/debug";
import { loadConfig } from "./config/env";
import { createConversationRepository } from "./storage/conversation-repository";
import { prisma } from "./storage/prisma";
import { createTraceRepository } from "./storage/trace-repository";

const JSON_BODY_LIMIT_BYTES = 20 * 1024 * 1024;

export function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: JSON_BODY_LIMIT_BYTES
  });
  const conversationRepository = createConversationRepository(prisma);
  const traceRepository = createTraceRepository(prisma);

  void app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "qianwen-agent-server"
  }));

  registerAttachmentRoutes(app, conversationRepository);
  registerConversationRoutes(app, conversationRepository);
  registerChatRoutes(app, {
    runAgent,
    conversations: conversationRepository,
    traces: traceRepository
  });
  registerDebugRoutes(app, traceRepository);

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startServer();
}

async function startServer(): Promise<void> {
  const { port, host } = loadConfig();
  const app = buildServer();

  await app.listen({ port, host });
}
