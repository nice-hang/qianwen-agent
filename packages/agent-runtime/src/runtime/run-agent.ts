import type { AgentEvent, TokenUsage } from "@qianwen-agent/shared";
import { buildProviderMessages } from "../context/provider-messages";
import { streamQwenText } from "../providers/qwen/client";
import { DEFAULT_QWEN_BASE_URL, DEFAULT_QWEN_MODEL } from "../providers/qwen/constants";
import { readProcessEnv } from "./env";
import type { AgentRunInput, RunAgentOptions } from "./types";

export async function* runAgent(
  input: AgentRunInput,
  options: RunAgentOptions = {}
): AsyncIterable<AgentEvent> {
  const env = options.env ?? readProcessEnv();
  let usage: TokenUsage | undefined;

  for await (const event of streamQwenText(buildProviderMessages(input.messages), {
    apiKey: env.QWEN_API_KEY ?? env.DASHSCOPE_API_KEY,
    baseUrl: env.QWEN_BASE_URL ?? DEFAULT_QWEN_BASE_URL,
    model: env.QWEN_MODEL ?? DEFAULT_QWEN_MODEL,
    mode: input.mode ?? "fast",
    fetchImpl: options.fetchImpl ?? fetch
  })) {
    if (event.type === "usage") {
      usage = event.usage;
      continue;
    }

    if (event.type === "reasoning") {
      yield { type: "reasoning_delta", text: event.text };
      continue;
    }

    yield { type: "answer_delta", text: event.text };
  }

  yield {
    type: "done",
    runId: crypto.randomUUID(),
    usage
  };
}
