import Link from "next/link";
import type { ReactNode } from "react";

export type NavKey = "today" | "syllabus" | "practice" | "tests" | "mistakes";

const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;

const NAV: { key: NavKey; href: string; label: string; icon: ReactNode }[] = [
  { key: "today", href: "/dashboard", label: "Today", icon: <svg {...ICON}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg> },
  { key: "syllabus", href: "/syllabus", label: "Syllabus", icon: <svg {...ICON}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg> },
  { key: "practice", href: "/practice", label: "Practice", icon: <svg {...ICON}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
  { key: "tests", href: "/tests", label: "Tests", icon: <svg {...ICON}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg> },
  { key: "mistakes", href: "/mistakes", label: "Mistakes", icon: <svg {...ICON}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg> },
];

interface Props {
  active: NavKey;
  /** First letter shown in the avatar. */
  initial?: string;
  /** Right insight panel (320px). Omit for two-column pages. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * Full-bleed three-column shell from design.md: 76px icon rail, flexible main,
 * 320px insight panel, hairline dividers, no outer frame.
 * If your Part 1 layout already renders this shell, use only the children.
 */
export function AppShell({ active, initial = "G", aside, children }: Props) {
  const cols = aside ? "lg:grid-cols-[76px_minmax(0,1fr)_320px]" : "lg:grid-cols-[76px_minmax(0,1fr)]";
  return (
    <div className={`grid min-h-screen grid-cols-1 bg-[#F8F6F2] text-[#111111] ${cols}`}>
      <aside className="hidden flex-col items-center justify-between border-r border-[#E3E0DA] py-6 lg:flex">
        <div className="flex flex-col items-center gap-1">
          <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-white" aria-hidden="true">G</div>
          <nav aria-label="Main" className="flex flex-col gap-2">
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                title={n.label}
                aria-label={n.label}
                aria-current={n.key === active ? "page" : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-full ${n.key === active ? "bg-[#111111] text-white" : "text-[#77736D] hover:bg-[#ECE9E3]"}`}
              >
                {n.icon}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D0CCF4] text-xs font-semibold" aria-hidden="true">{initial}</div>
      </aside>

      <div className="min-w-0">
        {/* Phones have no rail, so the same five destinations sit in a top bar. */}
        <nav aria-label="Main" className="flex items-center justify-between border-b border-[#E3E0DA] px-4 py-3 lg:hidden">
          {NAV.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              aria-label={n.label}
              aria-current={n.key === active ? "page" : undefined}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${n.key === active ? "bg-[#111111] text-white" : "text-[#77736D]"}`}
            >
              {n.icon}
            </Link>
          ))}
        </nav>
        <main className={`flex flex-col gap-7 p-6 md:p-10 ${aside ? "lg:border-r lg:border-[#E3E0DA]" : ""}`}>{children}</main>
      </div>

      {aside && <aside className="flex flex-col gap-6 border-t border-[#E3E0DA] p-6 lg:border-t-0">{aside}</aside>}
    </div>
  );
}
