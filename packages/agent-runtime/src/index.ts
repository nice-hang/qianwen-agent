import type { AgentEvent, ChatMessage } from "@qianwen-agent/shared";

type RuntimeEnv = Record<string, string | undefined>;

export interface RunAgentOptions {
  env?: RuntimeEnv;
  fetchImpl?: typeof fetch;
}

export interface AgentRunInput {
  conversationId: string;
  messages: ChatMessage[];
}

interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
}

interface QwenStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";

export async function* runAgent(
  input: AgentRunInput,
  options: RunAgentOptions = {}
): AsyncIterable<AgentEvent> {
  const env = options.env ?? readProcessEnv();

  for await (const text of streamQwenText(buildProviderMessages(input.messages), {
    apiKey: env.QWEN_API_KEY ?? env.DASHSCOPE_API_KEY,
    baseUrl: env.QWEN_BASE_URL ?? DEFAULT_BASE_URL,
    model: env.QWEN_MODEL ?? DEFAULT_MODEL,
    fetchImpl: options.fetchImpl ?? fetch
  })) {
    yield { type: "answer_delta", text };
  }

  yield {
    type: "done",
    runId: crypto.randomUUID()
  };
}

function readProcessEnv(): RuntimeEnv {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnv };
  };

  return globalWithProcess.process?.env ?? {};
}

function buildProviderMessages(messages: ChatMessage[]): ProviderMessage[] {
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

async function* streamQwenText(
  messages: ProviderMessage[],
  options: {
  apiKey?: string;
  baseUrl: string;
  model: string;
  fetchImpl: typeof fetch;
  }
): AsyncIterable<string> {
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
        stream: true
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

    for (const text of parseOpenAiCompatibleChunks(ready)) {
      yield text;
    }
  }

  for (const text of parseOpenAiCompatibleChunks(buffer)) {
    yield text;
  }
}

function* parseOpenAiCompatibleChunks(input: string): Iterable<string> {
  // Qwen OpenAI-compatible stream 的文本在 choices[0].delta.content。
  for (const block of input.split(/\n\n+/)) {
    for (const line of block.split(/\n/)) {
      if (!line.startsWith("data:")) continue;

      const data = line.slice("data:".length).trim();
      if (!data || data === "[DONE]") continue;

      const chunk = JSON.parse(data) as QwenStreamChunk;
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
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
