/**
 * LLM assist for ingestion (architecture §54 Stage 3/5, §56).
 *
 * This is the **only** place in the ingestion pipeline that talks to a model,
 * and it is deliberately narrow. The task brief's LLM policy allows exactly
 * two uses, and both are implemented here:
 *
 *  1. `reformatBlock` — take an already-fetched, already-cleaned text block
 *     and reshape it into the canonical question fields, for the minority of
 *     pages where the deterministic DOM/regex extractor cannot.
 *  2. `classifyConcept` — map a question's free-text subject/topic onto
 *     canonical syllabus IDs when the deterministic mapper is not confident.
 *
 * What this module will **not** do, by construction:
 *
 *  - It never receives a URL. Adapters fetch content themselves and pass the
 *    text in, so a model can never go wandering (search-grounding is not a
 *    fetcher).
 *  - It never sees raw uncleaned HTML or PDF bytes; callers pass the text
 *    they already cleaned.
 *  - Its output is a **proposal**. `answerHint` from `reformatBlock` is
 *    reported as an unverified reading, never as authority: the caller must
 *    cross-check it against a deterministically extracted answer key, and
 *    record a blocking error when no independent signal exists (constraint 2
 *    — no LLM determines a correct answer unsupervised).
 *
 * Every call goes through `withBudgetGuard`, so it is logged
 * (provider/model/purpose/tokens/cost) and refused once the daily cap is hit.
 * A refusal is a normal, expected outcome: the caller falls back to the
 * deterministic path and the record carries a review note.
 */
import { z } from "zod";
import { withBudgetGuard } from "@/server/domains/ai/budget-guard";
import { generateStructuredGuarded } from "@/server/domains/ai/ai.service";

export const LLM_ASSIST_MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";

/**
 * Whether LLM assist is configured at all. Without a key the whole pipeline
 * must still run end to end on the deterministic path, so callers check this
 * rather than catching an error per record.
 */
export function llmAssistEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY ?? process.env.LLM_API_KEY);
}

/** Counters for the run report: how often assist was used, skipped, or
 * refused by the budget guard. */
export interface LlmAssistStats {
  attempted: number;
  succeeded: number;
  skippedNoKey: number;
  refusedByBudget: number;
  failed: number;
}

export const llmAssistStats: LlmAssistStats = {
  attempted: 0,
  succeeded: 0,
  skippedNoKey: 0,
  refusedByBudget: 0,
  failed: 0,
};

export function resetLlmAssistStats(): void {
  llmAssistStats.attempted = 0;
  llmAssistStats.succeeded = 0;
  llmAssistStats.skippedNoKey = 0;
  llmAssistStats.refusedByBudget = 0;
  llmAssistStats.failed = 0;
}

// ---------------------------------------------------------------------------
// 1. Reformatting a cleaned block into canonical question fields
// ---------------------------------------------------------------------------

export const ReformatProposalSchema = z.object({
  /** The question statement, as reformatted from the supplied text. */
  statement: z.string().min(10),
  options: z
    .array(z.object({ id: z.string().min(1).max(2), text: z.string().min(1) }))
    .default([]),
  /** The model's *reading* of an answer key present in the supplied text.
   * Never authoritative — see the module docstring. */
  answerHint: z.string().nullable().default(null),
  /** Which part of the supplied text the model read the answer from, so a
   * reviewer can check the claim instead of trusting it. */
  answerEvidence: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).default([]),
});
export type ReformatProposal = z.infer<typeof ReformatProposalSchema>;

const REFORMAT_SYSTEM = `You reformat already-extracted exam question text into a strict JSON shape.

Rules you must follow:
- Use ONLY the text you are given. Never add facts, values, options or answers that are not in that text.
- Never invent a correct answer. If the text does not state one, set answerHint to null.
- If an answer key IS present in the text, quote the exact substring you read it from in answerEvidence.
- Preserve mathematical notation as plain text; do not translate it into prose.
- If the text is too damaged to form a complete question, say so in notes and lower confidence.`;

export interface ReformatBlockArgs {
  /** The adapter's cleaned text for this block (never raw HTML/PDF bytes). */
  cleanedText: string;
  /** Source name, for the prompt's context only. */
  sourceName: string;
  /** Adapter-level hints, e.g. the topic the page was filed under. */
  contextHints?: string[];
}

/**
 * Asks the model to reshape a cleaned block. Returns null when assist is
 * disabled or the call could not be completed — callers keep their
 * deterministic result and add a review note in that case.
 */
