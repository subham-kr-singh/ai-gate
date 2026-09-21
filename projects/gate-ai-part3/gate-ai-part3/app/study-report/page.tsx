import { redirect } from "next/navigation";
import { StudyReportForm } from "@/components/study/StudyReportForm";
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
        <h1 className="text-xl font-semibold text-[#111111]">Log study session</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-[#77736D]">
          Use this for work you did outside the app. It counts as evidence at reduced weight and never marks a unit complete on its own.
        </p>
      </div>
      <StudyReportForm units={units} />
    </AppShell>
  );
}
