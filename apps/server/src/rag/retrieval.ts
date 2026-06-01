import type { SearchSource } from "@qianwen-agent/shared";
import { embedTexts } from "./embeddings";
import { searchDocumentChunks } from "./lancedb-store";
import type { RetrievedDocumentChunk } from "./types";

const DEFAULT_TOP_K = 5;
const MAX_CONTEXT_CHARS = 12000;

export interface FileRetrievalResult {
  chunks: RetrievedDocumentChunk[];
  sources: SearchSource[];
  contextText: string;
  embeddingMs: number;
}

export async function retrieveFileContext(input: {
  conversationId: string;
  query: string;
  fetchImpl?: typeof fetch;
  topK?: number;
}): Promise<FileRetrievalResult> {
  if (!input.query.trim()) {
    return { chunks: [], sources: [], contextText: "", embeddingMs: 0 };
  }

  const embeddingStartedAt = Date.now();
  const { vectors } = await embedTexts([input.query], { fetchImpl: input.fetchImpl });
  const embeddingMs = Date.now() - embeddingStartedAt;
  const chunks = await searchDocumentChunks({
    conversationId: input.conversationId,
    query: input.query,
    vector: vectors[0] ?? [],
    limit: input.topK ?? DEFAULT_TOP_K
  });
  const selected = fitChunks(chunks, MAX_CONTEXT_CHARS);

  return {
    chunks: selected,
    sources: selected.map(chunkToSource),
    contextText: buildContextText(selected),
    embeddingMs
  };
}

export function injectFileContextIntoLastUserMessage<T extends { role: string; content: string }>(
  messages: T[],
  contextText: string
): T[] {
  if (!contextText.trim()) return messages;

  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }

  if (lastUserIndex === -1) return messages;

  return messages.map((message, index) =>
    index === lastUserIndex
      ? {
          ...message,
          content: `${contextText}\n\n用户问题：\n${message.content}`
        }
      : message
  );
}

function fitChunks(
  chunks: RetrievedDocumentChunk[],
  maxChars: number
): RetrievedDocumentChunk[] {
  const selected: RetrievedDocumentChunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    if (used + chunk.content.length > maxChars && selected.length > 0) break;
    selected.push(chunk);
    used += chunk.content.length;
  }

  return selected;
}

function buildContextText(chunks: RetrievedDocumentChunk[]): string {
  if (chunks.length === 0) return "";

  const parts = chunks.map((chunk, index) => {
    const location = chunk.pageNumber
      ? `第 ${chunk.pageNumber} 页 / chunk ${chunk.chunkIndex + 1}`
      : `chunk ${chunk.chunkIndex + 1}`;
    return `[文件片段 ${index + 1}]\n文件：${chunk.fileName}\n位置：${location}\n内容：\n${chunk.content}`;
  });

  return [
    "以下是从用户上传文件中检索到的相关片段。回答时优先依据这些片段；如果片段不足以回答，请说明缺少信息。",
    ...parts
  ].join("\n\n");
}

function chunkToSource(chunk: RetrievedDocumentChunk): SearchSource {
  const location = chunk.pageNumber
    ? `第 ${chunk.pageNumber} 页`
    : `chunk ${chunk.chunkIndex + 1}`;

  return {
    id: `file:${chunk.attachmentId}:${chunk.chunkIndex}`,
    title: `${chunk.fileName} · ${location}`,
    url: `/api/attachments/${chunk.attachmentId}/file`,
    siteName: "上传文件",
    snippet: chunk.content.slice(0, 240)
  };
}
