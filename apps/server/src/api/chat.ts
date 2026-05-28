import type { FastifyInstance } from "fastify";
import type { ChatMessage, ChatStreamRequest } from "@qianwen-agent/shared";
import type { runAgent } from "@qianwen-agent/agent-runtime";
import type { ConversationRepository } from "../storage/conversation-repository";
import { prepareEventStream, writeAgentEvent } from "../stream/event-writer";

type RunAgent = typeof runAgent;

export function registerChatRoutes(
  app: FastifyInstance,
  options: {
    runAgent: RunAgent;
    conversations: ConversationRepository;
  }
) {
  // 聊天使用 POST + text/event-stream，既能传 JSON body，也能流式返回。
  app.post<{
    Body: ChatStreamRequest;
  }>("/api/chat/stream", async (request, reply) => {
    prepareEventStream(request, reply);
    let activeConversationId: string | undefined;

    const messageText = request.body?.message?.trim();
    if (!messageText) {
      writeAgentEvent(reply, {
        type: "error",
        message: "Message is required.",
        code: "message_required"
      });
      reply.raw.end();
      return reply;
    }

    try {
      // 有会话就复用；没有会话时，用第一条用户消息创建新会话。
      const conversation = request.body.conversationId
        ? await options.conversations.getConversation(request.body.conversationId)
        : await options.conversations.createConversation(
            normalizeConversationTitle(messageText)
          );

      if (!conversation) {
        writeAgentEvent(reply, {
          type: "error",
          message: "Conversation not found.",
          code: "conversation_not_found"
        });
        reply.raw.end();
        return reply;
      }
      activeConversationId = conversation.id;

      // 先保存用户消息，这样即使模型失败，刷新后也能恢复这轮输入。
      await options.conversations.addMessage({
        conversationId: conversation.id,
        role: "user",
        content: messageText
      });

      const messages = await options.conversations.listMessages(conversation.id);
      const assistantParts: string[] = [];
      let assistantMessage: ChatMessage | null = null;

      // Agent 返回异步事件流；每个事件都会原样转发给前端。
      for await (const event of options.runAgent({
        conversationId: conversation.id,
        messages
      })) {
        if (event.type === "answer_delta") {
          assistantParts.push(event.text);
          writeAgentEvent(reply, event);
          continue;
        }

        if (event.type === "done") {
          // Runtime 不知道数据库 id，所以由 Server 保存后替换 messageId。
          const assistantContent = assistantParts.join("");
          assistantMessage = await options.conversations.addMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: assistantContent,
            status: assistantContent ? "completed" : "failed"
          });
          await options.conversations.touchConversation(conversation.id);

          writeAgentEvent(reply, {
            type: "done",
            runId: event.runId,
            messageId: assistantMessage.id,
            conversationId: conversation.id
          });
          continue;
        }

        writeAgentEvent(reply, event);
      }

      // 防御性兜底：处理 provider 没有显式 done 但已经有回答内容的情况。
      if (!assistantMessage && assistantParts.length > 0) {
        assistantMessage = await options.conversations.addMessage({
          conversationId: conversation.id,
          role: "assistant",
          content: assistantParts.join("")
        });
        await options.conversations.touchConversation(conversation.id);
        writeAgentEvent(reply, {
          type: "done",
          runId: crypto.randomUUID(),
          messageId: assistantMessage.id,
          conversationId: conversation.id
        });
      }
    } catch (error) {
      request.log.error(error);
      // 尽量带上 conversationId，方便前端重新拉取已保存的用户消息。
      writeAgentEvent(reply, {
        type: "error",
        message: error instanceof Error ? error.message : "Chat stream failed.",
        code: "chat_stream_failed",
        conversationId: activeConversationId
      });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
}

// Stage 1 标题保持确定性：直接取首行，不额外调用模型生成。
function normalizeConversationTitle(title: string): string {
  const firstLine = title.trim().split(/\r?\n/)[0] ?? "";
  const normalized = firstLine.replace(/\s+/g, " ").trim();

  if (!normalized) return "New chat";
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
}
