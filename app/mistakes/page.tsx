import { redirect } from "next/navigation";
import { MistakeActions } from "@/components/mistakes/MistakeActions";
import { AppShell } from "@/components/shell/AppShell";
import { ui } from "@/lib/ui-tokens";
import { getCurrentUser } from "@/server/auth/session";
import { getMistakeSummary, listMistakes } from "@/server/domains/mistakes/mistake.service";
import { MISTAKE_TYPES, MISTAKE_TYPE_LABELS, type MistakeFilters } from "@/server/domains/mistakes/mistake.types";
import { listUnitsWithSubjects } from "@/server/domains/syllabus/syllabus.lookup";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function MistakesPage(props: { searchParams: Promise<SP> | SP }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await props.searchParams;
  const type = one(sp.type);
  const status = one(sp.status);
  const filters: MistakeFilters = {
    type: type === "UNTAGGED" || (MISTAKE_TYPES as readonly string[]).includes(type ?? "") ? (type as MistakeFilters["type"]) : undefined,
    subjectId: one(sp.subjectId),
    unitId: one(sp.unitId),
    status: status === "resolved" || status === "all" ? status : "open",
    limit: 100,
  };

  const [items, summary, units] = await Promise.all([
    listMistakes(user.id, filters),
    getMistakeSummary(user.id),
    listUnitsWithSubjects(),
  ]);
  const subjects = [...new Map(units.map((u) => [u.subjectId, u.subject])).entries()];
  const filtered = Boolean(filters.type || filters.subjectId || filters.unitId || filters.status !== "open");
  const initial = ((user as { name?: string | null }).name || user.email)[0]?.toUpperCase();

  return (
    <AppShell active="mistakes" initial={initial}>
      <div>
        <h1 className="text-xl font-semibold text-ink">Mistake notebook</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-slate">
          Every wrong answer lands here. Tag why you missed it in one tap. A later correct answer to the same question resolves it.
        </p>
      </div>

      <section aria-label="Open mistakes by type" className={`${ui.card} p-5`}>
        <p className="text-sm font-semibold tabular-nums text-ink">
          {summary.open} open, <span className={summary.untagged > 0 ? "text-amber" : ""}>{summary.untagged} not tagged yet</span>
        </p>
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-sm tabular-nums">
          {MISTAKE_TYPES.map((t) => (
            <li key={t}><span className="text-slate">{MISTAKE_TYPE_LABELS[t]}</span> {summary.byType[t]}</li>
          ))}
        </ul>
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-ink">
          <span className="mb-1 block">Subject</span>
          <select name="subjectId" defaultValue={filters.subjectId ?? ""} className={ui.field}>
            <option value="">All subjects</option>
            {subjects.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
          </select>
        </label>
        <label className="text-sm text-ink">
          <span className="mb-1 block">Unit</span>
          <select name="unitId" defaultValue={filters.unitId ?? ""} className={`${ui.field} max-w-[16rem]`}>
            <option value="">All units</option>
            {units.map((u) => (<option key={u.unitId} value={u.unitId}>{u.subject}: {u.unit}</option>))}
          </select>
        </label>
        <label className="text-sm text-ink">
          <span className="mb-1 block">Type</span>
          <select name="type" defaultValue={filters.type ?? ""} className={ui.field}>
            <option value="">All types</option>
            <option value="UNTAGGED">Not tagged yet</option>
            {MISTAKE_TYPES.map((t) => (<option key={t} value={t}>{MISTAKE_TYPE_LABELS[t]}</option>))}
          </select>
        </label>
        <label className="text-sm text-ink">
          <span className="mb-1 block">Status</span>
          <select name="status" defaultValue={filters.status} className={ui.field}>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">Open and resolved</option>
          </select>
        </label>
        <button type="submit" className={ui.btn}>Apply filters</button>
        {filtered && <a href="/mistakes" className="pb-2 text-sm text-slate underline">Clear filters</a>}
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-slate">
          {filtered
            ? "No mistakes match these filters. Clear them to see everything."
            : "No open mistakes. Wrong answers from quizzes and tests will appear here."}
        </p>
      ) : (
        <ul className={`${ui.card} m-0 list-none divide-y ${ui.divide} p-0`}>
          {items.map((m) => (
            <li key={m.id} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">
                  {m.concepts.length ? m.concepts.join(", ") : (m.unitLabel ?? "Unmapped question")}
                </span>
                <time dateTime={m.createdAt.toISOString()} className="text-xs tabular-nums text-slate">
                  {m.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </time>
              </div>
              {m.unitLabel && (
                <p className="text-xs text-slate">{m.subjectLabel ? `${m.subjectLabel}, ` : ""}{m.unitLabel}</p>
              )}
              <p className="mt-1 text-sm">
                <span className={m.mistakeType ? "text-ink" : "text-amber"}>
                  {m.mistakeType ? MISTAKE_TYPE_LABELS[m.mistakeType] : "Not tagged yet"}
                </span>
                {m.resolved && <span className="text-teal">, resolved</span>}
              </p>
              {m.note && <p className="mt-1 max-w-[70ch] text-sm text-body-muted">{m.note}</p>}
              <MistakeActions mistakeId={m.id} current={m.mistakeType} resolved={m.resolved} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
