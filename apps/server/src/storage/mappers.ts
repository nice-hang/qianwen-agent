import type {
  ChatMessage,
  Conversation,
  MessageRole,
  MessageStatus
} from "@qianwen-agent/shared";
import type { Conversation as DbConversation, Message } from "@prisma/client";

export function toConversation(conversation: DbConversation): Conversation {
  return {
    id: conversation.id,
    title: conversation.title,
    summary: conversation.summary,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString()
  };
}

export function toChatMessage(message: Message): ChatMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role as MessageRole,
    status: message.status as MessageStatus,
    content: message.content,
    reasoningContent: message.reasoningContent,
    createdAt: message.createdAt.toISOString()
  };
}
