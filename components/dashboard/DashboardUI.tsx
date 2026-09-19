import { ReactNode } from "react";
import { Search, Bell, Settings } from "lucide-react";

export function TopBar() {
  return (
    <header className="flex items-center justify-between h-[60px] mb-6">
      <div className="font-display font-semibold text-lg text-ink-soft">
        GATE / Dashboard
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="text"
            placeholder="Search topics, concepts, questions..."
            className="w-[260px] h-[40px] pl-9 pr-4 bg-control rounded-full text-sm text-ink outline-none focus:ring-2 focus:ring-ink transition-all placeholder:text-ink-muted"
          />
        </div>
        <button className="text-ink-muted hover:text-ink transition-colors">
          <Bell size={20} />
        </button>
      </div>
    </header>
  );
}

export function DashboardHero() {
  return (
    <section className="mb-8">
      <h1 className="font-display text-[54px] leading-[1.05] font-semibold text-ink mb-3">
        Keep your
        <br />
        GATE streak alive.
      </h1>
      <p className="text-lg text-ink-soft">
        3 high-priority concepts are ready for today&apos;s session.
      </p>
    </section>
  );
}

const subjects = [
  "All",
  "Algorithms",
  "OS",
  "DBMS",
  "Networks",
  "COA",
  "Programming",
  "Mathematics",
];

export function SubjectFilter() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-4 mb-6 no-scrollbar">
      {subjects.map((subject, idx) => (
        <button
          key={subject}
          className={`h-10 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            idx === 0
              ? "bg-ink text-app-surface"
              : "bg-control text-ink hover:bg-line"
          }`}
        >
          {subject}
        </button>
      ))}
    </div>
  );
}

export function SubjectGrid() {
  const cards = [
    {
      title: "Algorithms",
      color: "bg-coral",
      mastery: 78,
      strong: "Trees · Sorting",
      weak: "Dynamic Programming",
    },
    {
      title: "Operating Systems",
      color: "bg-lavender",
      mastery: 64,
      strong: "Processes",
      weak: "Memory Management",
    },
    {
      title: "DBMS",
      color: "bg-butter",
      mastery: 71,
      strong: "SQL",
      weak: "Transactions",
    },
    {
      title: "Networks",
      color: "bg-mint",
      mastery: 59,
      strong: "IP",
      weak: "TCP",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 mb-8">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`${card.color} rounded-[24px] p-6 hover:brightness-95 transition-all cursor-pointer ring-offset-2 ring-offset-app-surface focus-visible:ring-2 focus-visible:ring-ink outline-none`}
          tabIndex={0}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-display font-semibold text-[20px] text-ink">
              {card.title}
            </h3>
            <span className="text-sm font-bold text-ink">{card.mastery}%</span>
          </div>
          <div className="text-sm text-ink-soft mb-6 space-y-1">
            <p>18 concepts · 142 questions</p>
            <p className="mt-2 text-teal font-medium">Strong: {card.strong}</p>
            <p className="text-rose font-medium">Needs work: {card.weak}</p>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-ink/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-ink rounded-full"
              style={{ width: `${card.mastery}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TodayPriority() {
  return (
    <div className="bg-coral rounded-[24px] p-8 mb-8">
      <h2 className="text-sm font-bold text-ink mb-4 tracking-wide uppercase">
        Today&apos;s Priority
      </h2>
      <h3 className="font-display text-[28px] font-semibold text-ink mb-1">
        Dynamic Programming
      </h3>
      <p className="text-lg text-ink-soft mb-6">Knapsack patterns</p>

      <p className="text-ink font-medium mb-8">
        Recent accuracy dropped from 71% → 54%.
      </p>

      <div className="flex gap-4">
        <button className="px-6 py-3 bg-ink text-app-surface rounded-full text-sm font-medium hover:bg-ink-soft transition-colors">
          Practice 12 questions
        </button>
        <button className="px-6 py-3 bg-app-surface/50 text-ink rounded-full text-sm font-medium hover:bg-app-surface transition-colors">
          Review concept
        </button>
      </div>
    </div>
  );
}

export function ContinueLearning() {
  const items = [
    { title: "OS", subtitle: "Processes", mastery: 62 },
    { title: "DBMS", subtitle: "Transactions", mastery: 84 },
    { title: "Algorithms", subtitle: "Graphs", mastery: 48 },
  ];

  return (
    <section>
      <div className="flex justify-between items-baseline mb-4">
        <h2 className="font-display font-semibold text-xl text-ink">
          Continue learning
        </h2>
        <button className="text-sm text-ink-muted hover:text-ink">
          View all
        </button>
      </div>
      <div className="flex gap-4">
        {items.map((item) => (
          <div
            key={item.title}
            className="flex-1 bg-card-surface border border-line rounded-[20px] p-5 cursor-pointer hover:border-ink-soft transition-colors"
          >
            <h4 className="font-display font-semibold text-ink mb-1">
              {item.title}
            </h4>
            <p className="text-sm text-ink-soft mb-6">{item.subtitle}</p>
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold text-ink">{item.mastery}%</span>
              <span className="text-teal font-medium">Resume</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RightInsightPanel() {
  return (
    <aside className="w-[320px] shrink-0 bg-panel-surface rounded-[24px] p-6 ml-6 h-full border border-line">
      {/* Profile Header */}
      <div className="flex justify-between items-start mb-10">
        <div className="w-12 h-12 rounded-full bg-ink flex items-center justify-center text-app-surface mb-4">
          A
        </div>
        <button className="text-ink-muted hover:text-ink">
          <Settings size={20} />
        </button>
      </div>
      <div className="mb-8">
        <h3 className="font-display font-semibold text-xl text-ink">
          Welcome back
        </h3>
        <p className="text-sm text-ink-soft">Your GATE workspace</p>
      </div>

      <div className="space-y-8">
        {/* Priority Spine Demo */}
        <section>
          <h4 className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-4">
            Today&apos;s Plan
          </h4>
          <div className="relative pl-4 space-y-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:bg-line before:rounded-full">
            <div className="relative">
              <div className="absolute -left-4 top-1 w-[3px] h-4 bg-teal rounded-full" />
              <p className="text-sm text-ink font-medium">Daily practice set</p>
              <p className="text-xs text-ink-muted mt-1">Recommended</p>
            </div>
            <div className="relative">
              <div className="absolute -left-4 top-1 w-[3px] h-4 bg-amber rounded-full" />
              <p className="text-sm text-ink font-medium">6 concepts due</p>
              <p className="text-xs text-ink-muted mt-1">Urgent review</p>
            </div>
            <div className="relative">
              <div className="absolute -left-4 top-1 w-[3px] h-4 bg-rose rounded-full" />
              <p className="text-sm text-ink font-medium">Fix weak concepts</p>
              <p className="text-xs text-ink-muted mt-1">
                DP · Page Replacement
              </p>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
