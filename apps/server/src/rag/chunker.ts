import type { DocumentChunk, ParsedDocument } from "./types";

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 120;

export function chunkParsedDocument(input: {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  document: ParsedDocument;
  chunkSize?: number;
  overlap?: number;
}): DocumentChunk[] {
  const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = input.overlap ?? DEFAULT_OVERLAP;
  const chunks: DocumentChunk[] = [];

  for (const page of input.document.pages.length
    ? input.document.pages
    : [{ text: input.document.text }]) {
    const text = normalizeText(page.text);
    if (!text) continue;

    for (const content of splitText(text, chunkSize, overlap)) {
      chunks.push({
        id: `${input.attachmentId}-${chunks.length}`,
        attachmentId: input.attachmentId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        chunkIndex: chunks.length,
        pageNumber: page.pageNumber,
        content
      });
    }
  }

  return chunks;
}

function splitText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + chunkSize, text.length);
    const end = findSoftBoundary(text, start, hardEnd);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function findSoftBoundary(text: string, start: number, hardEnd: number): number {
  if (hardEnd >= text.length) return text.length;

  const slice = text.slice(start, hardEnd);
  const candidates = ["\n\n", "\n", "。", "；", ";", ".", " "];
  let best = -1;

  for (const boundary of candidates) {
    const index = slice.lastIndexOf(boundary);
    if (index > best && index > slice.length * 0.55) {
      best = index + boundary.length;
    }
  }

  return best > 0 ? start + best : hardEnd;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
