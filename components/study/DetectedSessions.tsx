"use client";

import { useCallback, useEffect, useState } from "react";
import { ui } from "@/lib/ui-tokens";

/**
 * Auto-detected study: what the platform already recorded from quizzes, mocks
 * and DPPs. The student reads it rather than retyping it.
 *
 * The one thing detection cannot know is how confident they felt, so the
 * panel asks. Low confidence routes them to the Tutor with the unit already
 * named, where the discuss-then-decide flow lives — this screen never writes.
 */

export interface DetectedSession {
  id: string;
  unitId: string;
  unitName: string;
  subjectCode: string | null;
  subjectName: string | null;
  day: string;
  questionsAttempted: number;
  questionsCorrect: number;
  accuracy: number;
  sources: { quiz: number; mock: number; dpp: number };
  weakConcepts: { conceptId: string; name: string; attempted: number; correct: number }[];
  isPyq: boolean;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const today = new Date();
  const diff = Math.round(
    (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - d.getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function sourceLine(s: DetectedSession["sources"]): string {
  const parts: string[] = [];
  if (s.quiz) parts.push(`${s.quiz} quiz`);
  if (s.mock) parts.push(`${s.mock} mock`);
  if (s.dpp) parts.push(`${s.dpp} DPP`);
  return parts.join(" · ");
}

export function DetectedSessions() {
  const [sessions, setSessions] = useState<DetectedSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/study-sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setError("Couldn't load your recorded sessions. Enter a session manually instead.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="rounded-[16px] border border-[#D98E2B] bg-[#F4DEB4]/40 p-4 text-sm text-[#111111]">
        {error}
      </div>
    );
  }

  if (sessions === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-[20px] bg-[#ECE9E3]" />
        ))}
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <div className={ui.card + " p-5"}>
        <p className="text-sm font-semibold text-[#111111]">No sessions recorded yet</p>
        <p className="mt-1 text-sm text-[#3a3a3a]">
          Work you do in Practice, Tests and Mocks shows up here automatically —
          nothing to log. Anything you did elsewhere, add manually.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} />
      ))}
    </div>
  );
}

function SessionCard({ session }: { session: DetectedSession }) {
  const [confidence, setConfidence] = useState<"high" | "medium" | "low" | null>(null);

  const tutorHref = `/tutor?unit=${encodeURIComponent(session.unitName)}&intent=low-confidence&ref=${encodeURIComponent(session.day)}`;

  return (
    <article className={ui.card + " p-5"}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          {session.subjectCode && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-[#111111] ${ui.tile.sky}`}>
              {session.subjectCode}
            </span>
          )}
          <h3 className="text-base font-semibold text-[#111111]">{session.unitName}</h3>
          {session.isPyq && (
            <span className="rounded-full bg-[#D0CCF4] px-2 py-0.5 text-xs text-[#111111]">PYQ</span>
          )}
        </div>
        <span className="text-xs text-[#77736D]">{dayLabel(session.day)}</span>
      </header>

      <p className="mt-3 text-sm text-[#3a3a3a]">
        <span className="text-[#111111]">
          {session.questionsCorrect}/{session.questionsAttempted} correct
        </span>{" "}
        <span className={session.accuracy >= 0.6 ? "text-[#0E8074]" : "text-[#D98E2B]"}>
          ({pct(session.accuracy)})
        </span>
        {sourceLine(session.sources) && <> · {sourceLine(session.sources)}</>}
      </p>

      {session.weakConcepts.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[#77736D]">Needs attention</p>
          <ul className="mt-1 flex flex-col gap-1">
            {session.weakConcepts.slice(0, 4).map((c) => (
              <li key={c.conceptId} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-[#3a3a3a]">{c.name}</span>
                <span className="text-[#D98E2B]">
                  {c.correct}/{c.attempted}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-[#E3E0DA] pt-3">
        <p className="text-xs text-[#77736D]">How did that feel?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["high", "medium", "low"] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={confidence === c}
              onClick={() => setConfidence(c)}
              className={
                (confidence === c ? ui.segOn : ui.segOff) +
                " h-9 rounded-full px-4 text-sm capitalize"
              }
            >
              {c === "high" ? "Confident" : c === "medium" ? "Okay" : "Low confidence"}
            </button>
          ))}
        </div>

        {confidence === "high" && (
          <p className="mt-3 text-sm text-[#0E8074]">
            Noted. This session is already counted — nothing else needed.
          </p>
        )}
        {confidence === "medium" && (
          <p className="mt-3 text-sm text-[#3a3a3a]">
            Noted. Your plan stays as it is; the tutor can tighten revision if
            the next session looks the same.
          </p>
        )}
        {confidence === "low" && (
          <div className="mt-3 rounded-[16px] border border-[#D98E2B] bg-[#F4DEB4]/40 p-3">
            <p className="text-sm text-[#111111]">
              Talk it through with the tutor before changing anything. It reads
              this session&apos;s numbers, discusses what went wrong, and proposes
              either more time on this unit or taking it off the plan — you
              confirm before it applies.
            </p>
            <a className={ui.btn + " mt-3"} href={tutorHref}>
              Discuss with tutor
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
