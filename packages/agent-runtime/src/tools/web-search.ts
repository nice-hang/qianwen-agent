import type { SearchSource } from "@qianwen-agent/shared";
import type { BuiltInTool, WebSearchOutput } from "./types";

interface TavilySearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
  }>;
}

export const webSearchTool: BuiltInTool<WebSearchOutput> = {
  name: "web_search",
  definition: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for fresh or verifiable information. Use this for current events, weather, prices, policies, schedules, or claims that need sources.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A concise search query."
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  async execute(input, context) {
    const parsed = parseInput(input);
    const query = parsed.query.trim();
    if (!query) {
      return { query, sources: [], note: "Search query is empty." };
    }

    const tavilyKey = context.env.TAVILY_API_KEY;
    if (!tavilyKey) {
      return {
        query,
        sources: [],
        note:
          "No search provider is configured. Set TAVILY_API_KEY to enable web_search."
      };
    }

    const response = await context.fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        max_results: 8,
        include_answer: false,
        include_raw_content: false
      })
    });

    if (!response.ok) {
      return {
        query,
        sources: [],
        note: `Search provider failed with status ${response.status}.`
      };
    }

    const payload = (await response.json()) as TavilySearchResponse;
    return {
      query,
      sources: (payload.results ?? []).flatMap((result, index) =>
        toSearchSource(result, index)
      )
    };
  },
  summarize(output) {
    return {
      query: output.query,
      sourcesCount: output.sources.length,
      sources: output.sources,
      note: output.note
    };
  },
  toEvents(output, toolCall) {
    return [
      {
        type: "search_results",
        toolCallId: toolCall.id,
        query: output.query,
        sources: output.sources
      }
    ];
  }
};

function parseInput(input: unknown): { query: string } {
  if (
    typeof input === "object" &&
    input !== null &&
    "query" in input &&
    typeof input.query === "string"
  ) {
    return { query: input.query };
  }

  return { query: "" };
}

function toSearchSource(
  result: NonNullable<TavilySearchResponse["results"]>[number],
  index: number
): SearchSource[] {
  if (!result.title || !result.url) return [];

  return [
    {
      id: `search-${index + 1}`,
      title: result.title,
      url: result.url,
      snippet: result.content,
      siteName: readSiteName(result.url),
      publishedAt: result.published_date
    }
  ];
}

function readSiteName(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
