-- CreateTable
CREATE TABLE "SourceIngestion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "license" TEXT,
    "upstreamRef" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "report" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SourceIngestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceIngestion_sourceId_startedAt_idx" ON "SourceIngestion"("sourceId", "startedAt");
