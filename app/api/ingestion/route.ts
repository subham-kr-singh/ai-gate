import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/server/auth/require";
import { GATEOVERFLOW_SOURCES, DEFAULT_SOURCE_ID } from "@/server/domains/gateoverflow/gateoverflow.config";
import {
  ingestGateOverflow,
  listIngestionHistory,
  questionBankSize,
} from "@/server/domains/gateoverflow/gateoverflow.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/ingestion — what sources exist, the current bank size and the
 * last runs, so an import can be checked without opening the database. */
export async function GET() {
  try {
    await requireUser();
    const [history, total] = await Promise.all([listIngestionHistory(20), questionBankSize()]);
    return NextResponse.json({
      sources: Object.values(GATEOVERFLOW_SOURCES),
      defaultSourceId: DEFAULT_SOURCE_ID,
      questionBankSize: total,
      history,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load ingestion history." }, { status: 500 });
  }
}

const runSchema = z.object({
  sourceId: z.string().min(1).optional(),
  dryRun: z.boolean().default(false),
  force: z.boolean().default(false),
});

/** POST /api/ingestion — run an import. Defaults to a dry run so the first
 * call is always safe: it reports what would be written and where, and only
 * an explicit `dryRun: false` touches the question bank. */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = runSchema.parse(body ?? {});

    const summary = await ingestGateOverflow({
      sourceId: parsed.sourceId,
      dryRun: parsed.dryRun,
      force: parsed.force,
    });

    return NextResponse.json({ summary });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed." },
      { status: 400 }
    );
  }
}
