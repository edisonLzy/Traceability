import { createContext, useContext } from "react";
import type { ReactNode } from "react";

type ElectronIPCContextValues = {
  invoke: Window["electronAPI"]["invoke"];
  on: Window["electronAPI"]["on"];
};

const ElectronIPCContext = createContext<ElectronIPCContextValues | null>(null);

export function useElectronIPC(): ElectronIPCContextValues {
  const context = useContext(ElectronIPCContext);
  if (!context) throw new Error("useElectronIPC must be used within an ElectronIPCProvider");
  return context;
}

/**
 * Mirrors divisor's context bridge so renderer features never reach for the
 * preload global directly. The unavailable bridge keeps browser-only Vite
 * previews from crashing while still rejecting privileged calls clearly.
 */
export function ElectronIPCProvider({ children }: { children: ReactNode }) {
  const electronAPI = typeof window === "undefined" ? undefined : window.electronAPI;
  const value: ElectronIPCContextValues = electronAPI
    ? { invoke: electronAPI.invoke, on: electronAPI.on }
    : {
        invoke: async () => {
          throw new Error(
            "The Traceability Agent is available only inside the Electron desktop app.",
          );
        },
        on: () => () => undefined,
      };

  return <ElectronIPCContext.Provider value={value}>{children}</ElectronIPCContext.Provider>;
}
