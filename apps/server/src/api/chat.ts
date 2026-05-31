import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type {
  ChatAttachment,
  AgentEvent,
  ChatMessage,
  ChatStreamRequest,
  SearchSource
} from "@qianwen-agent/shared";
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
    let firstReasoningMs: number | undefined;
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

      // 先保存用户消息，这样即使模型失败，刷新后也能恢复这轮输入。
      await options.conversations.addMessage({
        conversationId,
        role: "user",
        content: messageText,
        attachmentIds
      });
      await recordTrace("user_message_saved", {
        conversationId,
        attachmentCount: attachmentIds.length
      });

      const messages = await options.conversations.listMessages(conversationId);
      const messagesForAgent =
        currentAttachments.length > 0
          ? withCurrentAttachments(messages, currentAttachments)
          : messages;
      const mode = request.body.mode === "deep" ? "deep" : "fast";
      const reasoningParts: string[] = [];
      const assistantParts: string[] = [];
      const searchSources: SearchSource[] = [];
      let assistantMessage: ChatMessage | null = null;
      let terminalAgentError = false;

      providerStartedMs = Date.now();
      await recordTrace("provider_request_started", {
        mode
      });

      // Agent 内部闭环执行；Server 只处理稳定的 AgentEvent 回调。
      await options.runAgent(
        {
          conversationId,
          messages: messagesForAgent,
          mode
        },
        {
          onEvent: async (event) => {
            await handleAgentEvent(event);
          }
        }
      );

      async function handleAgentEvent(event: AgentEvent) {
        if (event.type === "provider_request") {
          await recordTrace("provider_request", event);
          return;
        }

        if (event.type === "provider_response") {
          providerDoneMs = Date.now();
          await recordTrace("provider_response", event);
          return;
        }

        if (event.type === "reasoning_delta") {
          if (firstReasoningMs === undefined) {
            firstReasoningMs = Date.now() - runStartedMs;
            await recordTrace("first_reasoning_delta");
          }
          reasoningParts.push(event.text);
          writeAgentEvent(reply, event);
          return;
        }

        if (event.type === "answer_delta") {
          if (firstAnswerMs === undefined) {
            firstAnswerMs = Date.now() - runStartedMs;
            await recordTrace("first_answer_delta");
          }
          assistantParts.push(event.text);
          writeAgentEvent(reply, event);
          return;
        }

        if (event.type === "tool_call_started") {
          await recordTrace("tool_call_started", event);
          writeAgentEvent(reply, event);
          return;
        }

        if (event.type === "tool_call_done") {
          await recordTrace("tool_call_done", event);
          writeAgentEvent(reply, event);
          return;
        }

        if (event.type === "search_results") {
          await recordTrace("search_results", {
            toolCallId: event.toolCallId,
            query: event.query,
            sourcesCount: event.sources.length,
            sources: event.sources
          });
          searchSources.push(...event.sources);
          writeAgentEvent(reply, event);
          return;
        }

        if (event.type === "done") {
          providerDoneMs = Date.now();
          // Runtime 不知道数据库 id，所以由 Server 保存后替换 messageId。
          const assistantContent = assistantParts.join("");
          if (event.usage) {
            await options.traces.saveUsage({ runId: run.id, usage: event.usage });
          }
          assistantMessage = await options.conversations.addMessage({
            conversationId,
            role: "assistant",
            content: assistantContent,
            reasoningContent: reasoningParts.join("") || undefined,
            sources: dedupeSources(searchSources),
            status: assistantContent ? "completed" : "failed"
          });
          await options.conversations.touchConversation(conversationId);
          await recordTrace("assistant_message_saved", {
            messageId: assistantMessage.id
          });
          await options.traces.completeRun({
            runId: run.id,
            ttfeMs: firstEventMs,
            ttfrMs: firstReasoningMs,
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
            conversationId,
            usage: event.usage
          });
          return;
        }

        if (event.type === "error") {
          terminalAgentError = true;
          await recordTrace("run_failed", event);
          await options.traces.failRun({
            runId: run.id,
            errorMessage: event.message,
            ttfeMs: firstEventMs,
            ttfrMs: firstReasoningMs,
            ttfaMs: firstAnswerMs,
            ttcMs: Date.now() - runStartedMs,
            providerMs: providerStartedMs ? Date.now() - providerStartedMs : undefined
          });
          writeAgentEvent(reply, {
            ...event,
            conversationId
          });
          return;
        }

        writeAgentEvent(reply, event);
      }

      // 防御性兜底：处理 provider 没有显式 done 但已经有回答内容的情况。
      if (!terminalAgentError && !assistantMessage && assistantParts.length > 0) {
        assistantMessage = await options.conversations.addMessage({
          conversationId,
          role: "assistant",
          content: assistantParts.join(""),
          reasoningContent: reasoningParts.join("") || undefined,
          sources: dedupeSources(searchSources)
        });
        await options.conversations.touchConversation(conversationId);
        await recordTrace("assistant_message_saved", {
          messageId: assistantMessage.id
        });
        await options.traces.completeRun({
          runId: run.id,
          ttfeMs: firstEventMs,
          ttfrMs: firstReasoningMs,
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
          conversationId
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
        ttfrMs: firstReasoningMs,
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

function dedupeSources(sources: SearchSource[]): SearchSource[] | undefined {
  const seen = new Set<string>();
  const deduped: SearchSource[] = [];

  for (const source of sources) {
    const key = source.url || source.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }

  return deduped.length > 0 ? deduped : undefined;
}

function normalizeAttachmentIds(input: string[] | undefined): string[] {
  return [...new Set((input ?? []).filter((id) => typeof id === "string" && id))];
}

async function loadAgentAttachments(input: {
  conversations: ConversationRepository;
  attachmentIds: string[];
  conversationId: string;
}): Promise<ChatAttachment[]> {
  const attachments = await input.conversations.listAttachmentsForAgent(
    input.attachmentIds,
    input.conversationId
  );

  return Promise.all(
    attachments.map(async (attachment) => {
      const bytes = await readFile(attachment.storagePath);
      return {
        ...attachment,
        imageDataUrl: `data:${attachment.mimeType};base64,${bytes.toString("base64")}`
      };
    })
  );
}

function withCurrentAttachments(
  messages: ChatMessage[],
  attachments: ChatAttachment[]
): ChatMessage[] {
  let lastUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      lastUserMessageIndex = index;
      break;
    }
  }

  if (lastUserMessageIndex === -1) return messages;

  return messages.map((message, index) =>
    index === lastUserMessageIndex
      ? {
          ...message,
          attachments
        }
      : message
  );
}
