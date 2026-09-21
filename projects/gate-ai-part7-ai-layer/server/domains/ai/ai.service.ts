import { generateText, streamText, embed } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { withBudgetGuard, type BudgetGuardConfig } from "./budget-guard";
import type { AIUsageRecord } from "./types";

/**
 * server/domains/ai/ai.service.ts
 *
 * Generic AIService (see architecture doc §41 "AI Service").
 * Everything downstream (explanation/hint/mistake-classifier/extractor)
 * calls THIS module, never the provider SDK directly — that keeps model
 * routing, budget enforcement, and provider swaps in one place.
 *
 * No model router in V1 (explicitly deferred) — one fixed model per
 * purpose, chosen below. Revisit only after Phase C is stable.
 */

const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001";
const PROVIDER = "anthropic";

function model() {
  return anthropic(MODEL);
}

// Rough per-model cost table in cents per 1K tokens (input, output).
// Update when the model changes. This is an estimate for the budget
// guard, not a billing-accurate figure.
const COST_PER_1K_CENTS: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 0.08, out: 0.4 },
  "claude-sonnet-4-6": { in: 0.3, out: 1.5 },
};

function estimateCostCents(inputTokens: number, outputTokens: number) {
  const rate = COST_PER_1K_CENTS[MODEL] ?? { in: 0.3, out: 1.5 };
  return (inputTokens / 1000) * rate.in + (outputTokens / 1000) * rate.out;
}

export interface GenerateTextOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  purpose: AIUsageRecord["purpose"];
  budgetConfig?: BudgetGuardConfig;
}

export async function generateTextGuarded(
  opts: GenerateTextOptions
): Promise<string> {
  return withBudgetGuard(
    opts.purpose,
    PROVIDER,
    MODEL,
    async () => {
      const res = await generateText({
        model: model(),
        system: opts.system,
        prompt: opts.prompt,
        maxTokens: opts.maxTokens ?? 500,
      });
      return {
        result: res.text,
        inputTokens: res.usage?.promptTokens,
        outputTokens: res.usage?.completionTokens,
        estimatedCostCents: estimateCostCents(
          res.usage?.promptTokens ?? 0,
          res.usage?.completionTokens ?? 0
        ),
      };
    },
    opts.budgetConfig
  );
}

export interface GenerateStructuredOptions<T extends z.ZodTypeAny> {
  system: string;
  prompt: string;
  schema: T;
  purpose: AIUsageRecord["purpose"];
  maxTokens?: number;
  budgetConfig?: BudgetGuardConfig;
}

/**
 * Structured output via strict-JSON prompting + Zod validation.
 * Retries once on parse/validation failure before surfacing an error to
 * the caller — callers must treat a thrown error as "AI unavailable" and
 * fall back to the deterministic/manual path, per the golden rule.
 */
export async function generateStructuredGuarded<T extends z.ZodTypeAny>(
  opts: GenerateStructuredOptions<T>
): Promise<z.infer<T>> {
  const jsonSystem = `${opts.system}

Respond with ONLY a single JSON object matching the required shape.
No markdown code fences, no preamble, no commentary — JSON only.`;

  const attempt = async (): Promise<z.infer<T>> => {
    const raw = await generateTextGuarded({
      system: jsonSystem,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens ?? 600,
      purpose: opts.purpose,
      budgetConfig: opts.budgetConfig,
    });
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return opts.schema.parse(parsed);
  };

  try {
    return await attempt();
  } catch (err) {
    // One repair retry: tell the model exactly what went wrong.
    const raw2 = await generateTextGuarded({
      system: jsonSystem,
      prompt: `${opts.prompt}\n\nYour previous response was invalid (${
        err instanceof Error ? err.message : String(err)
      }). Return valid JSON only, matching the required shape exactly.`,
      maxTokens: opts.maxTokens ?? 600,
      purpose: opts.purpose,
      budgetConfig: opts.budgetConfig,
    });
    const cleaned2 = raw2.replace(/```json|```/g, "").trim();
    const parsed2 = JSON.parse(cleaned2);
    return opts.schema.parse(parsed2);
  }
}

export interface StreamOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

/**
 * Streaming is used only for the tutor chat UI (Part 7 /app/tutor).
 * Budget accounting for streamed responses happens on completion via
 * onFinish, since token usage isn't known until the stream ends.
 */
export function streamGuarded(opts: StreamOptions, purpose: AIUsageRecord["purpose"] = "explanation") {
  return streamText({
    model: model(),
    system: opts.system,
    prompt: opts.prompt,
    maxTokens: opts.maxTokens ?? 500,
    onFinish: ({ usage }) => {
      // Fire-and-forget usage logging; do not block the stream response.
      import("./budget-guard").then(({ recordUsage }) => {
        recordUsage({
          provider: PROVIDER,
          model: MODEL,
          purpose,
          requestCount: 1,
          inputTokens: usage?.promptTokens ?? null,
          outputTokens: usage?.completionTokens ?? null,
          estimatedCostCents: estimateCostCents(
            usage?.promptTokens ?? 0,
            usage?.completionTokens ?? 0
          ),
          cacheHit: false,
        });
      });
    },
  });
}

export interface EmbedOptions {
  text: string;
}

/**
 * Not used by V1 (RAG/pgvector deferred). Kept as a stable interface
 * point so Phase 8 (RAG) has a single place to wire in later without
 * touching every caller of AIService.
 */
export async function embedText(opts: EmbedOptions): Promise<number[]> {
  throw new Error(
    "embedText() is not enabled in V1 — RAG/embeddings are explicitly deferred (see architecture doc §Explicitly Deferred)."
  );
}

export const AIService = {
  generateText: generateTextGuarded,
  generateStructured: generateStructuredGuarded,
  stream: streamGuarded,
  embed: embedText,
};
