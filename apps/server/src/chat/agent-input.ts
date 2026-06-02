import type { ChatAttachment, ChatMessage, Conversation } from "@qianwen-agent/shared";
import { injectFileContextIntoLastUserMessage } from "../rag/retrieval";
import type { ConversationRepository } from "../storage/conversation-repository";
import { withCurrentAttachments } from "./attachments";
import { buildCompactedMessagesForAgent } from "./compaction";

type RecordTrace = (type: string, data?: unknown) => Promise<unknown>;

export interface AgentInputProjection {
  messages: ChatMessage[];
  conversationSummary?: string | null;
}

export async function buildAgentInput(input: {
  conversation: Pick<Conversation, "id" | "summary" | "summaryMessageId">;
  conversations: ConversationRepository;
  currentAttachments: Array<ChatAttachment & { storagePath?: string }>;
  fileContextText: string;
  recordTrace: RecordTrace;
}): Promise<AgentInputProjection> {
  const persistedMessages = await input.conversations.listMessages(
    input.conversation.id
  );

  // 模型输入投影顺序：
  // 1. 给刚保存的用户消息补当前附件元信息
  // 2. 用会话摘要替换旧历史，只保留近期原文
  // 3. 把文件检索上下文注入当前用户消息
  const messagesWithCurrentAttachments =
    input.currentAttachments.length > 0
      ? withCurrentAttachments(persistedMessages, input.currentAttachments)
      : persistedMessages;

  const compacted = buildCompactedMessagesForAgent(
    messagesWithCurrentAttachments,
    input.conversation
  );

  if (compacted.injected) {
    await input.recordTrace("conversation_compact_injected", {
      summaryMessageId: input.conversation.summaryMessageId,
      summaryChars: input.conversation.summary?.length ?? 0,
      omittedMessages: compacted.omittedMessages,
      recentMessages: compacted.messages.length
    });
  }

  return {
    conversationSummary: compacted.conversationSummary,
    messages: injectFileContextIntoLastUserMessage(
      compacted.messages,
      input.fileContextText
    )
  };
}
