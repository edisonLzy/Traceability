import { useCommandPalette, useRegisterCommands } from "@renderer/commands";
import { agentStore } from "@renderer/store/agent";
import { MessagesSquare, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "zustand";

import { ActiveSessionContent } from "./active-session-content";
import { PendingSessionContent } from "./pending-session-content";

/** Routes between the pending welcome screen and the active chat UI. */
export function AgentPanel() {
  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId);
  const { openSessions } = useCommandPalette();

  useRegisterCommands(
    () => [
      {
        id: "agent.new-session",
        group: { id: "agent", label: "Agent", order: 40 },
        title: "New conversation",
        description: "Start an agent session for this application",
        icon: SquarePen,
        shortcut: "⌘ N",
        action: () => {
          window.dispatchEvent(new CustomEvent("traceability:agent-new-session"));
          toast("New conversation started");
        },
      },
      {
        id: "agent.switch-session",
        group: { id: "agent", label: "Agent", order: 40 },
        title: "Switch conversation",
        description: "Choose an existing agent session",
        icon: MessagesSquare,
        shortcut: "⌘ G",
        closeOnSelect: false,
        action: openSessions,
      },
    ],
    [openSessions],
  );

  if (activeSessionId === null) {
    return <PendingSessionContent />;
  }

  return <ActiveSessionContent sessionId={activeSessionId} />;
}
