/**
 * The design palette, for the places Tailwind cannot reach: SVG `fill`/`stroke`
 * props, chart config, and inline styles.
 *
 * Component code must not hardcode hex values. Where a `className` works, use
 * the Tailwind token (`text-ink`, `bg-teal`, …) instead of this module. This
 * exists only so JSX attributes stay on the same palette as the classes —
 * DESIGN.md is the source of truth, and `tailwind.config.ts` mirrors it.
 */
export const palette = {
  surface: "#F8F6F2",
  ink: "#111111",
  inkSoft: "#222222",
  bodyMuted: "#3a3a3a",
  slate: "#77736D",
  slateLight: "#9B968E",
  line: "#E3E0DA",
  control: "#ECE9E3",
  teal: "#0E8074",
  amber: "#D98E2B",
  butter: "#F4DEB4",
  sky: "#C7E3F5",
  lavender: "#D0CCF4",
  coral: "#F4C1C4",
  mint: "#BDEBD9",
  white: "#ffffff",
} as const;
