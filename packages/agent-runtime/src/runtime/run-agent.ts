import type { AgentEvent, SearchSource, TokenUsage } from "@qianwen-agent/shared";
import {
  buildProviderMessages,
  type ProviderMessage,
  type ProviderToolCall
} from "../context/provider-messages";
import { streamQwenText } from "../providers/qwen/client";
import {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_MODEL
} from "../providers/qwen/constants";
import type { QwenTextStreamEvent } from "../providers/qwen/types";
import { createBuiltInToolRegister } from "../tools/built-ins";
import type { RuntimeTool, ToolContext } from "../tools/types";
import { readProcessEnv } from "./env";
import type { AgentRunInput, AgentRunResult, RunAgentOptions } from "./types";

const MAX_TOOL_ITERATIONS = 100;

export async function runAgent(
  input: AgentRunInput,
  options: RunAgentOptions = {}
): Promise<AgentRunResult> {
  const env = options.env ?? readProcessEnv();
  const fetchImpl = options.fetchImpl ?? fetch;
  const emit = async (event: AgentEvent) => {
    await options.onEvent?.(event);
  };
  const mode = input.mode ?? "fast";
  const messages = buildProviderMessages(input.messages, {
    conversationSummary: input.conversationSummary
  });
  const model = env.QWEN_MODEL ?? DEFAULT_QWEN_MODEL;
  const toolRegister = createBuiltInToolRegister();
  const toolDefinitions = toolRegister.definitions();
  const sources: SearchSource[] = [];
  let usage: TokenUsage | undefined;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const requestId = crypto.randomUUID();
    const requestStartedAt = Date.now();
    const toolCallParts = new Map<number, ToolCallParts>();
    let finishReason: string | undefined;
    let requestUsage: TokenUsage | undefined;

    await emit({
      type: "provider_request",
      requestId,
      iteration,
      model,
      mode,
      messages: sanitizeProviderMessagesForTrace(messages),
      tools: cloneJson(toolDefinitions)
    });

    for await (const event of streamQwenText(messages, {
      apiKey: env.QWEN_API_KEY ?? env.DASHSCOPE_API_KEY,
      baseUrl: env.QWEN_BASE_URL ?? DEFAULT_QWEN_BASE_URL,
      model,
      mode,
      tools: toolDefinitions,
      fetchImpl
    })) {
      if (event.type === "usage") {
        usage = event.usage;
        requestUsage = event.usage;
        continue;
      }

      if (event.type === "finish") {
        finishReason = event.reason;
        continue;
      }

      if (event.type === "tool_call_delta") {
        mergeToolCallPart(toolCallParts, event);
        continue;
      }

      if (event.type === "reasoning") {
        await emit({ type: "reasoning_delta", text: event.text });
        continue;
      }

      await emit({ type: "answer_delta", text: event.text });
    }

    await emit({
      type: "provider_response",
      requestId,
      iteration,
      finishReason,
      usage: requestUsage,
      durationMs: Date.now() - requestStartedAt
    });

    const toolCalls = toProviderToolCalls(toolCallParts);
    if (toolCalls.length === 0) {
      await emit({
        type: "done",
        runId: crypto.randomUUID(),
        usage
      });
      return { usage, sources };
    }

    messages.push({
      role: "assistant",
      content: null,
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      const result = await runToolCall(toolCall, messages, {
        env,
        fetchImpl,
        toolRegister,
        emit
      });
      sources.push(...result.sources);
    }
  }

  await emit({
    type: "error",
    message: "Agent stopped after reaching the tool iteration limit.",
    code: "tool_iteration_limit"
  });
  return { usage, sources };
}

interface ToolCallParts {
  id?: string;
  name?: string;
  arguments: string;
}

interface PreparedToolCall {
  toolCall: ProviderToolCall;
  toolName: string;
  input: unknown;
  tool?: RuntimeTool;
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

async function runToolCall(
  toolCall: ProviderToolCall,
  messages: ProviderMessage[],
  context: ToolContext & {
    toolRegister: ReturnType<typeof createBuiltInToolRegister>;
    emit: (event: AgentEvent) => Promise<void>;
  }
): Promise<{ sources: SearchSource[] }> {
  const prepared = prepareToolCall(toolCall, context.toolRegister);

  await context.emit({
    type: "tool_call_started",
    toolName: prepared.toolName,
    toolCallId: toolCall.id,
    input: prepared.input
  });

  const executed = await executePreparedToolCall(prepared, context);
  messages.push(toToolResultMessage(toolCall.id, executed.output));
  await finalizeToolCall(prepared, executed, context.emit);

  return {
    sources: extractSearchSources(executed.events)
  };
}

function prepareToolCall(
  toolCall: ProviderToolCall,
  toolRegister: ReturnType<typeof createBuiltInToolRegister>
): PreparedToolCall {
  const toolName = toolCall.function.name;
  return {
    toolCall,
    toolName,
    input: parseToolArguments(toolCall.function.arguments),
    tool: toolRegister.get(toolName)
  };
}

async function executePreparedToolCall(
  prepared: PreparedToolCall,
  context: ToolContext
): Promise<{ output: unknown; events: AgentEvent[] }> {
  if (!prepared.tool) {
    return {
      output: { error: `Unknown tool: ${prepared.toolName}` },
      events: []
    };
  }

  try {
    const output = await prepared.tool.execute(prepared.input, context);
    return {
      output,
      events: prepared.tool.toEvents?.(output, prepared.toolCall) ?? []
    };
  } catch (cause) {
    return {
      output: {
        error: cause instanceof Error ? cause.message : "Tool execution failed."
      },
      events: []
    };
  }
}

async function finalizeToolCall(
  prepared: PreparedToolCall,
  executed: { output: unknown; events: AgentEvent[] },
  emit: (event: AgentEvent) => Promise<void>
) {
  await emit({
    type: "tool_call_done",
    toolName: prepared.toolName,
    toolCallId: prepared.toolCall.id,
    output: summarizeToolOutput(prepared.tool, executed.output),
    rawOutput: executed.output
  });

  for (const event of executed.events) {
    await emit(event);
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

function summarizeToolOutput(tool: RuntimeTool | undefined, output: unknown): unknown {
  return tool?.summarize ? tool.summarize(output) : output;
}

function extractSearchSources(events: AgentEvent[]): SearchSource[] {
  return events.flatMap((event) =>
    event.type === "search_results" ? event.sources : []
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeProviderMessagesForTrace(messages: ProviderMessage[]): unknown[] {
  return cloneJson(messages).map((message) => {
    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map((part) =>
          part.type === "image_url"
            ? {
                ...part,
                image_url: {
                  url: "[image data url omitted]"
                }
              }
            : part
        )
      };
    }

    return message;
  });
}
