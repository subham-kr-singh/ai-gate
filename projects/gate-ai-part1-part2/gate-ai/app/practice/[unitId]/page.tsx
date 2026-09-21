"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function PracticeLauncherPage({ params }: { params: { unitId: string } }) {
  const router = useRouter();
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "TOPIC_QUIZ",
        examYear: new Date().getFullYear() + 1,
        title: "Topic quiz",
        filter: { unitId: params.unitId, count },
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not start the quiz.");
      return;
    }
    const { test } = await res.json();
    router.push(`/tests/${test.id}`);
  }

  return (
    <div className="max-w-md mx-auto p-6 md:p-10 flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-ink">Start a topic quiz</h1>
      <p className="text-sm text-slate">
        Pulls approved questions from the trusted question bank for this unit. Score is final and
        deterministic — negative marking applies per the configured GATE marking scheme.
      </p>

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
  );
}
