import { Toaster } from "@renderer/components/ui/sonner";
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
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}
