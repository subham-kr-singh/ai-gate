export interface WeakConceptItem {
  conceptId: string;
  name: string;
  mastery: number;
}

/** "Needs attention": plain text rows, percentage in amber. */
export function WeakConceptList({ items }: { items: WeakConceptItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[#77736D]">Nothing weak yet. Finish a topic quiz and the concepts you miss will appear here.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
      {items.map((c) => (
        <li key={c.conceptId} className="flex items-center justify-between gap-3">
          <span className="text-[#111111]">{c.name}</span>
          <span className="tabular-nums text-[#D98E2B]">{Math.round(c.mastery * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}
