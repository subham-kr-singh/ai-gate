import { cn } from "@/lib/cn";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 px-4 rounded-full bg-control text-sm text-ink placeholder-slate-light outline-none w-full",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
