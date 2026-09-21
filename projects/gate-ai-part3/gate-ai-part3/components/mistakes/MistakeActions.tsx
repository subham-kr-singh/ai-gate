"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui-tokens";
import { MISTAKE_TYPES, MISTAKE_TYPE_LABELS, type MistakeTypeValue } from "@/server/domains/mistakes/mistake.types";

interface Props {
  mistakeId: string;
  current: MistakeTypeValue | null;
  resolved: boolean;
}

/** One-tap tagging (segment pills, like the Weekly/Monthly toggle) plus resolve/reopen. */
export function MistakeActions({ mistakeId, current, resolved }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/mistakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError("Could not save that change. Check your connection and try again.");
      return;
    }
    start(() => router.refresh());
  }

  return (
    <div className="mt-3" aria-busy={pending}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Why did you miss it?">
        {MISTAKE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={current === t}
            disabled={pending}
            onClick={() => send({ kind: "tag", mistakeId, mistakeType: t })}
            className={`h-9 rounded-full px-4 text-sm ${current === t ? ui.segOn : ui.segOff}`}
          >
            {MISTAKE_TYPE_LABELS[t]}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => send({ kind: "resolve", mistakeId, resolved: !resolved })}
          className="h-9 rounded-full border border-[#E3E0DA] px-4 text-sm text-[#111111]"
        >
          {resolved ? "Reopen mistake" : "Mark resolved"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-[#D98E2B]">{error}</p>}
    </div>
  );
}
