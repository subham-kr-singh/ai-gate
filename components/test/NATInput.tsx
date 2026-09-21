"use client";

import { Input } from "@/components/ui/Input";

export function NATInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="max-w-xs">
      <Input
        type="text"
        inputMode="decimal"
        placeholder="Enter a numeric value"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <p className="text-xs text-slate mt-2">
        Numerical answer type — enter a number, decimals allowed.
      </p>
    </div>
  );
}
