import type { FastifyInstance } from "fastify";
import type { ConversationRepository } from "../storage/conversation-repository";

export function registerConversationRoutes(
  app: FastifyInstance,
  conversations: ConversationRepository
) {
  // 会话接口保持普通 JSON，用于初始加载和刷新恢复。
  app.get("/api/conversations", async () => {
    return { conversations: await conversations.listConversations() };
  });

  app.get<{
    Params: { conversationId: string };
    Querystring: { limit?: string };
  }>("/api/conversations/:conversationId/messages", async (request, reply) => {
    const conversation = await conversations.getConversation(
      request.params.conversationId
    );

    if (!conversation) {
      reply.code(404);
      return { error: "Conversation not found" };
    }

    return {
      conversation,
      messages: await conversations.listMessages(conversation.id, {
        limit: parseMessageLimit(request.query.limit)
      })
    };
  });
}

function parseMessageLimit(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) return undefined;

  return Math.min(limit, 200);
}
