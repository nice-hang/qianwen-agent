import { readFile } from "node:fs/promises";
import type { ChatAttachment, ChatMessage } from "@qianwen-agent/shared";
import type { ConversationRepository } from "../storage/conversation-repository";

export function normalizeAttachmentIds(input: string[] | undefined): string[] {
  return [...new Set((input ?? []).filter((id) => typeof id === "string" && id))];
}

export function defaultPromptForAttachments(attachments: ChatAttachment[]): string {
  if (attachments.some((attachment) => attachment.kind === "file")) {
    return "请总结上传的文件内容。";
  }

  return "";
}

export async function loadAgentAttachments(input: {
  conversations: ConversationRepository;
  attachmentIds: string[];
  conversationId: string;
}): Promise<Array<ChatAttachment & { storagePath: string }>> {
  const attachments = await input.conversations.listAttachmentsForAgent(
    input.attachmentIds,
    input.conversationId
  );

  return Promise.all(
    attachments.map(async (attachment) => {
      if (!attachment.mimeType.startsWith("image/")) {
        return attachment;
      }

      const bytes = await readFile(attachment.storagePath);
      return {
        ...attachment,
        imageDataUrl: `data:${attachment.mimeType};base64,${bytes.toString("base64")}`
      };
    })
  );
}

export function withCurrentAttachments(
  messages: ChatMessage[],
  attachments: ChatAttachment[]
): ChatMessage[] {
  let lastUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      lastUserMessageIndex = index;
      break;
    }
  }

  if (lastUserMessageIndex === -1) return messages;

  return messages.map((message, index) =>
    index === lastUserMessageIndex
      ? {
          ...message,
          attachments
        }
      : message
  );
}
