import { agentStore } from "@renderer/store/agent";
import { useStore } from "zustand";

export function PendingMessages({ sessionId }: { sessionId: string }) {
  const messages = useStore(agentStore, (state) => state.getSessionPendingMessages(sessionId));
  if (messages.length === 0) return null;

  return (
    <section className="rounded-lg border border-warning/25 bg-warning/10 px-2.5 py-2">
      <div className="mb-1 text-[9px] font-[660] uppercase tracking-[0.08em] text-warning">
        Pending messages · {messages.length}
      </div>
      <div className="flex max-h-20 flex-col gap-1 overflow-y-auto">
        {messages.map((message) => (
          <p key={message.timestamp} className="truncate text-[10px] text-muted">
            <span className="mr-1 text-tertiary">
              {message.kind === "steering" ? "Steer" : "Follow-up"}
            </span>
            {typeof message.content === "string" ? message.content : "Rich prompt"}
          </p>
        ))}
      </div>
    </section>
  );
}
