import { cn } from "@renderer/lib/utils";
import { useCallback, useState } from "react";

interface CopyMessageButtonProps {
  text: string;
}

export function CopyMessageButton({ text }: CopyMessageButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // silently fail
      });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "text-[11px] text-muted-foreground transition-colors hover:text-foreground",
        copied && "text-signal-green",
      )}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}
