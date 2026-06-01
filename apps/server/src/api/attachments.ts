import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { UploadFileRequest, UploadImageRequest } from "@qianwen-agent/shared";
import { chunkParsedDocument } from "../rag/chunker";
import { parseStoredFile, SUPPORTED_FILE_MIME_TYPES } from "../rag/parsers";
import { saveParsedChunks } from "../rag/parsed-chunks";
import type { ConversationRepository } from "../storage/conversation-repository";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads/images");
const FILE_UPLOAD_DIR = path.resolve(process.cwd(), "uploads/files");

export function registerAttachmentRoutes(
  app: FastifyInstance,
  conversations: ConversationRepository
) {
  app.post<{
    Body: UploadImageRequest;
  }>("/api/attachments/images", async (request, reply) => {
    const parsed = parseImageUpload(request.body);

    if (!parsed.ok) {
      reply.code(parsed.status);
      return { error: parsed.error };
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const id = crypto.randomUUID();
    const extension = extensionForMime(parsed.mimeType);
    const storagePath = path.join(UPLOAD_DIR, `${id}${extension}`);

    await writeFile(storagePath, parsed.bytes);

    const attachment = await conversations.createImageAttachment({
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.bytes.byteLength,
      storagePath
    });

    return { attachment };
  });

  app.post<{
    Body: UploadFileRequest;
  }>("/api/attachments/files", async (request, reply) => {
    const parsed = parseFileUpload(request.body);

    if (!parsed.ok) {
      reply.code(parsed.status);
      return { error: parsed.error };
    }

    await mkdir(FILE_UPLOAD_DIR, { recursive: true });
    const id = crypto.randomUUID();
    const extension = extensionForFile(parsed.fileName, parsed.mimeType);
    const storagePath = path.join(FILE_UPLOAD_DIR, `${id}${extension}`);

    await writeFile(storagePath, parsed.bytes);

    let attachment = await conversations.createFileAttachment({
      conversationId: parsed.conversationId,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.bytes.byteLength,
      storagePath
    });

    try {
      attachment = await conversations.updateAttachmentParseState({
        id: attachment.id,
        parseStatus: "parsing"
      });
      const document = await parseStoredFile({
        storagePath,
        mimeType: parsed.mimeType
      });
      const chunks = chunkParsedDocument({
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        document
      });
      await saveParsedChunks(attachment.id, chunks);
      attachment = await conversations.updateAttachmentParseState({
        id: attachment.id,
        parseStatus: "ready",
        parseError: null,
        chunkCount: chunks.length,
        parsedAt: new Date()
      });
    } catch (error) {
      attachment = await conversations.updateAttachmentParseState({
        id: attachment.id,
        parseStatus: "error",
        parseError: error instanceof Error ? error.message : "File parse failed",
        chunkCount: null,
        parsedAt: null
      });
    }

    return { attachment };
  });

  app.get<{
    Params: { attachmentId: string };
  }>("/api/attachments/:attachmentId/file", async (request, reply) => {
    const attachment = await conversations.getAttachment(request.params.attachmentId);

    if (!attachment) {
      reply.code(404);
      return { error: "Attachment not found" };
    }

    const bytes = await readFile(attachment.storagePath);
    reply.header("content-type", attachment.mimeType);
    reply.header("cache-control", "private, max-age=86400");
    return reply.send(bytes);
  });
}

type ParsedUpload =
  | {
      ok: true;
      fileName: string;
      mimeType: string;
      bytes: Buffer;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type ParsedFileUpload =
  | (Extract<ParsedUpload, { ok: true }> & { conversationId?: string })
  | Extract<ParsedUpload, { ok: false }>;

function parseImageUpload(input: UploadImageRequest | undefined): ParsedUpload {
  if (!input?.fileName || !input.mimeType || !input.dataUrl) {
    return { ok: false, status: 400, error: "fileName, mimeType and dataUrl are required" };
  }

  if (!ALLOWED_IMAGE_TYPES.has(input.mimeType)) {
    return { ok: false, status: 415, error: "Unsupported image type" };
  }

  const match = /^data:([^;,]+);base64,(.+)$/u.exec(input.dataUrl);
  if (!match || match[1] !== input.mimeType) {
    return { ok: false, status: 400, error: "Invalid image data URL" };
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: "Image is too large" };
  }

  return {
    ok: true,
    fileName: sanitizeFileName(input.fileName),
    mimeType: input.mimeType,
    bytes
  };
}

function parseFileUpload(input: UploadFileRequest | undefined): ParsedFileUpload {
  if (!input?.fileName || !input.mimeType || !input.dataUrl) {
    return { ok: false, status: 400, error: "fileName, mimeType and dataUrl are required" };
  }

  if (!SUPPORTED_FILE_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, status: 415, error: "Unsupported file type" };
  }

  const match = /^data:([^;,]+);base64,(.+)$/u.exec(input.dataUrl);
  if (!match || match[1] !== input.mimeType) {
    return { ok: false, status: 400, error: "Invalid file data URL" };
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, status: 413, error: "File is too large" };
  }

  return {
    ok: true,
    conversationId: input.conversationId,
    fileName: sanitizeFileName(input.fileName),
    mimeType: input.mimeType,
    bytes
  };
}

function sanitizeFileName(fileName: string): string {
  const baseName = path.basename(fileName).replace(/[^\w.-]+/g, "_");
  return baseName || "image";
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return "";
}

function extensionForFile(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName);
  if (fromName) return fromName;
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "text/markdown") return ".md";
  if (mimeType === "text/csv") return ".csv";
  if (mimeType === "application/json") return ".json";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return ".docx";
  }
  return ".txt";
}
