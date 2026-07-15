import appsExtension from "@extensions/builtins/apps/renderer";
import issuesExtension from "@extensions/builtins/issues/renderer";
import subagentsExtension from "@extensions/builtins/subagents/renderer";
import {
  ExtensionProvider,
  ExtensionsContextAPIProvider,
  SharedPromptEditor,
  type ExtensionsContextAPI,
  type RendererExtensionDefinition,
} from "@extensions/core/renderer";
import { Toaster } from "@renderer/components/ui/sonner";
import { CurrentAppProvider } from "@renderer/context/current-app";
import { ElectronIPCProvider } from "@renderer/context/ElectronIPCProvider";
import { connectWs } from "@renderer/lib/ws";
import { router } from "@renderer/router";
import { agentStore } from "@renderer/store/agent";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { RouterProvider } from "react-router-dom";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const installedRendererExtensions: RendererExtensionDefinition[] = [
  subagentsExtension,
  appsExtension,
  issuesExtension,
];

export function App() {
  useEffect(() => {
    connectWs();
  }, []);

  const extensionsContextAPI: ExtensionsContextAPI = useMemo(() => {
    return {
      getActiveSessionId: () => agentStore.getState().activeSessionId ?? null,
      sharedPromptEditor: SharedPromptEditor.create(),
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ElectronIPCProvider>
        <CurrentAppProvider>
          <ExtensionProvider extensions={installedRendererExtensions}>
            <ExtensionsContextAPIProvider api={extensionsContextAPI}>
              <RouterProvider router={router} />
              <Toaster />
            </ExtensionsContextAPIProvider>
          </ExtensionProvider>
        </CurrentAppProvider>
      </ElectronIPCProvider>
    </QueryClientProvider>
  );
}
