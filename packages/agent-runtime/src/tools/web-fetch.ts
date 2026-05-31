import type { BuiltInTool, WebFetchOutput } from "./types";

const MAX_FETCH_CHARS = 8000;

export const webFetchTool: BuiltInTool<WebFetchOutput> = {
  definition: {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch readable text from one web page when search snippets are not enough. Use only for URLs returned by web_search.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch."
          }
        },
        required: ["url"],
        additionalProperties: false
      }
    }
  },
  async execute(input, context) {
    const parsed = parseInput(input);
    const url = parsed.url.trim();
    if (!url) {
      return { url, text: "", note: "URL is empty." };
    }

    if (!/^https?:\/\//i.test(url)) {
      return { url, text: "", note: "Only http and https URLs can be fetched." };
    }

    const response = await context.fetchImpl(url, {
      headers: {
        accept: "text/html,text/plain;q=0.9,*/*;q=0.1"
      }
    });

    if (!response.ok) {
      return {
        url,
        text: "",
        note: `Fetch failed with status ${response.status}.`
      };
    }

    const raw = await response.text();
    const title = readTitle(raw);
    return {
      url,
      title,
      text: htmlToText(raw).slice(0, MAX_FETCH_CHARS)
    };
  }
};

function parseInput(input: unknown): { url: string } {
  if (
    typeof input === "object" &&
    input !== null &&
    "url" in input &&
    typeof input.url === "string"
  ) {
    return { url: input.url };
  }

  return { url: "" };
}

function readTitle(input: string): string | undefined {
  const match = input.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(stripTags(match[1]).trim()) : undefined;
}

function htmlToText(input: string): string {
  return decodeEntities(
    stripTags(
      input
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<(br|p|div|section|article|h[1-6]|li|tr)\b[^>]*>/gi, "\n")
    )
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ");
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
