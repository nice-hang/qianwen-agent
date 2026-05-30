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
      const reasoning = chunk.choices?.[0]?.delta?.reasoning_content;
      const text = chunk.choices?.[0]?.delta?.content;
      if (reasoning) yield { type: "reasoning", text: reasoning };
      if (text) yield { type: "text", text };
      if (chunk.usage) {
        yield { type: "usage", usage: toTokenUsage(chunk.usage, model) };
      }
    }
  }
}
