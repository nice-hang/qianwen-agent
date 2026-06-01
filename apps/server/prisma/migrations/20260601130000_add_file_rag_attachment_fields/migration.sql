ALTER TABLE "Attachment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'image';
ALTER TABLE "Attachment" ADD COLUMN "parseStatus" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "Attachment" ADD COLUMN "parseError" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "chunkCount" INTEGER;
ALTER TABLE "Attachment" ADD COLUMN "parsedAt" DATETIME;
