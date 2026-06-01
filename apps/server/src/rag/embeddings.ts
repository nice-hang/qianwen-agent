const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_EMBEDDING_MODEL = "text-embedding-v4";

export interface EmbeddingUsage {
  model: string;
  inputTokens?: number;
  totalTokens?: number;
}

export async function embedTexts(
  texts: string[],
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<{ vectors: number[][]; usage: EmbeddingUsage }> {
  if (texts.length === 0) {
    return {
      vectors: [],
      usage: { model: options.env?.QWEN_EMBEDDING_MODEL ?? DEFAULT_QWEN_EMBEDDING_MODEL }
    };
  }

  const env = options.env ?? process.env;
  const apiKey = env.QWEN_API_KEY ?? env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error("QWEN_API_KEY or DASHSCOPE_API_KEY is required for embeddings.");
  }

  const model = env.QWEN_EMBEDDING_MODEL ?? DEFAULT_QWEN_EMBEDDING_MODEL;
  const baseUrl = env.QWEN_BASE_URL ?? DEFAULT_QWEN_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: texts
    })
  });

  if (!response.ok) {
    const detail = await safeReadError(response);
    throw new Error(
      `Qwen embedding request failed: ${response.status}${detail ? ` ${detail}` : ""}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ index?: number; embedding?: number[] }>;
    usage?: {
      prompt_tokens?: number;
      total_tokens?: number;
    };
  };
  const vectors = [...(payload.data ?? [])]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((item) => item.embedding ?? []);

  if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) {
    throw new Error("Qwen embedding response did not include all vectors.");
  }

  return {
    vectors,
    usage: {
      model,
      inputTokens: payload.usage?.prompt_tokens,
      totalTokens: payload.usage?.total_tokens
    }
  };
}

async function safeReadError(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
