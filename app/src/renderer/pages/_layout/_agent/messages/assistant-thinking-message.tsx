interface AssistantThinkingMessageProps {
  thinking: string[];
}

export function AssistantThinkingMessage({ thinking }: AssistantThinkingMessageProps) {
  if (thinking.length === 0) return null;
  return (
    <details className="mb-2 rounded-lg border border-hairline bg-black/10 px-2 py-1.5 text-[10px] text-tertiary">
      <summary className="cursor-pointer select-none">Reasoning</summary>
      <div className="mt-1 whitespace-pre-wrap leading-[1.55]">{thinking.join("\n")}</div>
    </details>
  );
}
