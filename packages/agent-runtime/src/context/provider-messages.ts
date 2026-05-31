import type { ChatMessage } from "@qianwen-agent/shared";

export type ProviderMessage =
  | {
      role: "user" | "assistant" | "system";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
      tool_calls: ProviderToolCall[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

export interface ProviderToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
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
