import type {
  ChatMessage,
  Conversation,
  MessageRole,
  SearchSource
} from "@qianwen-agent/shared";
import type { PrismaClient } from "@prisma/client";
import { toChatMessage, toConversation } from "./mappers";

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
    status?: "streaming" | "completed" | "failed";
  }): Promise<ChatMessage> {
    const message = await db.message.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        status: input.status ?? "completed",
        content: input.content,
        reasoningContent: input.reasoningContent,
        sourcesJson: input.sources?.length ? JSON.stringify(input.sources) : undefined
      }
    });

    return toChatMessage(message);
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
    touchConversation
  };
}
