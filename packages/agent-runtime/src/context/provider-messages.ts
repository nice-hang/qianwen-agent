import type { ChatMessage } from "@qianwen-agent/shared";

export type ProviderMessage =
  | {
      role: "user" | "assistant" | "system";
      content: string | ProviderContentPart[];
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

export type ProviderContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

export function buildProviderMessages(messages: ChatMessage[]): ProviderMessage[] {
  // Server 保存应用消息；provider 只接收精简后的模型输入投影。
  const providerMessages: ProviderMessage[] = [];

  for (const message of messages) {
    const content = buildMessageContent(message);
    if (!content) continue;

    providerMessages.push({
      role: message.role,
      content
    });
  }

  return providerMessages;
}

function buildMessageContent(message: ChatMessage): string | ProviderContentPart[] | null {
  const text = message.content.trim();
  const imageParts =
    message.role === "user"
      ? (message.attachments ?? [])
          .filter((attachment) => attachment.mimeType.startsWith("image/"))
          .flatMap((attachment) =>
            attachment.imageDataUrl
              ? [
                  {
                    type: "image_url" as const,
                    image_url: { url: attachment.imageDataUrl }
                  }
                ]
              : []
          )
      : [];

  if (imageParts.length === 0) {
    return text || null;
  }

  return [
    {
      type: "text",
      text: text || "请根据图片内容回答。"
    },
    ...imageParts
  ];
}
