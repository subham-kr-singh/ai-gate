import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-fetch";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockFetch(impl: () => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

describe("apiFetch", () => {
  it("returns the parsed body on success", async () => {
    mockFetch(async () => new Response(JSON.stringify({ test: { id: "t1" } }), { status: 200 }));
    const res = await apiFetch<{ test: { id: string } }>("/api/tests");
    expect(res.ok).toBe(true);
    expect(res.body?.test.id).toBe("t1");
  });

  it("surfaces the server's error message on a non-2xx response", async () => {
    mockFetch(async () => new Response(JSON.stringify({ error: "Unit not found" }), { status: 404 }));
    const res = await apiFetch("/api/tests");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(res.error).toBe("Unit not found");
  });

  it("falls back to the caller's wording when the error body is not JSON", async () => {
    mockFetch(async () => new Response("<html>502</html>", { status: 502 }));
    const res = await apiFetch("/api/tests", {}, "Could not start the quiz.");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Could not start the quiz.");
  });

  it("resolves rather than throwing when the network is down", async () => {
    // The whole point of the helper: a rejected fetch must not escape, or the
    // caller's `setLoading(false)` is skipped and the button stays disabled.
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = await apiFetch("/api/auth", {}, "Sign-in failed.");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.error).toBe("Sign-in failed.");
  });

  it("treats a 204 as a bare success with no body", async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    const res = await apiFetch("/api/mistakes");
    expect(res.ok).toBe(true);
    expect(res.body).toBeUndefined();
  });

  it("succeeds with an undefined body when a 200 has no content", async () => {
    mockFetch(async () => new Response("", { status: 200 }));
    const res = await apiFetch("/api/mistakes");
    expect(res.ok).toBe(true);
    expect(res.body).toBeUndefined();
  });
});
