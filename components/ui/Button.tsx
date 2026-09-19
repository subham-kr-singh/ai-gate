import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-teal text-ink hover:bg-teal/90 active:bg-teal/80 disabled:bg-slate/40 disabled:text-fog/40",
  secondary:
    "bg-transparent border border-slate text-fog hover:border-teal hover:text-teal disabled:border-slate/30 disabled:text-fog/30",
  ghost: "bg-transparent text-fog hover:text-teal disabled:text-fog/30",
  danger:
    "bg-transparent border border-amber text-amber hover:bg-amber/10 disabled:border-slate/30 disabled:text-fog/30",
};

/**
 * Primary interactive control. Says what happens on click — callers
 * should pass active-voice labels ("Submit test", "Log mistake"),
 * never "Submit →" or "Get started". See DESIGN_SYSTEM.md.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed",
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
