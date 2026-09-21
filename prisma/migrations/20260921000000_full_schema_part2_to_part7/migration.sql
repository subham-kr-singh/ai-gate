-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'MSQ', 'NAT');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DifficultySource" AS ENUM ('MANUAL', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('TOPIC_QUIZ', 'MOCK');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MistakeType" AS ENUM ('CONCEPTUAL_GAP', 'CALCULATION_ERROR', 'MISREAD', 'FORMULA_RECALL', 'CONFUSED_CONCEPTS', 'CARELESS_ERROR', 'GUESS', 'TIME_PRESSURE');

-- CreateEnum
CREATE TYPE "ClassificationSource" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "CoverageStatus" AS ENUM ('NOT_STARTED', 'LEARNING', 'PRACTICING', 'PROVISIONALLY_COMPLETE', 'MASTERED', 'REVISION_DUE');

-- CreateEnum
CREATE TYPE "DPPSourceType" AS ENUM ('WEAK', 'PREREQUISITE', 'REVISION', 'MISTAKE', 'PYQ', 'MIXED');

-- CreateEnum
CREATE TYPE "PlanItemStatus" AS ENUM ('PENDING', 'ACTIVE', 'PROVISIONALLY_COMPLETE', 'GOOD_ENOUGH', 'MOVED_ON', 'MASTERED');

