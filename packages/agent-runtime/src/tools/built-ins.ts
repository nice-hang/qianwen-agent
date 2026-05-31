import type { BuiltInTool } from "./types";
import { webFetchTool } from "./web-fetch";
import { webSearchTool } from "./web-search";

export const builtInTools = {
  web_search: webSearchTool,
  web_fetch: webFetchTool
} satisfies Record<string, BuiltInTool<unknown>>;

export type BuiltInToolName = keyof typeof builtInTools;
