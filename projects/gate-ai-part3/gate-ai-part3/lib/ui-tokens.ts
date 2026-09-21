/**
 * Class-name tokens for Part 3 UI - values copied from design.md
 * (dashboard-demo-v3). Tailwind only sees complete class strings, so keep
 * them literal. If you move the palette into tailwind.config.ts, change it here.
 */
export const ui = {
  surface: "bg-[#F8F6F2]",
  ink: "text-[#111111]",
  soft: "text-[#222222]",
  body: "text-[#3a3a3a]",
  slate: "text-[#77736D]",
  line: "border-[#E3E0DA]",
  divide: "divide-[#E3E0DA]",
  teal: "text-[#0E8074]",
  amber: "text-[#D98E2B]",
  fillTeal: "bg-[#0E8074]",
  fillInk: "bg-[#111111]",
  card: "rounded-[20px] border border-[#E3E0DA] bg-white",
  /** Search-bar style control: fully rounded, control grey. */
  field: "h-10 rounded-full bg-[#ECE9E3] px-4 text-sm text-[#111111] outline-none placeholder-[#9B968E]",
  segOn: "bg-[#111111] text-white",
  segOff: "bg-[#ECE9E3] text-[#222222]",
  btn: "inline-flex h-10 items-center justify-center rounded-full bg-[#111111] px-5 text-sm text-white",
  btnQuiet: "inline-flex h-10 items-center justify-center rounded-full border border-[#E3E0DA] px-5 text-sm text-[#111111]",
  tile: { butter: "bg-[#F4DEB4]", sky: "bg-[#C7E3F5]", lavender: "bg-[#D0CCF4]" },
  badge: ["bg-[#F4C1C4]", "bg-[#F4DEB4]", "bg-[#BDEBD9]", "bg-[#C7E3F5]", "bg-[#D0CCF4]"],
} as const;
