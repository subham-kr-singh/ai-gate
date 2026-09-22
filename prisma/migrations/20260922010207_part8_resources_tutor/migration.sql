-- CreateEnum
CREATE TYPE "ResourceReliability" AS ENUM ('OFFICIAL', 'VERIFIED', 'CURATED', 'COMMUNITY', 'AI_GENERATED');

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "reliability" "ResourceReliability" NOT NULL DEFAULT 'COMMUNITY',
    "subjectId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceVersion" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "license" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceChunk" (
    "id" TEXT NOT NULL,
    "resourceVersionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "reliability" "ResourceReliability" NOT NULL DEFAULT 'COMMUNITY',
    "conceptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unitId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "effects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Resource_url_key" ON "Resource"("url");

-- CreateIndex
CREATE INDEX "Resource_reliability_idx" ON "Resource"("reliability");

-- CreateIndex
CREATE INDEX "Resource_site_idx" ON "Resource"("site");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceVersion_contentHash_key" ON "ResourceVersion"("contentHash");

-- CreateIndex
CREATE INDEX "ResourceVersion_resourceId_retrievedAt_idx" ON "ResourceVersion"("resourceId", "retrievedAt");

-- CreateIndex
CREATE INDEX "ResourceChunk_resourceId_idx" ON "ResourceChunk"("resourceId");

-- CreateIndex
CREATE INDEX "ResourceChunk_reliability_idx" ON "ResourceChunk"("reliability");

-- CreateIndex
CREATE INDEX "TutorActionLog_userId_createdAt_idx" ON "TutorActionLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResourceVersion" ADD CONSTRAINT "ResourceVersion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceChunk" ADD CONSTRAINT "ResourceChunk_resourceVersionId_fkey" FOREIGN KEY ("resourceVersionId") REFERENCES "ResourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
