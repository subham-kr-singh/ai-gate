"use client";

import { Button } from "@/components/ui/Button";

export function SubmitConfirm({
  answeredCount,
  totalCount,
  onConfirm,
  onCancel,
}: {
  answeredCount: number;
  totalCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const unanswered = totalCount - answeredCount;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-card p-6 max-w-sm w-full">
        <h2 className="font-semibold text-ink">Submit test?</h2>
        <p className="text-sm text-slate mt-2">
          You&apos;ve answered {answeredCount} of {totalCount} questions.
          {unanswered > 0 && ` ${unanswered} will be left unanswered.`}
        </p>
        <p className="text-xs text-slate-light mt-2">
          This cannot be undone — the test will be graded immediately.
        </p>
        <div className="flex gap-3 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Keep working
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
