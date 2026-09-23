"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { GATE_EXAM_YEAR } from "@/lib/exam";
import { apiFetch } from "@/lib/api-fetch";

export default function PracticeLauncherPage({ params }: { params: { unitId: string } }) {
  const router = useRouter();
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setLoading(true);
    setError(null);
    // apiFetch never throws, so the button is released even when the request
    // never reaches the server.
    const res = await apiFetch<{ test: { id: string } }>("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "TOPIC_QUIZ",
        examYear: GATE_EXAM_YEAR,
        title: "Topic quiz",
        filter: { unitId: params.unitId, count },
      }),
    });
    setLoading(false);
    if (!res.ok || !res.body) {
      setError(res.error ?? "Could not start the quiz.");
      return;
    }
    router.push(`/tests/${res.body.test.id}`);
  }

  return (
    <AppShell active="practice" width="reading">
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Start a topic quiz</h1>
        <p className="mt-1 text-sm text-slate">
          Pulls approved questions from the trusted question bank for this unit. Score is final and
          deterministic — negative marking applies per the configured GATE marking scheme.
        </p>
      </div>

      <label className="text-sm text-ink-soft">
        Number of questions
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="block mt-1 h-10 px-4 rounded-full bg-control text-sm outline-none w-32"
        />
      </label>

      {error && <p className="text-xs text-amber">{error}</p>}

      <Button onClick={launch} disabled={loading}>
        {loading ? "Starting…" : "Start quiz"}
      </Button>
    </div>
    </AppShell>
  );
}
