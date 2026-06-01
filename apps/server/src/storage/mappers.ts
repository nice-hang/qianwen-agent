import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  MessageRole,
  MessageStatus,
  SearchSource
} from "@qianwen-agent/shared";
import type {
  Attachment,
  Conversation as DbConversation,
  Message
} from "@prisma/client";

export function toConversation(conversation: DbConversation): Conversation {
  return {
    id: conversation.id,
    title: conversation.title,
    summary: conversation.summary,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString()
  };
}

export function toChatMessage(
  message: Message & { attachments?: Attachment[] }
): ChatMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role as MessageRole,
    status: message.status as MessageStatus,
    content: message.content,
    reasoningContent: message.reasoningContent,
    sources: parseSources(message.sourcesJson),
    attachments: message.attachments?.map(toChatAttachment),
    createdAt: message.createdAt.toISOString()
  };
}

export function toChatAttachment(attachment: Attachment): ChatAttachment {
  return {
    id: attachment.id,
    conversationId: attachment.conversationId,
    messageId: attachment.messageId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    kind: attachment.kind === "file" ? "file" : "image",
    parseStatus:
      attachment.parseStatus === "uploaded" ||
      attachment.parseStatus === "parsing" ||
      attachment.parseStatus === "error"
        ? attachment.parseStatus
        : "ready",
    parseError: attachment.parseError,
    chunkCount: attachment.chunkCount,
    parsedAt: attachment.parsedAt?.toISOString() ?? null,
    url: `/api/attachments/${attachment.id}/file`,
    createdAt: attachment.createdAt.toISOString()
  };
}

function parseSources(input: string | null): SearchSource[] | undefined {
  if (!input) return undefined;

  try {
    const value = JSON.parse(input) as unknown;
    return Array.isArray(value) ? (value as SearchSource[]) : undefined;
  } catch {
    return undefined;
  }
}
