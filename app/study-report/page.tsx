import { redirect } from "next/navigation";
import { StudyReportForm } from "@/components/study/StudyReportForm";
import { DetectedSessions } from "@/components/study/DetectedSessions";
import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUser } from "@/server/auth/session";
import { listUnitsWithTopics } from "@/server/domains/syllabus/syllabus.lookup";

export default async function StudyReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const units = await listUnitsWithTopics();
  const initial = ((user as { name?: string | null }).name || user.email)[0]?.toUpperCase();

  return (
    <AppShell active="today" initial={initial}>
      <div>
        <h1 className="text-xl font-semibold text-ink">Log study session</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-slate">
          Your in-app work is recorded for you — Practice, Tests and Mocks appear
          below automatically. Only add a session manually for work you did
          elsewhere, and note that it counts as evidence at reduced weight.
        </p>
      </div>

      <section className="mt-7 flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">Recorded for you</h2>
        <DetectedSessions />
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">Add a session manually</h2>
        <StudyReportForm units={units} />
      </section>
    </AppShell>
  );
}
