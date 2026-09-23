import type { ReactNode } from "react";
import { NavRail } from "./NavRail";
import { MobileNav } from "./MobileNav";
import type { NavKey } from "./nav";

interface Props {
  /** Fallback for the active rail item; both nav components prefer the real
   * route, so a stale value only affects the server-rendered first paint. */
  active?: NavKey;
  /** First letter shown in the rail avatar and the drawer footer. */
  initial?: string;
  /** Right insight panel (320px). Omit for a two-column page. */
  aside?: ReactNode;
  /**
   * "wide" (default) fills the column, for dashboards and grids. "reading"
   * caps it, for forms and lists that would look stranded at 1600px.
   */
  width?: "wide" | "reading";
  children: ReactNode;
}

/**
 * The single shell for every page (DESIGN.md §1): full-bleed, 76px icon rail,
 * flexible main column, hairline dividers, no outer frame. Pages render only
 * their content — no page builds its own shell.
 */
export function AppShell({ active = "today", initial = "G", aside, width = "wide", children }: Props) {
  const cols = aside
    ? "lg:grid-cols-[76px_minmax(0,1fr)_320px]"
    : "lg:grid-cols-[76px_minmax(0,1fr)]";

  // pb-28 clears the fixed mobile bar; the reading cap is applied to the inner
  // block so the divider still spans the full column.
  const main = (
    <main
      className={`flex min-w-0 flex-col gap-7 px-5 pb-28 pt-5 md:px-10 md:pt-8 lg:pb-10 ${
        aside ? "lg:border-r lg:border-line" : ""
      }`}
    >
      {width === "reading" ? <div className="mx-auto w-full max-w-[52rem]">{children}</div> : children}
    </main>
  );

  return (
    <div className={`grid min-h-screen grid-cols-1 bg-surface text-ink ${cols}`}>
      <NavRail active={active} initial={initial} />

      <div className="flex min-w-0 flex-col">
        <MobileNav active={active} initial={initial} />
        {main}
      </div>

      {aside && (
        <aside className="flex flex-col gap-6 border-t border-line px-5 pb-28 pt-6 md:px-10 lg:border-t-0 lg:px-6 lg:pb-10">
          {aside}
        </aside>
      )}
    </div>
  );
}
