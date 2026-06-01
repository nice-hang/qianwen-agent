import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type { ParsedDocument } from "./types";

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json"
]);

export const SUPPORTED_FILE_MIME_TYPES = new Set([
  ...TEXT_MIME_TYPES,
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export async function parseStoredFile(input: {
  storagePath: string;
  mimeType: string;
}): Promise<ParsedDocument> {
  if (TEXT_MIME_TYPES.has(input.mimeType)) {
    const text = await readFile(input.storagePath, "utf8");
    return {
      text,
      pages: [{ text }]
    };
  }

  if (input.mimeType === "application/pdf") {
    return parsePdf(input.storagePath);
  }

  if (
    input.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ path: input.storagePath });
    return {
      text: result.value,
      pages: [{ text: result.value }]
    };
  }

  throw new Error(`Unsupported file type: ${input.mimeType}`);
}

async function parsePdf(storagePath: string): Promise<ParsedDocument> {
  const bytes = await readFile(storagePath);
  const parser = new PDFParse({ data: bytes });

  try {
    const result = await parser.getText();
    return {
      text: result.text,
      pages: result.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text
      }))
    };
  } finally {
    await parser.destroy();
  }
}
