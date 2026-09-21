import type { AIUsageRecord } from "./types";

/**
 * Hard AI budget/quota guard (V1 requirement — see
 * GATE_AI_ARCHITECTURE_UPDATED_V1.md, "AI Budget Guard").
 *
 * When the limit is reached: cached results may still be served, but the
 * core application MUST continue working with AI disabled. Nothing in
 * Parts 1-6 may depend on AI being available.
 *
 * Swap the in-memory store below for a real `AIUsageLog` Prisma table
 * (see prisma/schema-additions-part7.prisma) before shipping — this file
 * is written so that swap only touches `recordUsage` / `getTodaySpendCents`.
 */

export interface BudgetGuardConfig {
  /** Hard daily ceiling in USD cents. Exceeding it disables new AI calls. */
  dailyCapCents: number;
  /** Soft warning threshold (fraction of dailyCapCents), e.g. 0.8 */
  warnThresholdFraction: number;
}

export const DEFAULT_BUDGET_CONFIG: BudgetGuardConfig = {
  dailyCapCents: 200, // $2.00/day hard cap for a single-user app
  warnThresholdFraction: 0.8,
};

// --- naive in-memory store (dev/testing) -----------------------------------
// Replace with a Prisma-backed implementation for production. Keeping this
// isolated behind the same function signatures means nothing else in the
// AI layer needs to change.
const usageLog: AIUsageRecord[] = [];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recordUsage(record: Omit<AIUsageRecord, "date">): void {
  usageLog.push({ ...record, date: todayKey() });
}

export function getTodaySpendCents(): number {
  const today = todayKey();
  return usageLog
    .filter((r) => r.date === today)
    .reduce((sum, r) => sum + (r.estimatedCostCents ?? 0), 0);
}

export function getTodayUsage(): AIUsageRecord[] {
  const today = todayKey();
  return usageLog.filter((r) => r.date === today);
}

// --- guard -------------------------------------------------------------

export class BudgetExceededError extends Error {
  constructor(spentCents: number, capCents: number) {
    super(
      `AI daily budget exceeded: spent ${spentCents}c of ${capCents}c cap. ` +
        `AI calls are disabled until midnight UTC; cached results still work.`
    );
    this.name = "BudgetExceededError";
  }
}

/**
 * Call before every live (non-cached) AI request. Throws if the daily cap
 * is already exceeded — callers must catch this and fall back to a
 * cached/deterministic path, never surface a raw 500 to the user.
 */
export function assertBudgetAvailable(
  config: BudgetGuardConfig = DEFAULT_BUDGET_CONFIG
): void {
  const spent = getTodaySpendCents();
  if (spent >= config.dailyCapCents) {
    throw new BudgetExceededError(spent, config.dailyCapCents);
  }
}

export function isNearBudgetLimit(
  config: BudgetGuardConfig = DEFAULT_BUDGET_CONFIG
): boolean {
  const spent = getTodaySpendCents();
  return spent >= config.dailyCapCents * config.warnThresholdFraction;
}

/**
 * Wraps an AI call with budget enforcement + usage logging in one place,
 * so individual services (explanation/hint/mistake-classifier/extractor)
 * never have to remember to do both steps themselves.
 */
export async function withBudgetGuard<T>(
  purpose: AIUsageRecord["purpose"],
  provider: string,
  model: string,
  fn: () => Promise<{
    result: T;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostCents?: number;
  }>,
  config: BudgetGuardConfig = DEFAULT_BUDGET_CONFIG
): Promise<T> {
  assertBudgetAvailable(config);

  const { result, inputTokens, outputTokens, estimatedCostCents } =
    await fn();

  recordUsage({
    provider,
    model,
    purpose,
    requestCount: 1,
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    estimatedCostCents: estimatedCostCents ?? null,
    cacheHit: false,
  });

  return result;
}
