import { Streamdown } from "streamdown";

export function AssistantResponseMessage({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="text-[12px] leading-[1.62] text-muted [&_p]:m-0 [&_p+p]:mt-2 [&_pre]:mt-2 [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:text-[10px]">
      <Streamdown>{text}</Streamdown>
    </div>
  );
}
