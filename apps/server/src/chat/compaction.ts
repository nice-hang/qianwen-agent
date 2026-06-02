import type { ChatMessage, Conversation } from "@qianwen-agent/shared";
import type { ConversationRepository } from "../storage/conversation-repository";

const DEFAULT_QWEN_CONTEXT_WINDOW_TOKENS = 256_000;
const DEFAULT_COMPACT_SUMMARY_OUTPUT_RESERVE_TOKENS = 20_000;
const DEFAULT_AUTO_COMPACT_BUFFER_TOKENS = 13_000;
const DEFAULT_RECENT_MESSAGE_COUNT = 2;
const SUMMARY_MAX_CHARS = 9000;

type RecordTrace = (type: string, data?: unknown) => Promise<unknown>;

export type SummarizeConversation = (input: {
  previousSummary?: string | null;
  messages: ChatMessage[];
  maxChars?: number;
}) => Promise<string>;

export function buildCompactedMessagesForAgent(
  messages: ChatMessage[],
  conversation: Pick<Conversation, "summary" | "summaryMessageId">
): {
  conversationSummary?: string | null;
  messages: ChatMessage[];
  injected: boolean;
  omittedMessages: number;
} {
  const compactedHistory = conversation.summary?.trim();
  const compactBoundaryMessageId = conversation.summaryMessageId;
  if (!compactedHistory || !compactBoundaryMessageId) {
    return uncompactMessages(messages);
  }

  const boundaryIndex = messages.findIndex(
    (message) => message.id === compactBoundaryMessageId
  );
  if (boundaryIndex === -1) {
    return uncompactMessages(messages);
  }

  // 边界前由摘要代表，只有边界后的原文继续进入模型输入。
  const rawMessagesAfterBoundary = messages.slice(boundaryIndex + 1);
  const recentMessageCount = getRecentMessageCount();
  return {
    conversationSummary: compactedHistory,
    messages:
      rawMessagesAfterBoundary.length > 0
        ? rawMessagesAfterBoundary
        : takeRecentMessages(messages, recentMessageCount),
    injected: true,
    omittedMessages: boundaryIndex + 1
  };
}

function uncompactMessages(messages: ChatMessage[]) {
  return {
    conversationSummary: null,
    messages,
    injected: false,
    omittedMessages: 0
  };
}

export async function maybeCompactConversation(input: {
  conversation: Pick<Conversation, "id" | "summary" | "summaryMessageId">;
  conversations: ConversationRepository;
  summarizeConversation: SummarizeConversation;
  recordTrace: RecordTrace;
}): Promise<void> {
  const messages = await input.conversations.listMessages(input.conversation.id);
  const decision = decideCompaction(messages, input.conversation);
  await input.recordTrace("conversation_compact_check", toDecisionTrace(decision));

  if (!decision.shouldCompact) {
    return;
  }

  await compactConversation({
    ...input,
    messagesToCompact: decision.messagesToCompact,
    summaryMessageId: decision.summaryMessageId
  });
}

export async function forceCompactConversation(input: {
  conversation: Pick<Conversation, "id" | "summary" | "summaryMessageId">;
  conversations: ConversationRepository;
  summarizeConversation: SummarizeConversation;
  recordTrace: RecordTrace;
}): Promise<boolean> {
  const messages = await input.conversations.listMessages(input.conversation.id);
  const afterBoundary = messagesAfterSummaryBoundary(
    messages,
    input.conversation.summaryMessageId
  );
  const messagesToCompact = afterBoundary.slice(
    0,
    Math.max(0, afterBoundary.length - getRecentMessageCount())
  );
  const summaryMessageId = messagesToCompact.at(-1)?.id;

  await input.recordTrace("conversation_compact_check", {
    forced: true,
    ...buildTokenBudgetTrace(
      estimateActiveContextTokens(messages, input.conversation),
      estimateMessagesTokens(messagesToCompact)
    ),
    candidateMessages: messagesToCompact.length,
    keptRecentMessages: Math.min(getRecentMessageCount(), afterBoundary.length),
    shouldCompact: Boolean(summaryMessageId)
  });

  if (!summaryMessageId) {
    return false;
  }

  await compactConversation({
    ...input,
    messagesToCompact,
    summaryMessageId
  });
  return true;
}

