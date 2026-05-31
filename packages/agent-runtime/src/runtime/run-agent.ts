import type { AgentEvent, TokenUsage } from "@qianwen-agent/shared";
import {
  buildProviderMessages,
  type ProviderMessage,
  type ProviderToolCall
} from "../context/provider-messages";
import { streamQwenText } from "../providers/qwen/client";
import { DEFAULT_QWEN_BASE_URL, DEFAULT_QWEN_MODEL } from "../providers/qwen/constants";
import type { QwenTextStreamEvent } from "../providers/qwen/types";
import { builtInTools } from "../tools/built-ins";
import type { BuiltInTool, WebSearchOutput } from "../tools/types";
import { readProcessEnv } from "./env";
import type { AgentRunInput, RunAgentOptions } from "./types";

const MAX_TOOL_ITERATIONS = 3;

export async function* runAgent(
  input: AgentRunInput,
  options: RunAgentOptions = {}
): AsyncIterable<AgentEvent> {
  const env = options.env ?? readProcessEnv();
  const fetchImpl = options.fetchImpl ?? fetch;
  let usage: TokenUsage | undefined;
  const messages = buildProviderMessages(input.messages);
  const toolDefinitions = Object.values(builtInTools).map((tool) => tool.definition);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const toolCallParts = new Map<number, ToolCallParts>();

    for await (const event of streamQwenText(messages, {
      apiKey: env.QWEN_API_KEY ?? env.DASHSCOPE_API_KEY,
      baseUrl: env.QWEN_BASE_URL ?? DEFAULT_QWEN_BASE_URL,
      model: env.QWEN_MODEL ?? DEFAULT_QWEN_MODEL,
      mode: input.mode ?? "fast",
      tools: toolDefinitions,
      fetchImpl
    })) {
      if (event.type === "usage") {
        usage = event.usage;
        continue;
      }

      if (event.type === "tool_call_delta") {
        mergeToolCallPart(toolCallParts, event);
        continue;
      }

      if (event.type === "finish") {
        continue;
      }

      if (event.type === "reasoning") {
        yield { type: "reasoning_delta", text: event.text };
        continue;
      }

      yield { type: "answer_delta", text: event.text };
    }

    const toolCalls = toProviderToolCalls(toolCallParts);
    if (toolCalls.length === 0) {
      yield {
        type: "done",
        runId: crypto.randomUUID(),
        usage
      };
      return;
    }

    messages.push({
      role: "assistant",
      content: null,
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      yield* executeToolCall(toolCall, messages, {
        env,
        fetchImpl
      });
    }
  }

  yield {
    type: "error",
    message: "Agent stopped after reaching the tool iteration limit.",
    code: "tool_iteration_limit"
  };
}

interface ToolCallParts {
  id?: string;
  name?: string;
  arguments: string;
}

function mergeToolCallPart(
  calls: Map<number, ToolCallParts>,
  event: Extract<QwenTextStreamEvent, { type: "tool_call_delta" }>
) {
  const current = calls.get(event.index) ?? { arguments: "" };
  current.id = event.id ?? current.id;
  current.name = event.name ?? current.name;
  current.arguments += event.argumentsDelta ?? "";
  calls.set(event.index, current);
}

function toProviderToolCalls(calls: Map<number, ToolCallParts>): ProviderToolCall[] {
  return [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, call]) => {
      if (!call.name) return [];

      return [
        {
          id: call.id ?? `tool-call-${crypto.randomUUID()}`,
          type: "function" as const,
          function: {
            name: call.name,
            arguments: call.arguments || "{}"
          }
        }
      ];
    });
}

async function* executeToolCall(
  toolCall: ProviderToolCall,
  messages: ProviderMessage[],
  context: {
    env: Record<string, string | undefined>;
    fetchImpl: typeof fetch;
  }
): AsyncIterable<AgentEvent> {
  const toolName = toolCall.function.name;
  const input = parseToolArguments(toolCall.function.arguments);
  const tool = builtInTools[toolName as keyof typeof builtInTools] as
    | BuiltInTool
    | undefined;

  yield {
    type: "tool_call_started",
    toolName,
    toolCallId: toolCall.id,
    input
  };

  if (!tool) {
    const output = { error: `Unknown tool: ${toolName}` };
    messages.push(toToolResultMessage(toolCall.id, output));
    yield {
      type: "tool_call_done",
      toolName,
      toolCallId: toolCall.id,
      output
    };
    return;
  }

  try {
    const output = await tool.execute(input, context);
    messages.push(toToolResultMessage(toolCall.id, output));
    yield {
      type: "tool_call_done",
      toolName,
      toolCallId: toolCall.id,
      output: summarizeToolOutput(output)
    };

    if (toolName === "web_search") {
      const searchOutput = output as WebSearchOutput;
      yield {
        type: "search_results",
        toolCallId: toolCall.id,
        query: searchOutput.query,
        sources: searchOutput.sources
      };
    }
  } catch (cause) {
    const output = {
      error: cause instanceof Error ? cause.message : "Tool execution failed."
    };
    messages.push(toToolResultMessage(toolCall.id, output));
    yield {
      type: "tool_call_done",
      toolName,
      toolCallId: toolCall.id,
      output
    };
  }
}

function parseToolArguments(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return {};
  }
}

function toToolResultMessage(toolCallId: string, output: unknown): ProviderMessage {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: JSON.stringify(output)
  };
}

function summarizeToolOutput(output: unknown): unknown {
  if (
    typeof output === "object" &&
    output !== null &&
    "text" in output &&
    typeof output.text === "string"
  ) {
    return {
      ...output,
      text: output.text.slice(0, 1000)
    };
  }

  if (isWebSearchOutput(output)) {
    return {
      query: output.query,
      sourcesCount: output.sources.length,
      sources: output.sources
    };
  }

  return output;
}

function isWebSearchOutput(output: unknown): output is WebSearchOutput {
  return (
    typeof output === "object" &&
    output !== null &&
    "query" in output &&
    "sources" in output &&
    Array.isArray((output as { sources?: unknown }).sources)
  );
}
