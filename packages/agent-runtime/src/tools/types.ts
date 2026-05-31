import type { AgentEvent, SearchSource } from "@qianwen-agent/shared";
import type { QwenToolDefinition } from "../providers/qwen/types";
import type { RuntimeEnv } from "../runtime/types";
import type { ProviderToolCall } from "../context/provider-messages";

export interface ToolContext {
  env: RuntimeEnv;
  fetchImpl: typeof fetch;
}

export interface RuntimeTool {
  name: string;
  definition: QwenToolDefinition;
  execute: (input: unknown, context: ToolContext) => Promise<unknown>;
  summarize?: (output: any) => unknown;
  toEvents?: (output: any, toolCall: ProviderToolCall) => AgentEvent[];
}

export interface BuiltInTool<Output = unknown> extends RuntimeTool {
  execute: (input: unknown, context: ToolContext) => Promise<Output>;
  summarize?: (output: Output) => unknown;
  toEvents?: (output: Output, toolCall: ProviderToolCall) => AgentEvent[];
}

export interface WebSearchInput {
  query: string;
}

export interface WebSearchOutput {
  query: string;
  sources: SearchSource[];
  note?: string;
}

export interface WebFetchInput {
  url: string;
}

export interface WebFetchOutput {
  url: string;
  title?: string;
  text: string;
  note?: string;
}
