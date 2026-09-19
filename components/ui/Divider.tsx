import { cn } from "@/lib/cn";

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-slate/30", className)} />;
}
