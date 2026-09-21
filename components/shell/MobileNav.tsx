"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS, NAV_ITEMS, MOBILE_NAV_ITEMS, type NavKey } from "./nav";
import { activeFromPath } from "./NavRail";

/**
 * Phone navigation: a sticky header with a slide-out drawer, and a bottom bar
 * for the four destinations that matter most on a phone. Replaces the old
 * top row of five unlabelled icons, which was easy to mis-tap on a narrow
 * screen and hid the other five destinations entirely.
 */
export function MobileNav({ active = "today", initial = "G" }: { active?: NavKey; initial?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = activeFromPath(pathname) ?? active;

  // Also closes the drawer after a tapped link navigates.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E3E0DA] bg-[#F8F6F2]/95 px-4 py-2 backdrop-blur">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-[#111111]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-xs font-semibold text-white" aria-hidden="true">
            G
          </span>
          GATE AI
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#111111] hover:bg-[#ECE9E3]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 h-full w-full bg-[#111111]/30"
            onClick={() => setOpen(false)}
          />
          <nav
            aria-label="All destinations"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col gap-6 overflow-y-auto bg-[#F8F6F2] p-6 shadow-xl"
          >
            {NAV_GROUPS.map((group) => (
              <section key={group.label}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#77736D]">{group.label}</p>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {group.keys.map((key) => {
                    const item = NAV_ITEMS.find((n) => n.key === key);
                    if (!item) return null;
                    const isActive = key === current;
                    return (
                      <li key={key}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-sm ${
                            isActive ? "bg-[#111111] text-white" : "text-[#111111] hover:bg-[#ECE9E3]"
                          }`}
                        >
                          {item.icon}
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <div className="mt-auto flex items-center gap-3 border-t border-[#E3E0DA] pt-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D0CCF4] text-xs font-semibold" aria-hidden="true">
                {initial}
              </span>
              <span className="text-sm text-[#77736D]">Signed in</span>
            </div>
          </nav>
        </div>
      )}

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-between gap-1 border-t border-[#E3E0DA] bg-[#F8F6F2]/95 px-2 py-1 backdrop-blur"
        style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        {MOBILE_NAV_ITEMS.map((n) => {
          const isActive = n.key === current;
          return (
            <Link
              key={n.key}
              href={n.href}
              aria-label={n.label}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] ${
                isActive ? "text-[#111111]" : "text-[#77736D]"
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${isActive ? "bg-[#111111] text-white" : ""}`}>
                {n.icon}
              </span>
              <span className="truncate">{n.short}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}