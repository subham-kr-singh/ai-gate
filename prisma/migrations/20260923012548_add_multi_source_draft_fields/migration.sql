-- AlterTable
ALTER TABLE "IngestedQuestionDraft" ADD COLUMN     "corroboratingSources" JSONB,
ADD COLUMN     "normalizedStatement" TEXT,
ADD COLUMN     "provenance" JSONB,
ADD COLUMN     "sourceAdapterId" TEXT NOT NULL DEFAULT 'gopdfs',
ALTER COLUMN "sourcePdfUrl" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "IngestedQuestionDraft_sourceAdapterId_idx" ON "IngestedQuestionDraft"("sourceAdapterId");

-- CreateIndex
CREATE INDEX "IngestedQuestionDraft_normalizedStatement_idx" ON "IngestedQuestionDraft"("normalizedStatement");
