import { installedRendererExtensions } from "@extensions/builtins/index.renderer";
import { ExtensionProvider } from "@extensions/core/renderer";
import { Toaster } from "@renderer/components/ui/sonner";
import { CurrentAppProvider } from "@renderer/context/current-app";
import { ElectronIPCProvider } from "@renderer/context/ElectronIPCProvider";
import { connectWs } from "@renderer/lib/ws";
import { router } from "@renderer/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
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

export function App() {
  useEffect(() => {
    connectWs();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ElectronIPCProvider>
        <CurrentAppProvider>
          <ExtensionProvider extensions={installedRendererExtensions}>
            <RouterProvider router={router} />
            <Toaster />
          </ExtensionProvider>
        </CurrentAppProvider>
      </ElectronIPCProvider>
    </QueryClientProvider>
  );
}
