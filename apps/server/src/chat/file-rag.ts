import type { ChatAttachment, SearchSource } from "@qianwen-agent/shared";
import { ensureFileIndexed } from "../rag/indexing";
import { retrieveFileContext } from "../rag/retrieval";

type RecordTrace = (type: string, data?: unknown) => Promise<unknown>;

export interface FileRagContext {
  sources: SearchSource[];
  contextText: string;
}

export async function prepareFileRagContext(input: {
  attachments: Array<ChatAttachment & { storagePath: string }>;
  conversationId: string;
  query: string;
  recordTrace: RecordTrace;
}): Promise<FileRagContext> {
  await indexReadyFileAttachments(input);

  if (!input.query) {
    return { sources: [], contextText: "" };
  }

  const retrievalStartedAt = Date.now();
  await input.recordTrace("rag_retrieval_started", {
    conversationId: input.conversationId,
    query: input.query
  });

  try {
    const retrieval = await retrieveFileContext({
      conversationId: input.conversationId,
      query: input.query
    });
    await input.recordTrace("rag_retrieval_done", {
      conversationId: input.conversationId,
      query: input.query,
      chunkCount: retrieval.chunks.length,
      sourcesCount: retrieval.sources.length,
      injectedChars: retrieval.contextText.length,
      embeddingMs: retrieval.embeddingMs,
      durationMs: Date.now() - retrievalStartedAt,
      chunks: retrieval.chunks.map((chunk) => ({
        id: chunk.id,
        attachmentId: chunk.attachmentId,
        fileName: chunk.fileName,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        score: chunk.score,
        preview: chunk.content.slice(0, 200)
      }))
    });

    return {
      sources: retrieval.sources,
      contextText: retrieval.contextText
    };
  } catch (error) {
    await input.recordTrace("rag_retrieval_error", {
      conversationId: input.conversationId,
      query: input.query,
      message: error instanceof Error ? error.message : "RAG retrieval failed"
    });
    return { sources: [], contextText: "" };
  }
}

async function indexReadyFileAttachments(input: {
  attachments: Array<ChatAttachment & { storagePath: string }>;
  conversationId: string;
  recordTrace: RecordTrace;
}): Promise<void> {
  const fileAttachments = input.attachments.filter(
    (attachment) => attachment.kind === "file"
  );

  for (const attachment of fileAttachments) {
    await input.recordTrace("file_index_started", {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      parseStatus: attachment.parseStatus
    });
    try {
      const indexed = await ensureFileIndexed({
        attachment,
        conversationId: input.conversationId
      });
      await input.recordTrace("file_index_done", {
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        indexed: indexed.indexed,
        chunkCount: indexed.chunkCount,
        embeddingMs: indexed.embeddingMs
      });
    } catch (error) {
      await input.recordTrace("file_index_error", {
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        message: error instanceof Error ? error.message : "File index failed"
      });
    }
  }
}
