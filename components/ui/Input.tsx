import { cn } from "@/lib/cn";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // `outline-none` here used to leave keyboard users with no focus
        // indicator at all; the ring restores it on :focus-visible only, so
        // mouse clicks stay clean.
        "h-10 px-4 rounded-full bg-control text-sm text-ink placeholder-slate-light w-full",
        "outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
