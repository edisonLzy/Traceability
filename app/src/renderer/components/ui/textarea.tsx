import { cn } from "@renderer/lib/utils";
import * as React from "react";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-lg border border-hairline bg-surface-1 p-2 text-xs leading-relaxed text-ink outline-none placeholder:text-tertiary focus:border-primary disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
