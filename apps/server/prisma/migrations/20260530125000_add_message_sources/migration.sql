-- Persist assistant search sources so source chips and drawers survive refresh.
ALTER TABLE "Message" ADD COLUMN "sourcesJson" TEXT;
