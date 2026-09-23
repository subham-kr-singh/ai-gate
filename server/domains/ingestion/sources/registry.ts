/**
 * Source adapter registry.
 *
 * Adding a source is one adapter file plus one entry here — the runner,
 * dedup, validation and review UI are all source-agnostic.
 */
import { ExamSideAdapter } from "./examside.adapter";
import { GopdfsAdapter } from "./gopdfs.adapter";
import { OfficialArchiveAdapter } from "./official-archive.adapter";
import type { SourceAdapter } from "./types";

const ADAPTERS: SourceAdapter[] = [
  new GopdfsAdapter(),
  new ExamSideAdapter(),
  new OfficialArchiveAdapter(),
];

const BY_ID = new Map(ADAPTERS.map((a) => [a.id, a]));

export function allAdapters(): SourceAdapter[] {
  return ADAPTERS;
}

export function getAdapter(id: string): SourceAdapter {
  const adapter = BY_ID.get(id);
  if (!adapter) {
    throw new Error(
      `Unknown source "${id}". Available: ${ADAPTERS.map((a) => a.id).join(", ")}`
    );
  }
  return adapter;
}

/** Parses `--source gopdfs,examside` into adapters, defaulting to all. */
export function resolveAdapters(spec: string | undefined): SourceAdapter[] {
  if (!spec) return ADAPTERS;
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(getAdapter);
}
