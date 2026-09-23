"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";

export function SubmitConfirm({
  answeredCount,
  totalCount,
  submitting = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  answeredCount: number;
  totalCount: number;
  /** True while the submit request is in flight. */
  submitting?: boolean;
  /** Failure from the last submit attempt, shown in place so the student can
   * retry without losing their answers. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const unanswered = totalCount - answeredCount;
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus to the primary action on open so the dialog is reachable by
  // keyboard immediately, instead of leaving focus on the page behind it.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  // Escape closes the dialog, matching the mock simulator's modals. While the
  // submit is in flight closing would hide its outcome, so it is ignored then.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!submitting) onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, submitting]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-confirm-h"
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
    >
      <div className="bg-white rounded-card p-6 max-w-sm w-full">
        <h2 id="submit-confirm-h" className="font-semibold text-ink">Submit test?</h2>
        <p className="text-sm text-slate mt-2">
          You&apos;ve answered {answeredCount} of {totalCount} questions.
          {unanswered > 0 && ` ${unanswered} will be left unanswered.`}
        </p>
        <p className="text-xs text-slate-light mt-2">
          This cannot be undone — the test will be graded immediately.
        </p>
        {error && (
          <p role="alert" className="text-xs text-amber mt-3">
            {error}
          </p>
        )}
        <div className="flex gap-3 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={submitting}>
            Keep working
          </Button>
          <Button ref={confirmRef} className="flex-1" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
