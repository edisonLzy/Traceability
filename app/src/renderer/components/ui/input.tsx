import { cn } from "@renderer/lib/utils";
import * as React from "react";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none placeholder:text-tertiary focus:border-primary disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
