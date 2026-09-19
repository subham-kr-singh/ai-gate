"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    const next = searchParams.get("next") ?? "/dashboard";
    router.push(next as any);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-slate/30 p-8"
      >
        <h1 className="font-display text-xl font-semibold text-fog">GATE AI</h1>
        <p className="mt-1 text-sm text-slate">
          This is a personal system. Sign in with an allowlisted email.
        </p>

        <label htmlFor="email" className="mt-6 block text-sm text-fog">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-control border border-slate/50 bg-panel px-3 py-2 text-sm text-fog outline-none focus-visible:border-teal"
          placeholder="you@example.com"
        />

        {error && <p className="mt-3 text-sm text-amber">{error}</p>}

        <Button type="submit" className="mt-6 w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