-- CreateEnum
CREATE TYPE "DifficultyClass" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "OverrideChoice" AS ENUM ('FOLLOW', 'OVERRIDE', 'SKIP', 'SNOOZE');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "MockStatus" AS ENUM ('READY', 'IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "MockSubmitReason" AS ENUM ('USER', 'TIMER', 'EXPIRED_SERVER');

-- CreateEnum
CREATE TYPE "MockEventKind" AS ENUM ('SELECT', 'CLEAR', 'MARK', 'UNMARK', 'GUESS', 'UNGUESS', 'VISIT', 'LEAVE', 'TIME');

-- DropForeignKey
ALTER TABLE "concept_dependencies" DROP CONSTRAINT "concept_dependencies_conceptId_fkey";

-- DropForeignKey
ALTER TABLE "concept_dependencies" DROP CONSTRAINT "concept_dependencies_prerequisiteConceptId_fkey";

-- DropForeignKey
ALTER TABLE "concepts" DROP CONSTRAINT "concepts_topicId_fkey";

-- DropForeignKey
ALTER TABLE "exams" DROP CONSTRAINT "exams_syllabusVersionId_fkey";

-- DropForeignKey
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_syllabusVersionId_fkey";

-- DropForeignKey
ALTER TABLE "topics" DROP CONSTRAINT "topics_unitId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_subjectId_fkey";

-- DropIndex
DROP INDEX "concept_dependencies_conceptId_prerequisiteConceptId_key";

-- DropIndex
DROP INDEX "concepts_topicId_idx";

-- DropIndex
DROP INDEX "subjects_syllabusVersionId_idx";

-- DropIndex
DROP INDEX "topics_unitId_idx";

-- DropIndex
DROP INDEX "units_subjectId_code_key";

-- DropIndex
DROP INDEX "units_subjectId_idx";

-- AlterTable
ALTER TABLE "concept_dependencies" DROP COLUMN "prerequisiteConceptId",
ADD COLUMN     "prerequisiteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "concepts" DROP COLUMN "createdAt",
ALTER COLUMN "order" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "subjects" DROP COLUMN "createdAt",
ALTER COLUMN "order" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "syllabus_versions" ALTER COLUMN "isActive" SET DEFAULT false;

-- AlterTable
ALTER TABLE "topics" DROP COLUMN "createdAt",
ALTER COLUMN "order" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "units" DROP COLUMN "code",
DROP COLUMN "createdAt",
ADD COLUMN     "maximumExtensionDays" DOUBLE PRECISION,
ADD COLUMN     "targetDurationDays" DOUBLE PRECISION,
ALTER COLUMN "order" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "lastLogin";

-- DropTable
DROP TABLE "exams";

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "negativeMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "statement" TEXT NOT NULL,
    "options" JSONB,
    "correctAnswer" JSONB NOT NULL,
    "natTolerance" JSONB,
    "solution" TEXT,
    "year" INTEGER,
    "source" TEXT,
    "sourceUrl" TEXT,
    "license" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "difficultySource" "DifficultySource" NOT NULL DEFAULT 'MANUAL',
    "difficultyVersion" TEXT NOT NULL DEFAULT 'v1',
    "status" "QuestionStatus" NOT NULL DEFAULT 'APPROVED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_concepts" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,

    CONSTRAINT "question_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marking_schemes" (
    "id" TEXT NOT NULL,
    "examYear" INTEGER NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "positiveMarks" DOUBLE PRECISION NOT NULL,
    "negativeMarksFraction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowsPartialMarking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marking_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TestType" NOT NULL,
    "examYear" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "totalMarks" DOUBLE PRECISION,
    "scoredMarks" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "draftAnswers" JSONB,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_questions" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "test_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "scoredMarks" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "selectedAnswer" JSONB NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "timeTakenMs" INTEGER,
    "confidence" INTEGER,
    "markedForReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answerId" TEXT,
    "questionId" TEXT,
    "unitId" TEXT,
    "topicId" TEXT,
    "mistakeType" "MistakeType",
    "classificationSource" "ClassificationSource",
    "classificationConfidence" DOUBLE PRECISION,
    "note" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MistakeConcept" (
    "mistakeId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,

    CONSTRAINT "MistakeConcept_pkey" PRIMARY KEY ("mistakeId","conceptId")
);

-- CreateTable
CREATE TABLE "ConceptStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "completion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mastery" DOUBLE PRECISION,
    "retention" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "recentAccuracy" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "averageTimeMs" DOUBLE PRECISION,
    "lastSeen" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "pyqAttempts" INTEGER NOT NULL DEFAULT 0,
    "pyqCorrect" INTEGER NOT NULL DEFAULT 0,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "completion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mastery" DOUBLE PRECISION,
    "retention" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "recentAccuracy" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "averageTimeMs" DOUBLE PRECISION,
    "lastSeen" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "pyqAttempts" INTEGER NOT NULL DEFAULT 0,
    "pyqCorrect" INTEGER NOT NULL DEFAULT 0,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "CoverageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "practiceAccuracy" DOUBLE PRECISION,
    "pyqAccuracy" DOUBLE PRECISION,
    "evidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openMistakes" INTEGER NOT NULL DEFAULT 0,
    "readiness" DOUBLE PRECISION,
    "decision" TEXT NOT NULL DEFAULT 'CONTINUE',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "reportedAttempts" INTEGER NOT NULL DEFAULT 0,
    "reportedCorrect" INTEGER NOT NULL DEFAULT 0,
    "reportedPyqAttempts" INTEGER NOT NULL DEFAULT 0,
    "reportedPyqCorrect" INTEGER NOT NULL DEFAULT 0,
    "userWantsToContinue" BOOLEAN NOT NULL DEFAULT false,
    "completionVersion" TEXT NOT NULL DEFAULT 'v1',
    "masteryVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCoverage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "reportedStatus" "CoverageStatus" NOT NULL,
    "reportedPercent" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetUnitsPerDay" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxExtensionDays" INTEGER NOT NULL DEFAULT 2,
    "fixedTimeSlots" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "ladderVersion" TEXT NOT NULL DEFAULT 'v1',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySessionReport" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "CoverageStatus" NOT NULL,
    "topicsCoveredIds" TEXT[],
    "weakTopicIds" TEXT[],
    "questionsAttempted" INTEGER NOT NULL DEFAULT 0,
    "questionsCorrect" INTEGER NOT NULL DEFAULT 0,
    "pyqAttempted" INTEGER NOT NULL DEFAULT 0,
    "pyqCorrect" INTEGER NOT NULL DEFAULT 0,
    "selfConfidence" INTEGER,
    "continueUnit" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudySessionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppliedOutcome" (
    "answerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppliedOutcome_pkey" PRIMARY KEY ("answerId")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPP" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DPP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPPQuestion" (
    "id" TEXT NOT NULL,
    "dppId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "source" "DPPSourceType" NOT NULL,
    "position" INTEGER NOT NULL,
    "conceptId" TEXT,
    "completedAt" TIMESTAMP(3),
    "correct" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DPPQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examDate" DATE,
    "prepStartDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "targetDaysPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxExtensionDays" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "phaseStarts" JSONB,
    "lastMockAt" TIMESTAMP(3),
    "mocksCompleted" INTEGER NOT NULL DEFAULT 0,
    "plannerVersion" TEXT NOT NULL DEFAULT 'planner-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "PlanItemStatus" NOT NULL DEFAULT 'PENDING',
    "difficultyClass" "DifficultyClass" NOT NULL DEFAULT 'MEDIUM',
    "targetDays" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxExtensionDays" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "actualDays" DOUBLE PRECISION,
    "exitReason" TEXT,
    "unresolved" JSONB,
    "snoozedUntil" TIMESTAMP(3),
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "lastRevisedAt" TIMESTAMP(3),
    "nextRevisionAt" TIMESTAMP(3),
    "plannerVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "unitId" TEXT,
    "conceptId" TEXT,
    "priority" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "alternatives" JSONB NOT NULL,
    "phase" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "priorityVersion" TEXT NOT NULL,
    "plannerVersion" TEXT NOT NULL,
    "beforeState" JSONB,
    "outcome" JSONB,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "decisionId" TEXT,
    "choice" "OverrideChoice" NOT NULL,
    "recommendedAction" TEXT,
    "recommendedUnitId" TEXT,
    "chosenUnitId" TEXT,
    "reason" TEXT,
    "snoozedUntil" TIMESTAMP(3),
    "unresolvedSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT,
    "unitId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DEFINITION',
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "state" INTEGER NOT NULL DEFAULT 0,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReview" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardReview" (
    "id" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "stateBefore" INTEGER NOT NULL,
    "dueBefore" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlashcardReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SnapshotKind" NOT NULL,
    "capturedOn" DATE NOT NULL,
    "phase" INTEGER NOT NULL,
    "daysToExam" INTEGER,
    "metrics" JSONB NOT NULL,
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blueprintKey" TEXT NOT NULL,
    "examYear" INTEGER NOT NULL,
    "syllabusVersionId" TEXT,
    "status" "MockStatus" NOT NULL DEFAULT 'READY',
    "durationSec" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submitReason" "MockSubmitReason",
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "assemblySeed" TEXT NOT NULL,
    "assemblyVersion" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "maxMarks" DOUBLE PRECISION NOT NULL,
    "freshCount" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "resultJson" JSONB,
    "analyticsVersion" TEXT,
    "learningClaimedAt" TIMESTAMP(3),
    "learningAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockPaperItem" (
    "mockId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "marks" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "wasSeenBefore" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MockPaperItem_pkey" PRIMARY KEY ("mockId","position")
);

-- CreateTable
CREATE TABLE "MockAnswerState" (
    "mockId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selected" JSONB,
    "firstAnswer" JSONB,
    "markedForReview" BOOLEAN NOT NULL DEFAULT false,
    "guessed" BOOLEAN NOT NULL DEFAULT false,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "spentMs" INTEGER NOT NULL DEFAULT 0,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockAnswerState_pkey" PRIMARY KEY ("mockId","questionId")
);

-- CreateTable
CREATE TABLE "MockAnswerEvent" (
    "mockId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,
    "kind" "MockEventKind" NOT NULL,
    "selected" JSONB,
    "spentMs" INTEGER NOT NULL DEFAULT 0,
    "clientAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MockAnswerEvent_pkey" PRIMARY KEY ("mockId","seq")
);

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostCents" DOUBLE PRECISION,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "outputRaw" TEXT,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIOutput" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions_contentHash_key" ON "questions"("contentHash");

-- CreateIndex
CREATE INDEX "questions_subjectId_unitId_topicId_idx" ON "questions"("subjectId", "unitId", "topicId");

-- CreateIndex
CREATE INDEX "questions_status_difficulty_idx" ON "questions"("status", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "question_concepts_questionId_conceptId_key" ON "question_concepts"("questionId", "conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "marking_schemes_examYear_questionType_key" ON "marking_schemes"("examYear", "questionType");

-- CreateIndex
CREATE INDEX "tests_userId_status_idx" ON "tests"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "test_questions_testId_questionId_key" ON "test_questions"("testId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "test_questions_testId_order_key" ON "test_questions"("testId", "order");

-- CreateIndex
CREATE INDEX "answers_questionId_idx" ON "answers"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "answers_attemptId_questionId_key" ON "answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Mistake_userId_resolved_idx" ON "Mistake"("userId", "resolved");

-- CreateIndex
CREATE INDEX "Mistake_userId_unitId_idx" ON "Mistake"("userId", "unitId");

-- CreateIndex
CREATE INDEX "Mistake_userId_mistakeType_idx" ON "Mistake"("userId", "mistakeType");

-- CreateIndex
CREATE INDEX "Mistake_userId_questionId_idx" ON "Mistake"("userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_userId_answerId_key" ON "Mistake"("userId", "answerId");

-- CreateIndex
CREATE INDEX "MistakeConcept_conceptId_idx" ON "MistakeConcept"("conceptId");

-- CreateIndex
CREATE INDEX "ConceptStats_userId_mastery_idx" ON "ConceptStats"("userId", "mastery");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptStats_userId_conceptId_key" ON "ConceptStats"("userId", "conceptId");

-- CreateIndex
CREATE INDEX "TopicStats_userId_mastery_idx" ON "TopicStats"("userId", "mastery");

-- CreateIndex
CREATE UNIQUE INDEX "TopicStats_userId_topicId_key" ON "TopicStats"("userId", "topicId");

-- CreateIndex
CREATE INDEX "LearningState_userId_status_idx" ON "LearningState"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearningState_userId_unitId_key" ON "LearningState"("userId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCoverage_userId_unitId_key" ON "StudentCoverage"("userId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentPlan_userId_key" ON "StudentPlan"("userId");

-- CreateIndex
CREATE INDEX "ReviewState_userId_dueAt_idx" ON "ReviewState"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewState_userId_conceptId_key" ON "ReviewState"("userId", "conceptId");

-- CreateIndex
CREATE INDEX "StudySession_userId_startedAt_idx" ON "StudySession"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudySessionReport_sessionId_key" ON "StudySessionReport"("sessionId");

-- CreateIndex
CREATE INDEX "StudySessionReport_userId_unitId_createdAt_idx" ON "StudySessionReport"("userId", "unitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudySessionReport_userId_clientRequestId_key" ON "StudySessionReport"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "AppliedOutcome_userId_idx" ON "AppliedOutcome"("userId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_type_createdAt_idx" ON "AnalyticsEvent"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "DPP_userId_date_idx" ON "DPP"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DPP_userId_date_key" ON "DPP"("userId", "date");

-- CreateIndex
CREATE INDEX "DPPQuestion_dppId_position_idx" ON "DPPQuestion"("dppId", "position");

-- CreateIndex
CREATE INDEX "DPPQuestion_questionId_idx" ON "DPPQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "DPPQuestion_dppId_questionId_key" ON "DPPQuestion"("dppId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyPlan_userId_key" ON "StudyPlan"("userId");

-- CreateIndex
CREATE INDEX "PlanItem_userId_status_idx" ON "PlanItem"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItem_userId_unitId_key" ON "PlanItem"("userId", "unitId");

-- CreateIndex
CREATE INDEX "PlannerDecision_userId_forDate_idx" ON "PlannerDecision"("userId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerDecision_userId_forDate_inputHash_key" ON "PlannerDecision"("userId", "forDate", "inputHash");

-- CreateIndex
CREATE INDEX "UserOverride_userId_forDate_idx" ON "UserOverride"("userId", "forDate");

-- CreateIndex
CREATE INDEX "Flashcard_userId_due_idx" ON "Flashcard"("userId", "due");

-- CreateIndex
CREATE INDEX "Flashcard_userId_conceptId_idx" ON "Flashcard"("userId", "conceptId");

-- CreateIndex
CREATE INDEX "FlashcardReview_userId_reviewedAt_idx" ON "FlashcardReview"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "PlanSnapshot_userId_kind_capturedOn_idx" ON "PlanSnapshot"("userId", "kind", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX "PlanSnapshot_userId_kind_capturedOn_key" ON "PlanSnapshot"("userId", "kind", "capturedOn");

-- CreateIndex
CREATE INDEX "MockTest_userId_status_idx" ON "MockTest"("userId", "status");

-- CreateIndex
CREATE INDEX "MockTest_userId_createdAt_idx" ON "MockTest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MockTest_status_deadlineAt_idx" ON "MockTest"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "MockTest_status_learningAppliedAt_idx" ON "MockTest"("status", "learningAppliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MockPaperItem_mockId_questionId_key" ON "MockPaperItem"("mockId", "questionId");

-- CreateIndex
CREATE INDEX "MockAnswerEvent_mockId_questionId_idx" ON "MockAnswerEvent"("mockId", "questionId");

-- CreateIndex
CREATE INDEX "AIUsageLog_userId_date_idx" ON "AIUsageLog"("userId", "date");

-- CreateIndex
CREATE INDEX "AIInteraction_userId_kind_createdAt_idx" ON "AIInteraction"("userId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIOutput_questionId_kind_contentHash_key" ON "AIOutput"("questionId", "kind", "contentHash");

-- CreateIndex
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "concept_dependencies_conceptId_prerequisiteId_key" ON "concept_dependencies"("conceptId", "prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "concepts_topicId_name_key" ON "concepts"("topicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "topics_unitId_name_key" ON "topics"("unitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "units_subjectId_name_key" ON "units"("subjectId", "name");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_syllabusVersionId_fkey" FOREIGN KEY ("syllabusVersionId") REFERENCES "syllabus_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_dependencies" ADD CONSTRAINT "concept_dependencies_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_dependencies" ADD CONSTRAINT "concept_dependencies_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_concepts" ADD CONSTRAINT "question_concepts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_concepts" ADD CONSTRAINT "question_concepts_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_questions" ADD CONSTRAINT "test_questions_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_questions" ADD CONSTRAINT "test_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MistakeConcept" ADD CONSTRAINT "MistakeConcept_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySessionReport" ADD CONSTRAINT "StudySessionReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPP" ADD CONSTRAINT "DPP_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPPQuestion" ADD CONSTRAINT "DPPQuestion_dppId_fkey" FOREIGN KEY ("dppId") REFERENCES "DPP"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPPQuestion" ADD CONSTRAINT "DPPQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOverride" ADD CONSTRAINT "UserOverride_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "PlannerDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockPaperItem" ADD CONSTRAINT "MockPaperItem_mockId_fkey" FOREIGN KEY ("mockId") REFERENCES "MockTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockAnswerState" ADD CONSTRAINT "MockAnswerState_mockId_fkey" FOREIGN KEY ("mockId") REFERENCES "MockTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockAnswerEvent" ADD CONSTRAINT "MockAnswerEvent_mockId_fkey" FOREIGN KEY ("mockId") REFERENCES "MockTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

