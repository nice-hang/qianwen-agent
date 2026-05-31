import type { SearchSource } from "@qianwen-agent/shared";
import type { QwenToolDefinition } from "../providers/qwen/types";
import type { RuntimeEnv } from "../runtime/types";

export interface ToolContext {
  env: RuntimeEnv;
  fetchImpl: typeof fetch;
}

export interface BuiltInTool<Output = unknown> {
  definition: QwenToolDefinition;
  execute: (input: unknown, context: ToolContext) => Promise<Output>;
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
