import { AppShell } from "@/components/shell/AppShell";

/** Route-level skeleton: the shell renders immediately and the content area
 * shows one hairline pulse block, so navigation never flashes a blank page. */
export default function Loading() {
  return (
    <AppShell active="today">
      <div className="flex flex-col gap-7" aria-busy="true" aria-label="Loading">
        <div className="h-6 w-44 animate-pulse rounded-full bg-control" />
        <div className="h-32 animate-pulse rounded-[24px] bg-control" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[20px] bg-control" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
