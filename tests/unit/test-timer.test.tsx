// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Timer } from "@/components/test/Timer";

/**
 * A clock whose first render depends on `Date.now()` is the classic Vercel
 * hydration bug: the server stamps its render time, the browser stamps a
 * slightly later one, and React discards and re-renders the subtree. These
 * tests pin the invariant that keeps that from happening — the first render
 * must be a fixed placeholder, independent of when it runs.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Timer first render", () => {
  it("server-renders a placeholder, not a live value", () => {
    const html = renderToString(<Timer deadlineAt={new Date("2026-01-01T10:00:00Z")} />);
    expect(html).toContain("--:--");
    // A real countdown would be h:mm:ss; its absence is the whole point.
    expect(html).not.toMatch(/\d+:\d{2}/);
  });

  it("produces identical markup at two different wall-clock times", () => {
    const deadline = new Date("2026-01-01T10:00:00Z");

    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-01-01T09:00:00Z").getTime());
    const early = renderToString(<Timer deadlineAt={deadline} />);

    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-01-01T09:59:00Z").getTime());
    const late = renderToString(<Timer deadlineAt={deadline} />);

    // If these ever differ, hydration will mismatch in production.
    expect(early).toBe(late);
  });

  it("renders the same placeholder for the count-up (no deadline) variant", () => {
    expect(renderToString(<Timer />)).toContain("--:--");
  });
});
