import type { FastifyReply } from "fastify";
import type { AgentEvent, ChatMessage, SearchSource } from "@qianwen-agent/shared";
import type { ConversationRepository } from "../storage/conversation-repository";
import type { TraceRepository } from "../storage/trace-repository";
import { writeAgentEvent } from "../stream/event-writer";
import { dedupeSources } from "./sources";

type RecordTrace = (type: string, data?: unknown) => Promise<unknown>;

export interface ChatAgentEventState {
  reasoningParts: string[];
  assistantParts: string[];
  searchSources: SearchSource[];
  assistantMessage: ChatMessage | null;
  terminalAgentError: boolean;
  firstReasoningMs?: number;
  firstAnswerMs?: number;
  providerStartedMs?: number;
  providerDoneMs?: number;
}

export function createChatAgentEventHandler(input: {
  conversationId: string;
  runId: string;
  runStartedMs: number;
  reply: FastifyReply;
  conversations: ConversationRepository;
  traces: TraceRepository;
  recordTrace: RecordTrace;
  getFirstEventMs: () => number | undefined;
  initialSources: SearchSource[];
}) {
  const state: ChatAgentEventState = {
    reasoningParts: [],
    assistantParts: [],
    searchSources: [...input.initialSources],
    assistantMessage: null,
    terminalAgentError: false
  };

  async function handleEvent(event: AgentEvent): Promise<void> {
    if (event.type === "provider_request") {
      await input.recordTrace("provider_request", event);
      return;
    }

    if (event.type === "provider_response") {
      state.providerDoneMs = Date.now();
      await input.recordTrace("provider_response", event);
      return;
    }

    if (event.type === "reasoning_delta") {
      if (state.firstReasoningMs === undefined) {
        state.firstReasoningMs = Date.now() - input.runStartedMs;
        await input.recordTrace("first_reasoning_delta");
      }
      state.reasoningParts.push(event.text);
      writeAgentEvent(input.reply, event);
      return;
    }

    if (event.type === "answer_delta") {
      if (state.firstAnswerMs === undefined) {
        state.firstAnswerMs = Date.now() - input.runStartedMs;
        await input.recordTrace("first_answer_delta");
      }
      state.assistantParts.push(event.text);
      writeAgentEvent(input.reply, event);
      return;
    }

    if (event.type === "tool_call_started") {
      await input.recordTrace("tool_call_started", event);
      writeAgentEvent(input.reply, event);
      return;
    }

    if (event.type === "tool_call_done") {
      await input.recordTrace("tool_call_done", event);
      writeAgentEvent(input.reply, event);
      return;
    }

    if (event.type === "search_results") {
      await input.recordTrace("search_results", {
        toolCallId: event.toolCallId,
        query: event.query,
        sourcesCount: event.sources.length,
        sources: event.sources
      });
      state.searchSources.push(...event.sources);
      writeAgentEvent(input.reply, event);
      return;
    }

    if (event.type === "done") {
      state.providerDoneMs = Date.now();
      const assistantContent = state.assistantParts.join("");
      if (event.usage) {
        await input.traces.saveUsage({ runId: input.runId, usage: event.usage });
      }
      state.assistantMessage = await input.conversations.addMessage({
        conversationId: input.conversationId,
        role: "assistant",
        content: assistantContent,
        reasoningContent: state.reasoningParts.join("") || undefined,
        sources: dedupeSources(state.searchSources),
        status: assistantContent ? "completed" : "failed"
      });
      await input.conversations.touchConversation(input.conversationId);
      await input.recordTrace("assistant_message_saved", {
        messageId: state.assistantMessage.id
      });
      await completeRun();
      await input.recordTrace("run_completed");

      writeAgentEvent(input.reply, {
        type: "done",
        runId: input.runId,
        messageId: state.assistantMessage.id,
        conversationId: input.conversationId,
        usage: event.usage
      });
      return;
    }

    if (event.type === "error") {
      state.terminalAgentError = true;
      await input.recordTrace("run_failed", event);
      await input.traces.failRun({
        runId: input.runId,
        errorMessage: event.message,
        ttfeMs: input.getFirstEventMs(),
        ttfrMs: state.firstReasoningMs,
        ttfaMs: state.firstAnswerMs,
        ttcMs: Date.now() - input.runStartedMs,
        providerMs: state.providerStartedMs
          ? Date.now() - state.providerStartedMs
          : undefined
      });
      writeAgentEvent(input.reply, {
        ...event,
        conversationId: input.conversationId
      });
      return;
    }

    writeAgentEvent(input.reply, event);
  }

  async function completePendingAnswer(): Promise<void> {
    if (
      state.terminalAgentError ||
      state.assistantMessage ||
      state.assistantParts.length === 0
    ) {
      return;
    }

    state.assistantMessage = await input.conversations.addMessage({
      conversationId: input.conversationId,
      role: "assistant",
      content: state.assistantParts.join(""),
      reasoningContent: state.reasoningParts.join("") || undefined,
      sources: dedupeSources(state.searchSources)
    });
    await input.conversations.touchConversation(input.conversationId);
    await input.recordTrace("assistant_message_saved", {
      messageId: state.assistantMessage.id
    });
    await completeRun();
    await input.recordTrace("run_completed");
    writeAgentEvent(input.reply, {
      type: "done",
      runId: input.runId,
      messageId: state.assistantMessage.id,
      conversationId: input.conversationId
    });
  }

  async function completeRun(): Promise<void> {
    await input.traces.completeRun({
      runId: input.runId,
      ttfeMs: input.getFirstEventMs(),
      ttfrMs: state.firstReasoningMs,
      ttfaMs: state.firstAnswerMs,
      ttcMs: Date.now() - input.runStartedMs,
      providerMs:
        state.providerStartedMs && state.providerDoneMs
          ? state.providerDoneMs - state.providerStartedMs
          : undefined
    });
  }

  return {
    state,
    handleEvent,
    completePendingAnswer
  };
}
