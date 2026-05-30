import type { ChatMessage } from "@qianwen-agent/shared";

export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
}

export function buildProviderMessages(messages: ChatMessage[]): ProviderMessage[] {
  // Server 保存应用消息；provider 只接收精简后的模型输入投影。
  const providerMessages: ProviderMessage[] = [];

  for (const message of messages) {
    if (!message.content.trim()) continue;

    providerMessages.push({
      role: message.role,
      content: message.content
    });
  }

  return providerMessages;
}
