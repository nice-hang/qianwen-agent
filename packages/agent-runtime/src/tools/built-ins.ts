import { createToolRegister } from "./register";
import type { RuntimeTool } from "./types";
import { webFetchTool } from "./web-fetch";
import { webSearchTool } from "./web-search";

export const builtInTools = {
  web_search: webSearchTool,
  web_fetch: webFetchTool
} satisfies Record<string, RuntimeTool>;

export type BuiltInToolName = keyof typeof builtInTools;

export function createBuiltInToolRegister() {
  return createToolRegister(Object.values(builtInTools));
}
