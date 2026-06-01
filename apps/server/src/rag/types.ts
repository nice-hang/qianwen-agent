export interface ParsedPage {
  pageNumber?: number;
  text: string;
}

export interface ParsedDocument {
  text: string;
  pages: ParsedPage[];
}

export interface DocumentChunk {
  id: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  chunkIndex: number;
  pageNumber?: number;
  content: string;
}

export interface IndexedDocumentChunk extends DocumentChunk {
  conversationId: string;
  vector: number[];
  createdAt: string;
}

export interface RetrievedDocumentChunk extends IndexedDocumentChunk {
  score?: number;
}
