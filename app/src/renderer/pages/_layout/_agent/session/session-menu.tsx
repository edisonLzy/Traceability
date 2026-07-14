import type { AgentSession } from "@renderer/store/agent";
import { MessageCircle, SquarePlus } from "lucide-react";

interface SessionMenuProps {
  activeSessionId: string | null;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (sessionId: string) => void;
  sessions: AgentSession[];
}

export function SessionMenu({
  activeSessionId,
  onClose,
  onCreate,
  onSelect,
  sessions,
}: SessionMenuProps) {
  return (
    <>
      <button
        aria-label="Close conversation switcher"
        className="fixed inset-0 z-30 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div className="absolute inset-x-2 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[12px] border border-hairline-strong bg-[rgba(30,31,37,0.96)] shadow-[0_16px_50px_rgba(0,0,0,0.34),0_2px_12px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div className="border-b border-hairline px-2.5 py-2 text-[10px] font-[650] uppercase tracking-[0.07em] text-tertiary">
          Switch conversation
        </div>
        <div className="max-h-60 overflow-auto p-1">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <button
                key={session.id}
                className={`grid w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[11px] transition-colors ${
                  active
                    ? "bg-primary/15 text-ink"
                    : "text-muted hover:bg-white/[0.06] hover:text-ink"
                }`}
                onClick={() => {
                  onSelect(session.id);
                  onClose();
                }}
                type="button"
              >
                <MessageCircle
                  className={active ? "text-primary-hover" : "text-tertiary"}
                  size={13}
                />
                <span className="truncate font-[610]">{session.name || "New conversation"}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-hairline p-1.5">
          <button
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-primary-hover hover:bg-primary/15"
            onClick={() => {
              onCreate();
              onClose();
            }}
            type="button"
          >
            <SquarePlus size={12} /> New conversation
          </button>
        </div>
      </div>
    </>
  );
}
