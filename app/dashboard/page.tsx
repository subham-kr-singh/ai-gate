import {
  TopBar,
  DashboardHero,
  SubjectFilter,
  SubjectGrid,
  TodayPriority,
  ContinueLearning,
  RightInsightPanel,
} from "@/components/dashboard/DashboardUI";

export default function DashboardPage() {
  return (
    <>
      <main className="flex-1 flex flex-col p-8 overflow-y-auto min-w-0">
        <TopBar />
        <div className="max-w-4xl mx-auto w-full">
          <DashboardHero />
          <SubjectFilter />
          <SubjectGrid />
          <TodayPriority />
          <ContinueLearning />
        </div>
      </main>
      <RightInsightPanel />
    </>
  );
}
