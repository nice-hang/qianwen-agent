import type { QwenToolDefinition } from "../providers/qwen/types";
import type { RuntimeTool } from "./types";

export interface ToolRegister {
  definitions: () => QwenToolDefinition[];
  get: (name: string) => RuntimeTool | undefined;
}

export function createToolRegister(tools: RuntimeTool[]): ToolRegister {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    definitions: () => tools.map((tool) => tool.definition),
    get: (name) => byName.get(name)
  };
}
