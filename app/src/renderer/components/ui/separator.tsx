import { cn } from "@renderer/lib/utils";
import * as React from "react";

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-hairline", className)} {...props} />;
}
