import type { ChatMessage } from "@qianwen-agent/shared";
import type { ProviderMessage } from "../context/provider-messages";
import { streamQwenText } from "../providers/qwen/client";
import {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_MODEL
} from "../providers/qwen/constants";
import { readProcessEnv } from "../runtime/env";
import type { RuntimeEnv } from "../runtime/types";

const DEFAULT_SUMMARY_MAX_CHARS = 9000;

export interface SummarizeConversationInput {
  previousSummary?: string | null;
  messages: ChatMessage[];
  maxChars?: number;
}

export interface SummarizeConversationOptions {
  env?: RuntimeEnv;
  fetchImpl?: typeof fetch;
}

export async function summarizeConversation(
  input: SummarizeConversationInput,
  options: SummarizeConversationOptions = {}
): Promise<string> {
  const env = options.env ?? readProcessEnv();
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = env.QWEN_MODEL ?? DEFAULT_QWEN_MODEL;
  let text = "";

  for await (const event of streamQwenText(buildSummaryMessages(input), {
    apiKey: env.QWEN_API_KEY ?? env.DASHSCOPE_API_KEY,
    baseUrl: env.QWEN_BASE_URL ?? DEFAULT_QWEN_BASE_URL,
    model,
    mode: "fast",
    fetchImpl
  })) {
    if (event.type === "text") {
      text += event.text;
    }
  }

  return truncateSummary(formatSummary(text), input.maxChars ?? DEFAULT_SUMMARY_MAX_CHARS);
}

function buildSummaryMessages(input: SummarizeConversationInput): ProviderMessage[] {
  return [
    {
      role: "system",
      content:
        "你是会话压缩器。你的任务是把较早的对话压缩成后续模型可继续使用的上下文。只输出文本，不要调用工具，不要编造未出现的信息。"
    },
    {
      role: "user",
      content: buildSummaryPrompt(input)
    }
  ];
}

function buildSummaryPrompt(input: SummarizeConversationInput): string {
  const previous = input.previousSummary?.trim()
    ? `# 已有压缩摘要\n${input.previousSummary.trim()}\n\n`
    : "";

  return `${previous}# 待压缩的新增对话
${serializeMessages(input.messages)}

# 压缩要求
请把“已有压缩摘要”和“待压缩的新增对话”合并成一份新的会话压缩摘要。

必须保留：
- 用户明确需求、偏好、限制和后续修正。
- 已确认的关键事实、设计决策、接口约定和数据结构。
- 涉及的文件、模块、重要代码位置、RAG 文件结论和工具结果结论。
- 已遇到的错误、失败原因、修复方式和剩余风险。
- 当前正在推进的任务、已完成事项和下一步。

必须删除或压缩：
- 闲聊、重复解释和过时中间过程。
- 大段工具原始返回、base64、文件全文、重复 Markdown。
- 已被最近事实推翻的旧判断。

输出格式：
<summary>
用中文写最终摘要。不要写寒暄，不要解释压缩过程，不要提出问题。
</summary>`;
}

function serializeMessages(messages: ChatMessage[]): string {
  return messages
    .map((message, index) => {
      const attachments = summarizeAttachments(message);
      const content = message.content.trim() || "[empty]";
      const reasoning = message.reasoningContent?.trim()
        ? `\n[reasoning]\n${message.reasoningContent.trim()}`
        : "";
      return `## ${index + 1}. ${message.role} ${message.createdAt}
${content}${attachments}${reasoning}`;
    })
    .join("\n\n");
}

function summarizeAttachments(message: ChatMessage): string {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return "";

  return `\n[attachments]\n${attachments
    .map((attachment) =>
      [
        attachment.kind ?? "image",
        attachment.fileName,
        attachment.parseStatus ? `status=${attachment.parseStatus}` : undefined
      ]
        .filter(Boolean)
        .join(" · ")
    )
    .join("\n")}`;
}

function formatSummary(input: string): string {
  let summary = input.replace(/<analysis>[\s\S]*?<\/analysis>/g, "").trim();
  const match = summary.match(/<summary>([\s\S]*?)<\/summary>/);
  if (match?.[1]) {
    summary = match[1].trim();
  }
  return summary.replace(/\n{3,}/g, "\n\n").trim();
}

function truncateSummary(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars).trimEnd()}\n\n[摘要因长度限制已截断]`;
}
