import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentChunk } from "./types";

const CHUNK_DIR = path.resolve(process.cwd(), "uploads/file-chunks");

export async function saveParsedChunks(
  attachmentId: string,
  chunks: DocumentChunk[]
): Promise<void> {
  await mkdir(CHUNK_DIR, { recursive: true });
  await writeFile(chunkPath(attachmentId), JSON.stringify(chunks), "utf8");
}

export async function loadParsedChunks(attachmentId: string): Promise<DocumentChunk[]> {
  const raw = await readFile(chunkPath(attachmentId), "utf8");
  const value = JSON.parse(raw) as unknown;
  return Array.isArray(value) ? (value as DocumentChunk[]) : [];
}

function chunkPath(attachmentId: string): string {
  return path.join(CHUNK_DIR, `${attachmentId}.json`);
}