export async function reformatBlock(args: ReformatBlockArgs): Promise<ReformatProposal | null> {
  if (!llmAssistEnabled()) {
    llmAssistStats.skippedNoKey++;
    return null;
  }
  llmAssistStats.attempted++;

  const hints = args.contextHints?.length
    ? `\nContext supplied by the caller (not authoritative): ${args.contextHints.join("; ")}`
    : "";

  try {
    return await withBudgetGuard(
      "ingestion_extraction",
      "google",
      LLM_ASSIST_MODEL,
      async () => {
        const result = await generateStructuredGuarded({
          system: REFORMAT_SYSTEM,
          prompt:
            `Source: ${args.sourceName}${hints}\n\n` +
            `Text to reformat (verbatim, already cleaned by our extractor):\n` +
            `"""\n${args.cleanedText.slice(0, 6000)}\n"""`,
          schema: ReformatProposalSchema,
          purpose: "ingestion_extraction",
          maxTokens: 900,
        });
        return { result };
      }
    ).then((proposal) => {
      llmAssistStats.succeeded++;
      return proposal;
    });
  } catch (err) {
    if ((err as Error).name === "BudgetExceededError") llmAssistStats.refusedByBudget++;
    else llmAssistStats.failed++;
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Concept/topic classification (explicitly AI-assisted, non-authoritative)
// ---------------------------------------------------------------------------

export const ConceptProposalSchema = z.object({
  /** One entry copied verbatim from the supplied candidate list, in the
   * `SUBJECT_CODE:name` form the list uses. Null when nothing fits. */
  label: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(300),
});
export type ConceptProposal = z.infer<typeof ConceptProposalSchema>;

const CLASSIFY_SYSTEM = `You map an exam question onto an existing syllabus.

Rules you must follow:
- Choose ONLY from the candidate list you are given, and copy the chosen entry
  verbatim, including its SUBJECT_CODE: prefix.
- If none of the candidates genuinely fits, set label to null and explain why.
- Judge by what the question actually tests, not by keyword overlap.
- A question that spans subtopics should get the entry that covers the majority
  of what it tests.`;

export interface ClassifyConceptArgs {
  /** The question statement (cleaned). */
  statement: string;
  /** The subject the adapter already resolved, if any. */
  subjectCode: string | null;
  /** Candidate entries in `SUBJECT_CODE:name` form. */
  candidates: string[];
}

/**
 * Maps a question onto syllabus entries the deterministic mapper could not
 * resolve. Returns null when assist is off or unusable; the record then stays
 * unresolved for a human, which is the correct fallback.
 */
export async function classifyConcept(args: ClassifyConceptArgs): Promise<ConceptProposal | null> {
  if (!llmAssistEnabled()) {
    llmAssistStats.skippedNoKey++;
    return null;
  }
  if (args.candidates.length === 0) return null;
  llmAssistStats.attempted++;

  try {
    return await withBudgetGuard(
      "ingestion_classification",
      "google",
      LLM_ASSIST_MODEL,
      async () => {
        const result = await generateStructuredGuarded({
          system: CLASSIFY_SYSTEM,
          prompt:
            `Subject: ${args.subjectCode ?? "(not resolved)"}\n\n` +
            `Question:\n"""\n${args.statement.slice(0, 3000)}\n"""\n\n` +
            `Candidate syllabus entries, SUBJECT_CODE:name (choose one or none):\n` +
            args.candidates.map((c) => `- ${c}`).join("\n"),
          schema: ConceptProposalSchema,
          purpose: "ingestion_classification",
          maxTokens: 400,
        });
        return { result };
      }
    ).then((proposal) => {
      llmAssistStats.succeeded++;
      return proposal;
    });
  } catch (err) {
    if ((err as Error).name === "BudgetExceededError") llmAssistStats.refusedByBudget++;
    else llmAssistStats.failed++;
    return null;
  }
}

/**
 * Decides whether an LLM answer hint may be trusted as this record's answer.
 *
 * Constraint 2: an LLM must never determine a `correctAnswer` on its own. A
 * hint is only usable when the adapter independently extracted an answer key
 * from the same source *and* the two agree. Anything else — no independent
 * signal, or a disagreement — returns a reason the caller turns into a
 * blocking validation note.
 */
export function vetAnswerHint(args: {
  hint: string | null;
  deterministicAnswer: string | undefined;
}): { accepted: boolean; reason: string | null } {
  if (!args.hint) return { accepted: false, reason: null };
  if (!args.deterministicAnswer) {
    return {
      accepted: false,
      reason:
        "LLM proposed an answer but the source carries no independent answer key; " +
        "not publishable without a verified key.",
    };
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, "").trim();
  if (norm(args.hint) !== norm(args.deterministicAnswer)) {
    return {
      accepted: false,
      reason:
        `LLM answer hint "${args.hint}" disagrees with the extracted answer key ` +
        `"${args.deterministicAnswer}"; needs human resolution.`,
    };
  }
  return { accepted: true, reason: null };
}
