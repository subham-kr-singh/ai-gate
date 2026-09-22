/**
 * server/domains/tutor/tutor.service.ts
 *
 * The tutor's answer pipeline. Two grounding sources, kept separate on purpose:
 *
 *   1. The student's own numbers (tutor.context) — always authoritative.
 *   2. Passages fetched from the internet (resource.service) — cited, never
 *      stated as fact without a source.
 *
 * Like every other AI module here, the model's output is a PROPOSAL. If the
 * student sounds unsure or asks to change the plan, the tutor attaches a
 * structured action the student must confirm (tutor.actions) — the chat itself
 * never writes learning state.
 */

import { z } from "zod";
import { AIService } from "@/server/domains/ai/ai.service";
import { BudgetExceededError } from "@/server/domains/ai/budget-guard";
import { retrieveChunks, type RetrievedChunk } from "@/server/domains/resources/resource.service";
import { buildTutorContext, renderTutorContext, type TutorContext } from "./tutor.context";
import { describeAction, type TutorActionProposal } from "./tutor.actions";

export interface TutorCitation {
  title: string;
  section: string | null;
  url: string;
  site: string;
  reliability: string;
  snippet: string;
}

export interface TutorReply {
  answer: string;
  citations: TutorCitation[];
  /** Present only when the student asked for a plan change or flagged doubt. */
  proposal: TutorActionProposal | null;
  /** True when the model could not be reached and the student sees a fallback. */
  degraded: boolean;
  context: TutorContext;
}

/** What the student is actually asking for. */
export const TutorIntentSchema = z.object({
  intent: z.enum(["EXPLAIN", "PLAN_CHANGE", "LOW_CONFIDENCE", "STATUS", "PRACTICE", "MISTAKE_REVIEW"]),
  unitId: z.string().nullable(),
  /** Days to extend/snooze when the student names a duration. */
  days: z.number().int().min(1).max(30).nullable(),
  wantsMarkIncomplete: z.boolean(),
});

export type TutorIntent = z.infer<typeof TutorIntentSchema>;

const INTENT_SYSTEM = `You route a GATE student's message to one intent.
- EXPLAIN: a conceptual question about the subject matter.
- STATUS: "how am I doing", progress, pace, what's weak.
- PRACTICE: asking for questions or what to practise next.
- MISTAKE_REVIEW: asking about their own past mistakes.
- LOW_CONFIDENCE: they say they feel unsure, shaky, not confident, or that a topic "isn't clicking".
- PLAN_CHANGE: they ask to reschedule, postpone, skip, set aside, or mark a unit incomplete.
Pick the single best intent. Set "unitId" to one of the bracketed ids from the STUDENT STATE list if the
message clearly refers to that unit, otherwise null. Set "days" only if they name a number of days.
Set "wantsMarkIncomplete" true only if they explicitly want a unit treated as not finished.`;

const ANSWER_SYSTEM = `You are a GATE CSE/IT study tutor inside the student's own preparation app.

Rules:
1. The STUDENT STATE block is the only source for anything about their progress,
   weakness, pace or history. Never invent a statistic. If a number is not there,
   say you don't have it.
2. The SOURCES block, when present, is material fetched from the internet. Use it
   for subject-matter explanation and cite the source by its number, like [1].
   If SOURCES is empty, answer from general knowledge and say plainly that you
   have no fetched source for it.
3. Be concrete and short. Prefer 2-6 sentences plus, when useful, a short list.
4. If the student says they feel low confidence, acknowledge it without
   flattery, point at the actual weak concepts and numbers you can see, and say
   what you would change. The app will offer them a confirm button for any plan
   change, so describe the change rather than claiming you already made it.
5. Never claim to have updated their plan, marked anything complete, or saved
   anything. You only speak; the student confirms changes themselves.`;

function toCitation(c: RetrievedChunk): TutorCitation {
  return {
    title: c.title,
    section: c.section,
    url: c.sourceUrl,
    site: c.site,
    reliability: c.reliability,
    snippet: c.text.slice(0, 240),
  };
}

function renderSources(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "SOURCES: none fetched for this question.";
  return [
    "SOURCES (cite by number):",
    ...chunks.map(
      (c, i) =>
        `[${i + 1}] ${c.title}${c.section ? ` — ${c.section}` : ""} (${c.site}, ${c.reliability})\n${c.text.slice(0, 900)}`,
    ),
  ].join("\n\n");
}

/** Best-effort intent routing. Falls back to a keyword heuristic so the tutor
 * still routes sensibly when the model is unavailable. */
async function detectIntent(message: string, ctx: TutorContext): Promise<TutorIntent> {
  const unitHints = [...ctx.activeUnits, ...ctx.weakUnits]
    .map((u) => `[${u.unitId}] ${u.subject} / ${u.unit}`)
    .join("\n");

  try {
    return await AIService.generateStructured({
      system: INTENT_SYSTEM,
      prompt: `Message: """${message}"""\n\nKnown units:\n${unitHints || "(none)"}\n\nReturn JSON: { "intent": one of EXPLAIN|PLAN_CHANGE|LOW_CONFIDENCE|STATUS|PRACTICE|MISTAKE_REVIEW, "unitId": string|null, "days": number|null, "wantsMarkIncomplete": boolean }`,
      schema: TutorIntentSchema,
      purpose: "explanation",
      maxTokens: 200,
    });
  } catch {
    return heuristicIntent(message, ctx);
  }
}

