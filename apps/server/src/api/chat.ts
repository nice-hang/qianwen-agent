import type { FastifyInstance } from "fastify";
import type { ChatStreamRequest } from "@qianwen-agent/shared";
import type { runAgent, summarizeConversation } from "@qianwen-agent/agent-runtime";
import type { ConversationRepository } from "../storage/conversation-repository";
import type { TraceRepository } from "../storage/trace-repository";
import { prepareEventStream, writeAgentEvent } from "../stream/event-writer";
import {
  defaultPromptForAttachments,
  loadAgentAttachments,
  normalizeAttachmentIds
} from "../chat/attachments";
import { buildAgentInput } from "../chat/agent-input";
import { createChatAgentEventHandler } from "../chat/agent-events";
import {
  forceCompactConversation,
  maybeCompactConversation
} from "../chat/compaction";
import { prepareFileRagContext } from "../chat/file-rag";
import { normalizeConversationTitle } from "../chat/title";

type RunAgent = typeof runAgent;
type SummarizeConversation = typeof summarizeConversation;

export function registerChatRoutes(
  app: FastifyInstance,
  options: {
    runAgent: RunAgent;
    summarizeConversation: SummarizeConversation;
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
    let agentEvents:
      | ReturnType<typeof createChatAgentEventHandler>
      | undefined;

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
    const attachmentIds = normalizeAttachmentIds(request.body?.attachmentIds);
    if (!messageText && attachmentIds.length === 0) {
      await recordTrace("run_failed", { code: "message_required" });
      await options.traces.failRun({
        runId: run.id,
        errorMessage: "Message or image is required.",
        ttfeMs: firstEventMs,
        ttcMs: Date.now() - runStartedMs
      });
      writeAgentEvent(reply, {
        type: "error",
        message: "Message or image is required.",
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
      const conversationId = conversation.id;
      await options.traces.updateRunConversation({
        runId: run.id,
        conversationId
      });

      const currentAttachments = await loadAgentAttachments({
        conversations: options.conversations,
        attachmentIds,
        conversationId
      });
      if (attachmentIds.length !== currentAttachments.length) {
        await recordTrace("run_failed", { code: "attachment_not_found" });
        await options.traces.failRun({
          runId: run.id,
          errorMessage: "Attachment not found.",
          ttfeMs: firstEventMs,
          ttcMs: Date.now() - runStartedMs
        });
        writeAgentEvent(reply, {
          type: "error",
          message: "Attachment not found.",
          code: "attachment_not_found",
          conversationId
        });
        reply.raw.end();
        return reply;
      }
      const userMessageContent =
        messageText || defaultPromptForAttachments(currentAttachments);

      // 先保存用户消息，这样即使模型失败，刷新后也能恢复这轮输入。
      await options.conversations.addMessage({
        conversationId,
        role: "user",
        content: userMessageContent,
        attachmentIds
      });
      await recordTrace("user_message_saved", {
        conversationId,
        attachmentCount: attachmentIds.length
      });

      const fileRag = await prepareFileRagContext({
        attachments: currentAttachments,
        conversationId,
        query: userMessageContent,
        recordTrace
      });

      const agentInput = await buildAgentInput({
        conversation,
        conversations: options.conversations,
        currentAttachments,
        fileContextText: fileRag.contextText,
        recordTrace
      });
      const mode = request.body.mode === "deep" ? "deep" : "fast";
      agentEvents = createChatAgentEventHandler({
        conversationId,
        runId: run.id,
        runStartedMs,
        reply,
        conversations: options.conversations,
        traces: options.traces,
        recordTrace,
        getFirstEventMs: () => firstEventMs,
        initialSources: []
      });

      agentEvents.state.providerStartedMs = Date.now();
      await recordTrace("provider_request_started", {
        mode
      });

      // Agent 内部闭环执行；Server 只处理稳定的 AgentEvent 回调。
      try {
        await options.runAgent(
          {
            conversationId,
            messages: agentInput.messages,
            mode,
            conversationSummary: agentInput.conversationSummary
          },
          {
            onEvent: async (event) => {
              await agentEvents?.handleEvent(event);
            }
          }
        );
      } catch (error) {
        if (
          !isPromptTooLongError(error) ||
          agentEvents.state.assistantParts.length > 0 ||
          agentEvents.state.reasoningParts.length > 0
        ) {
          throw error;
        }

        await recordTrace("conversation_compact_reactive_retry", {
          reason: error instanceof Error ? error.message : "prompt too long"
        });
        const compacted = await forceCompactConversation({
          conversation,
          conversations: options.conversations,
          summarizeConversation: (input) =>
            options.summarizeConversation(input),
          recordTrace
        });
        if (!compacted) {
          throw error;
        }

        const updatedConversation = await options.conversations.getConversation(
          conversationId
        );
        const retryAgentInput = await buildAgentInput({
          conversation: updatedConversation ?? conversation,
          conversations: options.conversations,
          currentAttachments,
          fileContextText: fileRag.contextText,
          recordTrace
        });
        await options.runAgent(
          {
            conversationId,
            messages: retryAgentInput.messages,
            mode,
            conversationSummary: retryAgentInput.conversationSummary
          },
          {
            onEvent: async (event) => {
              await agentEvents?.handleEvent(event);
            }
          }
        );
      }

      // 防御性兜底：处理 provider 没有显式 done 但已经有回答内容的情况。
      await agentEvents.completePendingAnswer();
      const latestConversation =
        (await options.conversations.getConversation(conversationId)) ?? conversation;
      void maybeCompactConversation({
        conversation: latestConversation,
        conversations: options.conversations,
        summarizeConversation: (input) =>
          options.summarizeConversation(input),
        recordTrace
      });
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : "Chat stream failed.";
      await recordTrace("run_failed", { message });
      await options.traces.failRun({
        runId: run.id,
        errorMessage: message,
        ttfeMs: firstEventMs,
        ttfrMs: agentEvents?.state.firstReasoningMs,
        ttfaMs: agentEvents?.state.firstAnswerMs,
        ttcMs: Date.now() - runStartedMs,
        providerMs: agentEvents?.state.providerStartedMs
          ? Date.now() - agentEvents.state.providerStartedMs
          : undefined
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

function isPromptTooLongError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /prompt.*too.*long|context.*length|maximum context|413|tokens/i.test(message);
}
