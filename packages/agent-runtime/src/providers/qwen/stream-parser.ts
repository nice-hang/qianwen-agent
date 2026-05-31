import type { QwenStreamChunk, QwenTextStreamEvent } from "./types";
import { toTokenUsage } from "./usage";

export function* parseOpenAiCompatibleChunks(
  input: string,
  model: string
): Iterable<QwenTextStreamEvent> {
  // Qwen OpenAI-compatible stream 的文本在 choices[0].delta.content，usage 在末尾 chunk。
  for (const block of input.split(/\n\n+/)) {
    for (const line of block.split(/\n/)) {
      if (!line.startsWith("data:")) continue;

      const data = line.slice("data:".length).trim();
      if (!data || data === "[DONE]") continue;

      const chunk = JSON.parse(data) as QwenStreamChunk;
      const choice = chunk.choices?.[0];
      const reasoning = choice?.delta?.reasoning_content;
      const text = choice?.delta?.content;
      const toolCalls = choice?.delta?.tool_calls ?? [];

      if (reasoning) yield { type: "reasoning", text: reasoning };
      if (text) yield { type: "text", text };
      for (const toolCall of toolCalls) {
        yield {
          type: "tool_call_delta",
          index: toolCall.index,
          id: toolCall.id,
          name: toolCall.function?.name,
          argumentsDelta: toolCall.function?.arguments
        };
      }
      if (choice?.finish_reason) {
        yield { type: "finish", reason: choice.finish_reason };
      }
      if (chunk.usage) {
        yield { type: "usage", usage: toTokenUsage(chunk.usage, model) };
      }
    }
  }
}
