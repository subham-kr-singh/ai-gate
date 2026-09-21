import type { ReactNode } from "react";

export type NavKey =
  | "today"
  | "syllabus"
  | "practice"
  | "tests"
  | "mocks"
  | "mistakes"
  | "flashcards"
  | "reports";

interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  /** Short label for the mobile bar, which has much less room. */
  short: string;
  icon: ReactNode;
}

const ICON = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  "aria-hidden": true,
} as const;

/**
 * Every destination in one list. The rail renders all eight; the mobile bar
 * renders the four that matter on a phone (see MOBILE_BAR_KEYS below).
 */
export const NAV_ITEMS: NavItem[] = [
  {
    key: "today",
    href: "/planner",
    label: "Today",
    short: "Today",
    icon: (
      <svg {...ICON}>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    key: "syllabus",
    href: "/syllabus",
    label: "Syllabus",
    short: "Syllabus",
    icon: (
      <svg {...ICON}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    key: "practice",
    href: "/practice",
    label: "Practice",
    short: "Practice",
    icon: (
      <svg {...ICON}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    key: "tests",
    href: "/tests",
    label: "Tests",
    short: "Tests",
    icon: (
      <svg {...ICON}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    key: "mocks",
    href: "/mocks",
    label: "Mocks",
    short: "Mocks",
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: "mistakes",
    href: "/mistakes",
    label: "Mistakes",
    short: "Mistakes",
    icon: (
      <svg {...ICON}>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    ),
  },
  {
    key: "flashcards",
    href: "/flashcards",
    label: "Flashcards",
    short: "Cards",
    icon: (
      <svg {...ICON}>
        <rect x="2" y="6" width="16" height="12" rx="2" />
        <path d="M6 6V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
      </svg>
    ),
  },
  {
    key: "reports",
    href: "/reports",
    label: "Reports",
    short: "Reports",
    icon: (
      <svg {...ICON}>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </svg>
    ),
  },
];

/** Four tabs fit a phone bar without cramping; the drawer above carries all
 * eight, so nothing is unreachable on a phone. */
const MOBILE_BAR_KEYS: NavKey[] = ["today", "syllabus", "practice", "mistakes"];

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((n) => MOBILE_BAR_KEYS.includes(n.key));

/** Grouped for the slide-out drawer on phones, which has room for all eight. */
export const NAV_GROUPS: { label: string; keys: NavKey[] }[] = [
  { label: "Study", keys: ["today", "syllabus", "practice", "flashcards"] },
  { label: "Assess", keys: ["tests", "mocks", "mistakes", "reports"] },
];
