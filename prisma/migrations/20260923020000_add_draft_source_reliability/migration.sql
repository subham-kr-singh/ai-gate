-- Trust class of the source that produced a draft (architecture §48).
-- Stored for the reviewer to weigh; it does not change pipeline behaviour,
-- since every draft needs the same explicit manual approval.
ALTER TABLE "IngestedQuestionDraft"
  ADD COLUMN "sourceReliability" "ResourceReliability" NOT NULL DEFAULT 'COMMUNITY';

CREATE INDEX "IngestedQuestionDraft_sourceReliability_idx"
  ON "IngestedQuestionDraft"("sourceReliability");
