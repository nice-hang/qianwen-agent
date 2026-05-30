import type { ProviderMessage } from "../../context/provider-messages";
import { parseOpenAiCompatibleChunks } from "./stream-parser";
import type { QwenTextStreamEvent } from "./types";

const DEFAULT_THINKING_BUDGET = 500;

export async function* streamQwenText(
  messages: ProviderMessage[],
  options: {
    apiKey?: string;
    baseUrl: string;
    model: string;
    mode: "fast" | "deep";
    fetchImpl: typeof fetch;
  }
): AsyncIterable<QwenTextStreamEvent> {
  // 没有密钥时允许 Server 启动，但真实聊天请求会明确失败。
  if (!options.apiKey) {
    throw new Error("QWEN_API_KEY or DASHSCOPE_API_KEY is required for chat.");
  }

  const response = await options.fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        enable_thinking: options.mode === "deep",
        ...(options.mode === "deep"
          ? { thinking_budget: DEFAULT_THINKING_BUDGET }
          : {})
      })
    }
  );

  if (!response.ok || !response.body) {
    const detail = await safeReadError(response);
    throw new Error(
      `Qwen request failed: ${response.status}${detail ? ` ${detail}` : ""}`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // SSE 块可能被网络切开，所以保留未完整到达的尾部 buffer。
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const boundary = buffer.lastIndexOf("\n\n");
    if (boundary === -1) continue;

    const ready = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);

    for (const event of parseOpenAiCompatibleChunks(ready, options.model)) {
      yield event;
    }
  }

  for (const event of parseOpenAiCompatibleChunks(buffer, options.model)) {
    yield event;
  }
}

async function safeReadError(response: Response): Promise<string> {
  // 错误 body 只是尽力读取；真正可靠的信号仍然是状态码。
  try {
    return await response.text();
  } catch {
    return "";
  }
}
