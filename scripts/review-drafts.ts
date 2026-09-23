/**
 * Human review gate for ingested questions.
 *
 * The ingestion pipeline (scripts/ingest-gopdfs.ts) only ever writes to
 * `IngestedQuestionDraft`. This is the *only* path from a draft into the live
 * `Question` table, and it requires an explicit per-draft decision from a
 * human. There is no "approve everything" flag: even `--approve` requires the
 * caller to name the drafts, which keeps the architecture's rule that imported
 * content is never auto-published.
 *
 * Usage:
 *   npx tsx scripts/review-drafts.ts --list
 *   npx tsx scripts/review-drafts.ts --list --release gatecse-2026 --limit 25
 *   npx tsx scripts/review-drafts.ts --show <draftId>
 *   npx tsx scripts/review-drafts.ts --approve <draftId> [<draftId> ...]
 *   npx tsx scripts/review-drafts.ts --reject  <draftId> [<draftId> ...]
 */
import { db } from "@/server/db/client";
import { questionInputSchema } from "@/server/domains/questions/question.schema";
import { importQuestion } from "@/server/domains/questions/question.service";

function readFlagValues(argv: string[], flag: string): string[] {
  const i = argv.indexOf(flag);
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < argv.length && !argv[j]!.startsWith("--"); j++) out.push(argv[j]!);
  return out;
}

function getFlag(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function listDrafts(argv: string[]) {
  const release = getFlag(argv, "--release");
  const limit = Number(getFlag(argv, "--limit") ?? 25);
  const status = getFlag(argv, "--status");

  const drafts = await db.ingestedQuestionDraft.findMany({
    where: {
      ...(release ? { sourceReleaseTag: release } : {}),
      ...(status ? { status: status as "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const counts = await db.ingestedQuestionDraft.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("Draft counts:", counts.map((c) => `${c.status}=${c._count._all}`).join("  ") || "(none)");
  console.log("");
  for (const d of drafts) {
    const ex = d.extracted as { type?: string; statement?: string };
    const cls = d.classification as { subjectCode?: string; confidence?: number } | null;
    const flags = d.validationErrors.length ? ` [${d.validationErrors.length} note(s)]` : "";
    const label = cls?.subjectCode ? ` ${cls.subjectCode}@${(cls.confidence ?? 0).toFixed(2)}` : " unresolved";
    console.log(`${d.id}  ${d.status}${flags} ${(ex.type ?? "?").padEnd(3)}${label.padEnd(14)} ${(ex.statement ?? "").slice(0, 60).replace(/\n/g, " ")}`);
  }
  console.log(`\n${drafts.length} draft(s) shown (of ${counts.reduce((a, c) => a + c._count._all, 0)} total).`);
}

async function showDraft(id: string) {
  const d = await db.ingestedQuestionDraft.findUnique({ where: { id } });
  if (!d) throw new Error(`No draft with id ${id}`);
  console.log(`id            : ${d.id}`);
  console.log(`status        : ${d.status}`);
  console.log(`release       : ${d.sourceReleaseTag}`);
  console.log(`source        : ${d.sourcePdfUrl}${d.sourceQuestionId ? ` (${d.sourceQuestionId})` : ""}`);
  console.log(`contentHash   : ${d.contentHash}`);
  console.log(`validation    : ${d.validationErrors.length ? "\n  - " + d.validationErrors.join("\n  - ") : "none"}`);
  console.log(`\nextracted     :\n${JSON.stringify(d.extracted, null, 2)}`);
  console.log(`\nraw block text:\n${d.rawBlockText.slice(0, 2000)}`);
}

async function approve(ids: string[]) {
  for (const id of ids) {
    const draft = await db.ingestedQuestionDraft.findUnique({ where: { id } });
    if (!draft) {
      console.error(`SKIP ${id}: not found`);
      continue;
    }
    if (draft.status === "APPROVED") {
      console.error(`SKIP ${id}: already approved`);
      continue;
    }
    if (draft.validationErrors.length > 0) {
      console.error(`SKIP ${id}: ${draft.validationErrors.length} validation note(s) — resolve or reject instead of approving.`);
      continue;
    }

    // Re-validate at the moment of promotion: the reviewer may have fixed the
    // JSON by hand, and the schema is the gate regardless of how it was written.
    const parsed = questionInputSchema.safeParse(draft.extracted);
    if (!parsed.success) {
      console.error(`SKIP ${id}: extracted payload no longer passes the schema:`);
      for (const issue of parsed.error.issues) {
        console.error(`     ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }

    // The reviewer's decision here *is* the publish approval, so the promoted
    // row is APPROVED even though it was extracted as DRAFT.
    const question = await importQuestion({ ...parsed.data, status: "APPROVED" });
    await db.ingestedQuestionDraft.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date(), promotedQuestionId: question.id },
    });
    console.log(`APPROVED ${id} -> Question ${question.id}`);
  }
}

async function reject(ids: string[]) {
  for (const id of ids) {
    const res = await db.ingestedQuestionDraft.update({
      where: { id },
      data: { status: "REJECTED", reviewedAt: new Date() },
    });
    console.log(`REJECTED ${res.id}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const approveIds = readFlagValues(argv, "--approve");
  const rejectIds = readFlagValues(argv, "--reject");
  const showId = getFlag(argv, "--show");

  if (approveIds.length > 0) await approve(approveIds);
  else if (rejectIds.length > 0) await reject(rejectIds);
  else if (showId) await showDraft(showId);
  else await listDrafts(argv);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
