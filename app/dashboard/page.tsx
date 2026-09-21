import Link from "next/link";
import { redirect } from "next/navigation";
import { ConceptGateList } from "@/components/dashboard/ConceptGateList";
import { CoverageBadge } from "@/components/dashboard/CoverageBadge";
import { MasteryBar } from "@/components/dashboard/MasteryBar";
import { StatTile } from "@/components/dashboard/StatTile";
import { SubjectBadge } from "@/components/dashboard/SubjectBadge";
import { WeakConceptList } from "@/components/dashboard/WeakConceptList";
import { AppShell } from "@/components/shell/AppShell";
import { primaryReason } from "@/lib/reason-text";
import { ui } from "@/lib/ui-tokens";
import { getCurrentUser } from "@/server/auth/session";
import { DEFAULT_MASTERY_CONFIG } from "@/server/domains/mastery/mastery.config";
import {
  getConceptGate,
  getContinueLearning,
  getOverview,
  getPendingRevision,
  getWeakConcepts,
  getWeakUnitReport,
} from "@/server/domains/mastery/mastery.queries";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = (user as { name?: string | null }).name || user!.email.split("@")[0] || "Student";

  const [overview, continueLearning, weakUnits, weakConcepts, revision] = await Promise.all([
    getOverview(user.id),
    getContinueLearning(user.id, 3),
    getWeakUnitReport(user.id, 1),
    getWeakConcepts(user.id, 4),
    getPendingRevision(user.id, 4),
  ]);
  const focusUnit = weakUnits[0];
  const gate = focusUnit ? await getConceptGate(user.id, focusUnit.unitId) : [];

  const n = overview.weakConceptCount;
  const heading =
    n > 0
      ? `${plural(n, "weak concept needs", "weak concepts need")} work today.`
      : overview.unitsStarted === 0
        ? "Start with a topic quiz."
        : "No weak concepts right now.";
  const sub = `Your revision queue has ${plural(overview.reviewsDue, "item", "items")} due and ${plural(overview.openMistakes, "mistake is", "mistakes are")} still open.`;

  const change =
    overview.questionsPrev7d > 0
      ? Math.round(((overview.questionsLast7d - overview.questionsPrev7d) / overview.questionsPrev7d) * 100)
      : null;

  const aside = (
    <>
      <Link href="/study-report" className={`${ui.btn} w-full`}>+ Log study session</Link>

      <Link
        href="/tutor"
        className="text-sm text-[#111111] underline-offset-2 hover:underline"
      >
        Tutor — describe a session and I&apos;ll draft the report
      </Link>

      <section aria-labelledby="pending-revision">
        <h2 id="pending-revision" className="mb-2 text-sm font-semibold text-[#111111]">Pending revision</h2>
        {revision.length === 0 ? (
          <p className="text-sm text-[#77736D]">Nothing due. Reviews are scheduled as you practice.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {revision.map((r) => (
              <li key={r.conceptId}>
                {r.retention === null ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#111111]">{r.name}</span>
                    <span className="text-[#77736D]">New</span>
                  </div>
                ) : (
                  <MasteryBar label={r.name} value={r.retention} tone="teal" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="needs-attention">
        <h2 id="needs-attention" className="mb-2 text-sm font-semibold text-[#111111]">Needs attention</h2>
        <WeakConceptList items={weakConcepts} />
      </section>
    </>
  );

  return (
    <AppShell active="today" initial={(name[0] ?? "G").toUpperCase()} aside={aside}>
      <div>
        <p className="text-sm text-[#77736D]">Welcome back,</p>
        <h1 className="text-xl font-semibold text-[#111111]">{name}</h1>
      </div>

      <section aria-label="Today" className="rounded-[24px] bg-[#0E8074] p-7 text-white md:p-8">
        <h2 className="font-semibold leading-[1.05]" style={{ fontSize: "clamp(24px,2.6vw,34px)" }}>{heading}</h2>
        <p className="mt-2 max-w-md text-sm text-white/80">{sub}</p>
      </section>

      <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          fill={ui.tile.butter}
          label="Questions this week"
          value={String(overview.questionsLast7d)}
          delta={change === null ? null : { text: `${change >= 0 ? "\u2191" : "\u2193"} ${Math.abs(change)}%`, tone: change >= 0 ? "good" : "attention" }}
          note={`${overview.questionsLast24h} in the last 24 hours`}
        />
        <StatTile
          fill={ui.tile.sky}
          label="Syllabus coverage"
          value={`${Math.round(overview.coverage * 100)}%`}
          note={`${overview.unitsStarted} / ${overview.totalUnits} units started`}
        />
        <StatTile
          fill={ui.tile.lavender}
          label="Open mistakes"
          value={String(overview.openMistakes)}
          delta={overview.untaggedMistakes > 0 ? { text: `${overview.untaggedMistakes} to tag`, tone: "attention" } : null}
          note="Tag why you missed them"
        />
      </section>

      <section aria-labelledby="continue">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="continue" className="font-semibold text-[#111111]">Continue learning</h2>
          <span className="text-sm text-[#77736D]">{overview.weakUnitCount} in progress</span>
        </div>
        {continueLearning.length === 0 ? (
          <p className="text-sm text-[#77736D]">No units in progress. Take a topic quiz or log a study session to start one.</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
            {continueLearning.map((u) => (
              <li key={u.unitId}>
                <Link href={`/syllabus/${u.subjectId}`} className="block h-full rounded-[20px] border border-[#E3E0DA] bg-white p-5">
                  <SubjectBadge subject={u.subject} subjectId={u.subjectId} />
                  <p className="mt-3 font-semibold text-[#111111]">{u.unit}</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#77736D]">{u.subject}</p>
                    <CoverageBadge status={u.status} />
                  </div>
                  <MasteryBar value={u.coverage} caption={`${Math.round(u.coverage * 100)}% covered`} />
                  {primaryReason(u.reasons) && <p className="mt-1 text-xs text-[#3a3a3a]">{primaryReason(u.reasons)}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {focusUnit && gate.length > 0 && (
        <ConceptGateList title={`${focusUnit.unit}: concepts`} items={gate} gateAt={DEFAULT_MASTERY_CONFIG.prerequisiteGateAt} />
      )}
    </AppShell>
  );
}
