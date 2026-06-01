import path from "node:path";
import * as lancedb from "@lancedb/lancedb";
import type { Table } from "@lancedb/lancedb";
import type { IndexedDocumentChunk, RetrievedDocumentChunk } from "./types";

const DB_DIR = path.resolve(process.cwd(), "data/lancedb");
const TABLE_NAME = "document_chunks";
const CONTENT_INDEX_NAME = "content_idx";

let tablePromise: Promise<Table | null> | undefined;

export async function addChunksToLanceDb(chunks: IndexedDocumentChunk[]): Promise<void> {
  if (chunks.length === 0) return;
  const { table, created } = await getOrCreateTable(chunks);
  if (!created) {
    await table.add(chunks as unknown as Record<string, unknown>[]);
  }
  await ensureFullTextIndex(table);
}

export async function countIndexedChunks(input: {
  conversationId: string;
  attachmentId: string;
}): Promise<number> {
  const table = await openExistingTable();
  if (!table) return 0;

  return table.countRows(
    `conversationId = '${escapeSql(input.conversationId)}' AND attachmentId = '${escapeSql(
      input.attachmentId
    )}'`
  );
}

export async function searchDocumentChunks(input: {
  conversationId: string;
  query: string;
  vector: number[];
  limit: number;
}): Promise<RetrievedDocumentChunk[]> {
  const table = await openExistingTable();
  if (!table) return [];

  await ensureFullTextIndex(table);
  const predicate = `conversationId = '${escapeSql(input.conversationId)}'`;

  try {
    const reranker = await lancedb.rerankers.RRFReranker.create();
    const rows = (await table
      .vectorSearch(input.vector)
      .column("vector")
      .fullTextSearch(input.query, { columns: "content" })
      .rerank(reranker)
      .where(predicate)
      .limit(input.limit)
      .toArray()) as Array<IndexedDocumentChunk & { _distance?: number; _score?: number }>;

    return rows.map(rowToRetrievedChunk);
  } catch {
    return searchDocumentChunksByVector(table, {
      conversationId: input.conversationId,
      vector: input.vector,
      limit: input.limit
    });
  }
}

async function searchDocumentChunksByVector(
  table: Table,
  input: {
    conversationId: string;
    vector: number[];
    limit: number;
  }
): Promise<RetrievedDocumentChunk[]> {
  const rows = (await table
    .vectorSearch(input.vector)
    .column("vector")
    .where(`conversationId = '${escapeSql(input.conversationId)}'`)
    .limit(input.limit)
    .toArray()) as Array<IndexedDocumentChunk & { _distance?: number }>;

  return rows.map(rowToRetrievedChunk);
}

async function getOrCreateTable(
  seedRows: IndexedDocumentChunk[]
): Promise<{ table: Table; created: boolean }> {
  const existing = await openExistingTable();
  if (existing) return { table: existing, created: false };

  const db = await lancedb.connect(DB_DIR);
  const table = await db.createTable(TABLE_NAME, seedRows as unknown as Record<string, unknown>[], {
    mode: "create",
    existOk: true
  });
  tablePromise = Promise.resolve(table);
  return { table, created: true };
}

async function openExistingTable(): Promise<Table | null> {
  if (tablePromise) return tablePromise;

  tablePromise = (async () => {
    const db = await lancedb.connect(DB_DIR);
    const tables = await db.tableNames();
    if (!tables.includes(TABLE_NAME)) return null;
    return db.openTable(TABLE_NAME);
  })();

  return tablePromise;
}

async function ensureFullTextIndex(table: Table): Promise<void> {
  const indices = await table.listIndices();
  const contentIndex = indices.find(
    (index) => index.name === CONTENT_INDEX_NAME || index.columns.includes("content")
  );

  if (!contentIndex) {
    await table.createIndex("content", {
      config: lancedb.Index.fts({
        baseTokenizer: "ngram",
        ngramMinLength: 2,
        ngramMaxLength: 8,
        lowercase: true
      })
    });
    return;
  }

  const stats = await table.indexStats(contentIndex.name);
  if (stats && stats.numUnindexedRows > 0) {
    await table.optimize();
  }
}

function rowToRetrievedChunk(
  row: IndexedDocumentChunk & { _distance?: number; _score?: number }
): RetrievedDocumentChunk {
  return {
    ...row,
    score: row._score ?? row._distance
  };
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
