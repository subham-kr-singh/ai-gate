import { palette } from "@/lib/design-tokens";

/**
 * The subject/metric pastel fills from DESIGN.md §2, as Tailwind classes.
 *
 * These live under `components/` rather than `lib/` on purpose: Tailwind scans
 * `app/` and `components/` for class names, so a class string in `lib/` would
 * never make it into the stylesheet.
 *
 * A union type rather than a free-form string, so a component cannot be handed
 * an off-palette color.
 */
export type PastelTone = "butter" | "sky" | "lavender" | "coral" | "mint";

export const PASTEL_CLASS = {
  butter: "bg-butter",
  sky: "bg-sky",
  lavender: "bg-lavender",
  coral: "bg-coral",
  mint: "bg-mint",
} as const satisfies Record<PastelTone, string>;

/** The same pastels as hex, for SVG `fill`/`stroke` props and inline styles,
 * which a class cannot reach. */
export const PASTEL_HEX = {
  butter: palette.butter,
  sky: palette.sky,
  lavender: palette.lavender,
  coral: palette.coral,
  mint: palette.mint,
} as const satisfies Record<PastelTone, string>;
