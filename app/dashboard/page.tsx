import { MasteryRing } from "@/components/ui/MasteryRing";
import { PriorityBar } from "@/components/ui/PriorityBar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";

/**
 * Today screen — Part 1 ships this as a static layout with representative
 * data; Part 3/5 wire it to real ConceptStats/planner output. Kept here
 * so the design system is proven against real content immediately,
 * per the frontend-design skill ("build with the brief's real content
 * throughout").
 */
export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold text-fog">Today</h1>
        <span className="text-sm text-slate">47 days to exam</span>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3px_1fr_260px]">
        {/* priority spine runs visually across the whole left column via each row's own bar */}
        <div className="hidden lg:block" aria-hidden />

        <section className="border border-slate/30">
          <PriorityBar urgency="due">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate">Next target</p>
                <h2 className="font-display text-lg font-semibold text-fog">
                  OS &rarr; Memory Management &rarr; Page Replacement
                </h2>
                <p className="mt-1 max-w-prose text-sm text-fog/80">
                  Recent accuracy is low and FIFO/LRU mistakes keep repeating.
                  PYQ performance on this concept is 48%.
                </p>
              </div>
              <MasteryRing mastery={43} label="mastery" size={80} />
            </div>
          </PriorityBar>

          <PriorityBar urgency="due">
            <div className="flex items-center justify-between">
              <p className="text-sm text-fog">
                Review page replacement, then 5 medium questions
              </p>
              <Button variant="primary">Start review</Button>
            </div>
          </PriorityBar>

          <PriorityBar urgency="on-track">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fog">Daily practice set</span>
              <span className="text-slate">8 / 10 complete</span>
            </div>
          </PriorityBar>

          <PriorityBar urgency="snoozed">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fog">Reviews due</span>
              <span className="text-amber">6 concepts</span>
            </div>
          </PriorityBar>
        </section>

        <aside className="flex flex-col gap-6 border border-slate/30 p-5">
          <ProgressBar value={72} tone="teal" label="Syllabus coverage" />
          <ProgressBar value={59} tone="teal" label="Concept mastery" />
          <ProgressBar value={41} tone="amber" label="Revision backlog" />
          <div>
            <p className="text-xs text-slate">Mock readiness</p>
            <p className="font-display text-lg font-semibold text-fog">2 / 8 taken</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
