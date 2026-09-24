-- Unit-wise filing for ingested drafts.
--
-- `sourceReleaseTag` says which release a question came from (gatecse-2026);
-- these two say which unit *within* the release it was filed under (GO's
-- printed section 1.1, "Combinatory"). The review queue groups by this, and
-- the unit importer uses it to resume without re-walking a whole volume.
ALTER TABLE "IngestedQuestionDraft" ADD COLUMN "sourceUnitId" TEXT;
ALTER TABLE "IngestedQuestionDraft" ADD COLUMN "sourceUnitLabel" TEXT;

CREATE INDEX "IngestedQuestionDraft_sourceUnitId_idx" ON "IngestedQuestionDraft"("sourceUnitId");
