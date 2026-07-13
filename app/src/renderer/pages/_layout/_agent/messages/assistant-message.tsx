import type { AssistantMessage as AssistantMessageType } from "@earendil-works/pi-ai";
import { Streamdown } from "streamdown";

import { assistantText, assistantThinking } from "./types";

interface AssistantMessageProps {
  isStreaming: boolean;
  message: AssistantMessageType;
}

export function AssistantMessage({ isStreaming, message }: AssistantMessageProps) {
  const text = assistantText(message);
  const thinking = assistantThinking(message);
  const error = message.errorMessage?.trim();
  const failed =
    message.stopReason === "error" || message.stopReason === "aborted" || Boolean(error);

  return (
    <article className="mb-3 pr-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-[650] text-tertiary">
        <span className={isStreaming ? "animate-pulse text-primary-hover" : "text-primary-hover"}>
          ✦
        </span>
        Traceability Agent
      </div>
      {thinking.length > 0 && (
        <details className="mb-2 rounded-lg border border-hairline bg-black/10 px-2 py-1.5 text-[10px] text-tertiary">
          <summary className="cursor-pointer select-none">Reasoning</summary>
          <div className="mt-1 whitespace-pre-wrap leading-[1.55]">{thinking.join("\n")}</div>
        </details>
      )}
      {text && (
        <div className="text-[12px] leading-[1.55] text-muted [&_p]:m-0 [&_p+p]:mt-1.5 [&_pre]:mt-1.5 [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:text-[10px]">
          <Streamdown>{text}</Streamdown>
        </div>
      )}
      {failed && (
        <p className="mt-2 rounded-md border border-danger/25 bg-danger/10 px-2 py-1.5 text-[10px] text-danger">
          {error || (message.stopReason === "aborted" ? "Response stopped." : "Response failed.")}
        </p>
      )}
    </article>
  );
}
