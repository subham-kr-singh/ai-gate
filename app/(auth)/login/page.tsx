"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api-fetch";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // apiFetch converts a dropped connection into the same failure result as a
    // rejected sign-in, so `setLoading(false)` is always reached. A raw fetch
    // here would reject on a network error and leave the button on
    // "Signing in…" with no way to retry.
    const res = await apiFetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Sign-in failed.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="w-10 h-10 rounded-full bg-ink flex items-center justify-center text-white font-semibold text-sm mb-6">
          G
        </div>
        <h1 className="text-xl font-semibold text-ink">Sign in to GATE AI</h1>
        <p className="text-sm text-slate mt-1 mb-6">
          This is a personal system — only your allowlisted email can enter.
        </p>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && (
          <p id="login-error" role="alert" className="text-xs text-amber mt-2">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full mt-4">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
