"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, type NavKey } from "./nav";

/** Desktop icon rail (76px). Client-side only so the active item can follow
 * the current route without every page passing its key correctly by hand. */
export function NavRail({ active = "today", initial = "G" }: { active?: NavKey; initial?: string }) {
  const pathname = usePathname();
  const current = activeFromPath(pathname) ?? active;

  return (
    <aside className="hidden flex-col items-center justify-between border-r border-line py-6 lg:flex">
      <div className="flex flex-col items-center">
        <Link
          href="/dashboard"
          aria-label="GATE AI — Dashboard"
          className="mb-5 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white"
        >
          G
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-2">
          {NAV_ITEMS.map((n) => {
            const isActive = n.key === current;
            return (
              <Link
                key={n.key}
                href={n.href}
                title={n.label}
                aria-label={n.label}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                  isActive ? "bg-ink text-white" : "text-slate hover:bg-control hover:text-ink"
                }`}
              >
                {n.icon}
              </Link>
            );
          })}
        </nav>
      </div>
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-lavender text-xs font-semibold"
        title="Signed in"
        aria-hidden="true"
      >
        {initial}
      </div>
    </aside>
  );
}

const PATH_TO_KEY: [RegExp, NavKey][] = [
  [/^\/planner|^\/dashboard|^\/study-report|^\/tutor/, "today"],
  [/^\/syllabus/, "syllabus"],
  [/^\/practice/, "practice"],
  [/^\/tests/, "tests"],
  [/^\/mocks/, "mocks"],
  [/^\/mistakes/, "mistakes"],
  [/^\/flashcards/, "flashcards"],
  [/^\/reports/, "reports"],
  [/^\/review/, "review"],
];

export function activeFromPath(pathname: string): NavKey | null {
  for (const [re, key] of PATH_TO_KEY) if (re.test(pathname)) return key;
  return null;
}
