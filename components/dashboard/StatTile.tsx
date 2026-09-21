import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string;
  /** Right of the value: a trend (teal up / amber attention). */
  delta?: { text: string; tone: "good" | "attention" } | null;
  note: string;
  fill: string;
}

export function StatTile({ label, value, delta, note, fill }: Props): ReactNode {
  return (
    <div className={`rounded-[20px] p-5 ${fill}`}>
      <p className="text-xs text-[#3a3a3a]">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums text-[#111111]">{value}</p>
        {delta && <span className={`text-xs font-medium ${delta.tone === "good" ? "text-[#0E8074]" : "text-[#D98E2B]"}`}>{delta.text}</span>}
      </div>
      <p className="mt-1 text-xs text-[#3a3a3a]">{note}</p>
    </div>
  );
}
