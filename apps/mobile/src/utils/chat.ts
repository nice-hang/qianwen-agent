import type { ChatMessage, SearchSource } from "@qianwen-agent/shared";

export interface OptimisticMessages {
  assistant: ChatMessage;
  user: ChatMessage;
}

export interface SendState {
  assistantId: string;
  conversationId?: string;
}

export function createOptimisticMessages(
  text: string,
  conversationId: string | undefined
): OptimisticMessages {
  const fallbackConversationId = conversationId ?? `local-conversation-${Date.now()}`;
  const now = new Date().toISOString();

  return {
    user: {
      id: `local-user-${Date.now()}`,
      conversationId: fallbackConversationId,
      role: "user",
      status: "completed",
      content: text,
      createdAt: now
    },
    assistant: {
      id: `local-assistant-${Date.now()}`,
      conversationId: fallbackConversationId,
      role: "assistant",
      status: "streaming",
      content: "",
      createdAt: now,
      activity: "正在生成"
    }
  };
}

export function dedupeSources(
  current: SearchSource[] | undefined,
  incoming: SearchSource[]
): SearchSource[] {
  const seen = new Set<string>();
  const merged: SearchSource[] = [];

  for (const source of [...(current ?? []), ...incoming]) {
    const key = source.url || source.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }

  return merged;
}

export function readError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "请求失败";
}