async function compactConversation(input: {
  conversation: Pick<Conversation, "id" | "summary">;
  conversations: ConversationRepository;
  summarizeConversation: SummarizeConversation;
  recordTrace: RecordTrace;
  messagesToCompact: ChatMessage[];
  summaryMessageId: string;
}): Promise<void> {
  const startedAt = Date.now();
  await input.recordTrace("conversation_compact_started", {
    messageCount: input.messagesToCompact.length,
    summaryMessageId: input.summaryMessageId
  });

  try {
    const summary = await input.summarizeConversation({
      previousSummary: input.conversation.summary,
      messages: input.messagesToCompact,
      maxChars: SUMMARY_MAX_CHARS
    });

    if (!summary.trim()) {
      await input.recordTrace("conversation_compact_error", {
        message: "Empty compaction summary."
      });
      return;
    }

    await input.conversations.updateSummary({
      conversationId: input.conversation.id,
      summary,
      summaryMessageId: input.summaryMessageId
    });

    await input.recordTrace("conversation_compact_done", {
      messageCount: input.messagesToCompact.length,
      summaryMessageId: input.summaryMessageId,
      summaryChars: summary.length,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    await input.recordTrace("conversation_compact_error", {
      message: error instanceof Error ? error.message : "Conversation compaction failed.",
      durationMs: Date.now() - startedAt
    });
  }
}

function decideCompaction(
  messages: ChatMessage[],
  conversation: Pick<Conversation, "summary" | "summaryMessageId">
): {
  shouldCompact: boolean;
  reason: string;
  activeContextTokens: number;
  candidateTokens: number;
  contextWindowTokens: number;
  summaryOutputReserveTokens: number;
  autoCompactBufferTokens: number;
  thresholdTokens: number;
  tokensUntilCompact: number;
  thresholdUtilizationPercent: number;
  candidateMessages: number;
  keptRecentMessages: number;
  messagesToCompact: ChatMessage[];
  summaryMessageId: string;
} {
  const afterBoundary = messagesAfterSummaryBoundary(messages, conversation.summaryMessageId);
  const messagesToCompact = afterBoundary.slice(
    0,
    Math.max(0, afterBoundary.length - getRecentMessageCount())
  );
  const activeContextTokens = estimateActiveContextTokens(messages, conversation);
  const candidateTokens = estimateMessagesTokens(messagesToCompact);
  const threshold = getAutoCompactThresholdTokens();
  const shouldCompact =
    messagesToCompact.length > 0 &&
    activeContextTokens >= threshold;
  const summaryMessageId = messagesToCompact.at(-1)?.id ?? "";

  return {
    shouldCompact,
    reason: shouldCompact ? "token_budget" : "below_threshold",
    ...buildTokenBudgetTrace(activeContextTokens, candidateTokens),
    candidateMessages: messagesToCompact.length,
    keptRecentMessages: Math.min(getRecentMessageCount(), afterBoundary.length),
    messagesToCompact,
    summaryMessageId
  };
}

function toDecisionTrace(
  decision: ReturnType<typeof decideCompaction>
): Omit<ReturnType<typeof decideCompaction>, "messagesToCompact"> {
  const { messagesToCompact: _messagesToCompact, ...trace } = decision;
  return trace;
}

function buildTokenBudgetTrace(activeContextTokens: number, candidateTokens: number) {
  const contextWindowTokens = getContextWindowTokens();
  const summaryOutputReserveTokens = getSummaryOutputReserveTokens();
  const autoCompactBufferTokens = getAutoCompactBufferTokens();
  const thresholdTokens = getAutoCompactThresholdTokens();

  return {
    activeContextTokens,
    candidateTokens,
    contextWindowTokens,
    summaryOutputReserveTokens,
    autoCompactBufferTokens,
    thresholdTokens,
    tokensUntilCompact: Math.max(0, thresholdTokens - activeContextTokens),
    thresholdUtilizationPercent:
      thresholdTokens > 0
        ? Math.round((activeContextTokens / thresholdTokens) * 100)
        : 100
  };
}

function getAutoCompactThresholdTokens(): number {
  return Math.max(
    1,
    getContextWindowTokens() -
      getSummaryOutputReserveTokens() -
      getAutoCompactBufferTokens()
  );
}

function getContextWindowTokens(): number {
  return readPositiveIntEnv(
    "QWEN_COMPACT_CONTEXT_WINDOW_TOKENS",
    DEFAULT_QWEN_CONTEXT_WINDOW_TOKENS
  );
}

function getSummaryOutputReserveTokens(): number {
  return readPositiveIntEnv(
    "QWEN_COMPACT_SUMMARY_OUTPUT_RESERVE_TOKENS",
    DEFAULT_COMPACT_SUMMARY_OUTPUT_RESERVE_TOKENS
  );
}

function getAutoCompactBufferTokens(): number {
  return readPositiveIntEnv(
    "QWEN_COMPACT_AUTO_BUFFER_TOKENS",
    DEFAULT_AUTO_COMPACT_BUFFER_TOKENS
  );
}

function getRecentMessageCount(): number {
  return readNonNegativeIntEnv(
    "QWEN_COMPACT_RECENT_MESSAGE_COUNT",
    DEFAULT_RECENT_MESSAGE_COUNT
  );
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function messagesAfterSummaryBoundary(
  messages: ChatMessage[],
  summaryMessageId?: string | null
): ChatMessage[] {
  if (!summaryMessageId) return messages;

  const boundaryIndex = messages.findIndex((message) => message.id === summaryMessageId);
  return boundaryIndex === -1 ? messages : messages.slice(boundaryIndex + 1);
}

function estimateActiveContextTokens(
  messages: ChatMessage[],
  conversation: Pick<Conversation, "summary" | "summaryMessageId">
): number {
  if (!conversation.summary?.trim() || !conversation.summaryMessageId) {
    return estimateMessagesTokens(messages);
  }

  const afterBoundary = messagesAfterSummaryBoundary(
    messages,
    conversation.summaryMessageId
  );
  return estimateTextTokens(conversation.summary) + estimateMessagesTokens(afterBoundary);
}

function estimateMessagesTokens(messages: ChatMessage[]): number {
  const chars = messages.reduce((sum, message) => {
    const attachmentChars = (message.attachments ?? []).reduce(
      (total, attachment) => total + attachment.fileName.length + 40,
      0
    );
    return (
      sum +
      message.content.length +
      (message.reasoningContent?.length ?? 0) +
      attachmentChars
    );
  }, 0);
  return estimateCharsAsTokens(chars);
}

function estimateTextTokens(text: string): number {
  return estimateCharsAsTokens(text.length);
}

function estimateCharsAsTokens(chars: number): number {
  return Math.ceil(chars * 2);
}

function takeRecentMessages(messages: ChatMessage[], count: number): ChatMessage[] {
  return count <= 0 ? [] : messages.slice(-count);
}
