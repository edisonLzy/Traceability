import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { SharedPromptEditor } from "./sharedPromptEditor";

export interface ExtensionsContextAPI {
  getActiveSessionId(): string | null;
  sharedPromptEditor: SharedPromptEditor;
}

export interface ExtensionsContextAPIProviderProps {
  api: ExtensionsContextAPI;
  children: ReactNode;
}

const ExtensionsContextAPIContext = createContext<ExtensionsContextAPI | null>(null);

export function ExtensionsContextAPIProvider({ api, children }: ExtensionsContextAPIProviderProps) {
  return (
    <ExtensionsContextAPIContext.Provider value={api}>
      {children}
    </ExtensionsContextAPIContext.Provider>
  );
}

export function useExtensionsContextAPI() {
  const api = useContext(ExtensionsContextAPIContext);
  if (!api) {
    throw new Error("useExtensionsContextAPI must be used within ExtensionsContextAPIProvider");
  }
  return api;
}
