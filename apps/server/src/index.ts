import Fastify from "fastify";
import cors from "@fastify/cors";
import { runAgent } from "@qianwen-agent/agent-runtime";
import { registerChatRoutes } from "./api/chat";
import { registerConversationRoutes } from "./api/conversations";
import { loadConfig } from "./config/env";
import { createConversationRepository } from "./storage/conversation-repository";
import { prisma } from "./storage/prisma";

export function buildServer() {
  const app = Fastify({ logger: true });
  const conversationRepository = createConversationRepository(prisma);

  void app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "qianwen-agent-server"
  }));

  registerConversationRoutes(app, conversationRepository);
  registerChatRoutes(app, {
    runAgent,
    conversations: conversationRepository
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port, host } = loadConfig();
  const app = buildServer();

  await app.listen({ port, host });
}