/** Deterministic fallback: catches the low-confidence phrasing the product is
 * built around even with no AI configured. */
function heuristicIntent(message: string, ctx: TutorContext): TutorIntent {
  const m = message.toLowerCase();
  const unit =
    [...ctx.activeUnits, ...ctx.weakUnits].find((u) => {
      const name = u.unit.toLowerCase();
      return name.length > 3 && m.includes(name);
    }) ??
    [...ctx.activeUnits, ...ctx.weakUnits].find((u) => m.includes(u.unitId.toLowerCase())) ??
    null;

  const daysMatch = m.match(/(\d+)\s*(day|days)/);
  const days = daysMatch ? Number(daysMatch[1]) : null;
  const lowConfidence = /low confidence|not confident|no confidence|not sure|unsure|shaky|confus|clicks?|stuck|struggl/.test(m);
  const planChange = /reschedul|postpon|delay|skip|set aside|push|mark.*incomplete|move on|more time/.test(m);

  let intent: TutorIntent["intent"] = "EXPLAIN";
  if (lowConfidence) intent = "LOW_CONFIDENCE";
  else if (planChange) intent = "PLAN_CHANGE";
  else if (/how am i|progress|pace|on track|status|how.*doing/.test(m)) intent = "STATUS";
  else if (/practice|questions|quiz|dpp/.test(m)) intent = "PRACTICE";
  else if (/mistake|wrong|got.*wrong/.test(m)) intent = "MISTAKE_REVIEW";

  return {
    intent,
    unitId: unit?.unitId ?? null,
    days,
    wantsMarkIncomplete: /incomplete|not finished|not done|redo/.test(m),
  };
}

/**
 * Answers one student message. Always returns a reply — an unavailable model
 * degrades to a data-only summary rather than an error, because the student's
 * own numbers are useful on their own.
 */
export async function askTutor(userId: string, message: string, now = new Date()): Promise<TutorReply> {
  const ctx = await buildTutorContext(userId, now);
  const intent = await detectIntent(message, ctx);

  // Only reach out to the internet for subject-matter questions; a status or
  // plan question is answered from the student's own data.
  const wantsSources = intent.intent === "EXPLAIN" || intent.intent === "PRACTICE";
  const chunks = wantsSources ? await retrieveChunks(message, 4) : [];

  const prompt = [
    renderTutorContext(ctx),
    "",
    renderSources(chunks),
    "",
    `STUDENT MESSAGE: """${message}"""`,
    "",
    `Detected intent: ${intent.intent}.`,
    "Answer following your rules.",
  ].join("\n");

  let answer: string;
  let degraded = false;
  try {
    answer = await AIService.generateText({
      system: ANSWER_SYSTEM,
      prompt,
      purpose: "explanation",
      maxTokens: 700,
    });
  } catch (err) {
    degraded = true;
    answer = degradedAnswer(message, ctx, intent, err);
  }

  let proposal: TutorActionProposal | null = null;
  if (intent.unitId && (intent.intent === "LOW_CONFIDENCE" || intent.intent === "PLAN_CHANGE")) {
    proposal = await proposeForIntent(userId, intent, now);
  }

  return { answer, citations: chunks.map(toCitation), proposal, degraded, context: ctx };
}

/** Chooses which concrete change to offer. A duration the student named is
 * honoured; otherwise the tutor proposes a conservative 2-day extension. */
async function proposeForIntent(userId: string, intent: TutorIntent, now: Date): Promise<TutorActionProposal | null> {
  if (!intent.unitId) return null;
  try {
    if (intent.wantsMarkIncomplete) {
      return await describeAction(userId, { kind: "MARK_UNIT_INCOMPLETE", unitId: intent.unitId }, now);
    }
    return await describeAction(
      userId,
      { kind: "RESCHEDULE_UNIT", unitId: intent.unitId, extendDays: intent.days ?? 2 },
      now,
    );
  } catch {
    return null;
  }
}

/** Plain, truthful fallback. Never pretends to know more than the snapshot. */
function degradedAnswer(message: string, ctx: TutorContext, intent: TutorIntent, err: unknown): string {
  if (err instanceof BudgetExceededError) {
    return `I've hit today's AI budget, so I can't generate a written explanation right now. Your data is still here: ${readTutorSummary(ctx)} You can keep working — explanations resume tomorrow.`;
  }
  if (intent.intent === "LOW_CONFIDENCE") {
    return `I can't reach the explanation service right now, but here is what your record actually shows: ${readTutorSummary(ctx)} If you want more time on a unit, use the button below — it goes through the same planner as the Today screen.`;
  }
  return `I can't reach the explanation service right now, so I won't guess at an answer. What I can tell you from your own data: ${readTutorSummary(ctx)}`;
}

function readTutorSummary(ctx: TutorContext): string {
  const w = ctx.weakConcepts.slice(0, 3).map((c) => `${c.name} (${Math.round(c.mastery * 100)}%)`);
  return [
    `coverage ${ctx.overview.coveragePct}%`,
    `${ctx.overview.reviewsDue} reviews due`,
    `${ctx.overview.openMistakes} open mistakes`,
    w.length ? `weakest concepts: ${w.join(", ")}` : "no weak concepts recorded",
  ].join("; ") + ".";
}
