-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "IngestedQuestionDraft" (
    "id" TEXT NOT NULL,
    "sourcePdfUrl" TEXT NOT NULL,
    "sourceReleaseTag" TEXT NOT NULL,
    "rawBlockText" TEXT NOT NULL,
    "extracted" JSONB NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "validationErrors" TEXT[],
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "IngestedQuestionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestedQuestionDraft_contentHash_key" ON "IngestedQuestionDraft"("contentHash");

-- CreateIndex
CREATE INDEX "IngestedQuestionDraft_status_idx" ON "IngestedQuestionDraft"("status");

-- CreateIndex
CREATE INDEX "IngestedQuestionDraft_sourceReleaseTag_idx" ON "IngestedQuestionDraft"("sourceReleaseTag");
