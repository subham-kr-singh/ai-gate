import { badgeIndex, subjectCode } from "@/lib/status";
import { ui } from "@/lib/ui-tokens";

/** Plain colour badge with a two-letter subject code - no icon art. */
export function SubjectBadge({ subject, subjectId }: { subject: string; subjectId: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-ink ${ui.badge[badgeIndex(subjectId, ui.badge.length)]}`}
    >
      {subjectCode(subject)}
    </div>
  );
}
