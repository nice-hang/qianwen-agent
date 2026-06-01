import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  MessageRole,
  SearchSource
} from "@qianwen-agent/shared";
import type { PrismaClient } from "@prisma/client";
import { toChatAttachment, toChatMessage, toConversation } from "./mappers";

export type ConversationRepository = ReturnType<typeof createConversationRepository>;

export function createConversationRepository(db: PrismaClient) {
  // Repository 是唯一直接访问 Prisma model 的层。
  async function listConversations(): Promise<Conversation[]> {
    const conversations = await db.conversation.findMany({
      orderBy: { updatedAt: "desc" }
    });

    return conversations.map(toConversation);
  }

  async function createConversation(title: string): Promise<Conversation> {
    const conversation = await db.conversation.create({
      data: { title }
    });

    return toConversation(conversation);
  }

  async function getConversation(id: string): Promise<Conversation | null> {
    const conversation = await db.conversation.findUnique({
      where: { id }
    });

    return conversation ? toConversation(conversation) : null;
  }

  async function listMessages(conversationId: string): Promise<ChatMessage[]> {
    const messages = await db.message.findMany({
      where: { conversationId },
      include: { attachments: true },
      orderBy: { createdAt: "asc" }
    });

    return messages.map(toChatMessage);
  }

  async function addMessage(input: {
    conversationId: string;
    role: MessageRole;
    content: string;
    reasoningContent?: string;
    sources?: SearchSource[];
    attachmentIds?: string[];
    status?: "streaming" | "completed" | "failed";
  }): Promise<ChatMessage> {
    const message = await db.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          role: input.role,
          status: input.status ?? "completed",
          content: input.content,
          reasoningContent: input.reasoningContent,
          sourcesJson: input.sources?.length ? JSON.stringify(input.sources) : undefined
        }
      });

      if (input.attachmentIds?.length) {
        await tx.attachment.updateMany({
          where: {
            id: { in: input.attachmentIds },
            OR: [{ conversationId: null }, { conversationId: input.conversationId }]
          },
          data: {
            conversationId: input.conversationId,
            messageId: created.id
          }
        });
      }

      return tx.message.findUniqueOrThrow({
        where: { id: created.id },
        include: { attachments: true }
      });
    });

    return toChatMessage(message);
  }

  async function createImageAttachment(input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
  }): Promise<ChatAttachment> {
    const attachment = await db.attachment.create({
      data: {
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storagePath: input.storagePath,
        kind: "image",
        parseStatus: "ready",
        parsedAt: new Date()
      }
    });

    return toChatAttachment(attachment);
  }

  async function createFileAttachment(input: {
    conversationId?: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
  }): Promise<ChatAttachment> {
    const attachment = await db.attachment.create({
      data: {
        conversationId: input.conversationId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storagePath: input.storagePath,
        kind: "file",
        parseStatus: "uploaded"
      }
    });

    return toChatAttachment(attachment);
  }

  async function updateAttachmentParseState(input: {
    id: string;
    parseStatus: "uploaded" | "parsing" | "ready" | "error";
    parseError?: string | null;
    chunkCount?: number | null;
    parsedAt?: Date | null;
  }): Promise<ChatAttachment> {
    const attachment = await db.attachment.update({
      where: { id: input.id },
      data: {
        parseStatus: input.parseStatus,
        parseError: input.parseError,
        chunkCount: input.chunkCount,
        parsedAt: input.parsedAt
      }
    });

    return toChatAttachment(attachment);
  }

  async function getAttachment(id: string): Promise<
    | (ChatAttachment & {
        storagePath: string;
      })
    | null
  > {
    const attachment = await db.attachment.findUnique({
      where: { id }
    });

    return attachment
      ? {
          ...toChatAttachment(attachment),
          storagePath: attachment.storagePath
        }
      : null;
  }

  async function listAttachmentsForAgent(
    ids: string[],
    conversationId: string
  ): Promise<
    Array<
      ChatAttachment & {
        storagePath: string;
      }
    >
  > {
    if (ids.length === 0) return [];

    const attachments = await db.attachment.findMany({
      where: {
        id: { in: ids },
        OR: [{ conversationId: null }, { conversationId }]
      }
    });

    return attachments.map((attachment) => ({
      ...toChatAttachment(attachment),
      storagePath: attachment.storagePath
    }));
  }

  // 更新会话时间，让最近活跃的会话排在侧边栏顶部。
  async function touchConversation(id: string): Promise<void> {
    await db.conversation.update({
      where: { id },
      data: { updatedAt: new Date() }
    });
  }

  return {
    listConversations,
    createConversation,
    getConversation,
    listMessages,
    addMessage,
    createImageAttachment,
    createFileAttachment,
    updateAttachmentParseState,
    getAttachment,
    listAttachmentsForAgent,
    touchConversation
  };
}
