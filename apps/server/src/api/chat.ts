import type { FastifyInstance } from "fastify";
import type { ChatMessage, ChatStreamRequest } from "@qianwen-agent/shared";
import type { runAgent } from "@qianwen-agent/agent-runtime";
import type { ConversationRepository } from "../storage/conversation-repository";
import type { TraceRepository } from "../storage/trace-repository";
import { prepareEventStream, writeAgentEvent } from "../stream/event-writer";

type RunAgent = typeof runAgent;

export function registerChatRoutes(
  app: FastifyInstance,
  options: {
    runAgent: RunAgent;
    conversations: ConversationRepository;
    traces: TraceRepository;
  }
) {
  // 聊天使用 POST + text/event-stream，既能传 JSON body，也能流式返回。
  app.post<{
    Body: ChatStreamRequest;
  }>("/api/chat/stream", async (request, reply) => {
    prepareEventStream(request, reply);
    let activeConversationId: string | undefined;
    const run = await options.traces.createRun({
      conversationId: request.body?.conversationId
    });
    const runStartedAt = run.startedAt;
    const runStartedMs = Date.now();
    let firstEventMs: number | undefined;
    let firstAnswerMs: number | undefined;
    let providerStartedMs: number | undefined;
    let providerDoneMs: number | undefined;

    async function recordTrace(type: string, data?: unknown) {
      const event = await options.traces.recordEvent({
        runId: run.id,
        type,
        startedAt: runStartedAt,
        data
      });
      firstEventMs ??= event.offsetMs;
      return event;
    }

    await recordTrace("run_started");

    const messageText = request.body?.message?.trim();
    if (!messageText) {
      await recordTrace("run_failed", { code: "message_required" });
      await options.traces.failRun({
        runId: run.id,
        errorMessage: "Message is required.",
        ttfeMs: firstEventMs,
        ttcMs: Date.now() - runStartedMs
      });
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
        await recordTrace("run_failed", { code: "conversation_not_found" });
        await options.traces.failRun({
          runId: run.id,
          errorMessage: "Conversation not found.",
          ttfeMs: firstEventMs,
          ttcMs: Date.now() - runStartedMs
        });
        writeAgentEvent(reply, {
          type: "error",
          message: "Conversation not found.",
          code: "conversation_not_found"
        });
        reply.raw.end();
        return reply;
      }
      activeConversationId = conversation.id;
      await options.traces.updateRunConversation({
        runId: run.id,
        conversationId: conversation.id
      });

      // 先保存用户消息，这样即使模型失败，刷新后也能恢复这轮输入。
      await options.conversations.addMessage({
        conversationId: conversation.id,
        role: "user",
        content: messageText
      });
      await recordTrace("user_message_saved", { conversationId: conversation.id });

      const messages = await options.conversations.listMessages(conversation.id);
      const assistantParts: string[] = [];
      let assistantMessage: ChatMessage | null = null;

      providerStartedMs = Date.now();
      await recordTrace("provider_request_started");

      // Agent 返回异步事件流；每个事件都会原样转发给前端。
      for await (const event of options.runAgent({
        conversationId: conversation.id,
        messages
      })) {
        if (event.type === "answer_delta") {
          if (firstAnswerMs === undefined) {
            firstAnswerMs = Date.now() - runStartedMs;
            await recordTrace("first_answer_delta");
          }
          assistantParts.push(event.text);
          writeAgentEvent(reply, event);
          continue;
        }

        if (event.type === "done") {
          providerDoneMs = Date.now();
          // Runtime 不知道数据库 id，所以由 Server 保存后替换 messageId。
          const assistantContent = assistantParts.join("");
          if (event.usage) {
            await options.traces.saveUsage({ runId: run.id, usage: event.usage });
          }
          assistantMessage = await options.conversations.addMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: assistantContent,
            status: assistantContent ? "completed" : "failed"
          });
          await options.conversations.touchConversation(conversation.id);
          await recordTrace("assistant_message_saved", {
            messageId: assistantMessage.id
          });
          await options.traces.completeRun({
            runId: run.id,
            ttfeMs: firstEventMs,
            ttfaMs: firstAnswerMs,
            ttcMs: Date.now() - runStartedMs,
            providerMs:
              providerStartedMs && providerDoneMs
                ? providerDoneMs - providerStartedMs
                : undefined
          });
          await recordTrace("run_completed");

          writeAgentEvent(reply, {
            type: "done",
            runId: run.id,
            messageId: assistantMessage.id,
            conversationId: conversation.id,
            usage: event.usage
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
        await recordTrace("assistant_message_saved", {
          messageId: assistantMessage.id
        });
        await options.traces.completeRun({
          runId: run.id,
          ttfeMs: firstEventMs,
          ttfaMs: firstAnswerMs,
          ttcMs: Date.now() - runStartedMs,
          providerMs:
            providerStartedMs && providerDoneMs
              ? providerDoneMs - providerStartedMs
              : undefined
        });
        await recordTrace("run_completed");
        writeAgentEvent(reply, {
          type: "done",
          runId: run.id,
          messageId: assistantMessage.id,
          conversationId: conversation.id
        });
      }
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : "Chat stream failed.";
      await recordTrace("run_failed", { message });
      await options.traces.failRun({
        runId: run.id,
        errorMessage: message,
        ttfeMs: firstEventMs,
        ttfaMs: firstAnswerMs,
        ttcMs: Date.now() - runStartedMs,
        providerMs: providerStartedMs ? Date.now() - providerStartedMs : undefined
      });
      // 尽量带上 conversationId，方便前端重新拉取已保存的用户消息。
      writeAgentEvent(reply, {
        type: "error",
        message,
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
