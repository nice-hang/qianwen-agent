import type { ChatAttachment } from "@qianwen-agent/shared";
import { embedTexts } from "./embeddings";
import { addChunksToLanceDb, countIndexedChunks } from "./lancedb-store";
import { loadParsedChunks } from "./parsed-chunks";
import type { IndexedDocumentChunk } from "./types";

const EMBEDDING_BATCH_SIZE = 16;

export async function ensureFileIndexed(input: {
  attachment: ChatAttachment & { storagePath: string };
  conversationId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ indexed: boolean; chunkCount: number; embeddingMs?: number }> {
  if (input.attachment.kind !== "file" || input.attachment.parseStatus !== "ready") {
    return { indexed: false, chunkCount: 0 };
  }

  const existingCount = await countIndexedChunks({
    conversationId: input.conversationId,
    attachmentId: input.attachment.id
  });
  if (existingCount > 0) {
    return { indexed: false, chunkCount: existingCount };
  }

  const chunks = await loadParsedChunks(input.attachment.id);
  const indexedChunks: IndexedDocumentChunk[] = [];
  const embeddingStartedAt = Date.now();

  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    const { vectors } = await embedTexts(
      batch.map((chunk) => chunk.content),
      { fetchImpl: input.fetchImpl }
    );

    indexedChunks.push(
      ...batch.map((chunk, index) => ({
        ...chunk,
        conversationId: input.conversationId,
        vector: vectors[index] ?? [],
        createdAt: new Date().toISOString()
      }))
    );
  }

  await addChunksToLanceDb(indexedChunks);

  return {
    indexed: true,
    chunkCount: indexedChunks.length,
    embeddingMs: Date.now() - embeddingStartedAt
  };
}
