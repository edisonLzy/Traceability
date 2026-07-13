import { useApps } from "@renderer/hooks/use-apps";
import type { Application } from "@traceability/protocol";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "traceability:current-app";

interface CurrentAppValue {
  apps: Application[];
  currentApp: Application | null;
  appId: string;
  setAppId: (appId: string) => void;
  loading: boolean;
}

const CurrentAppContext = createContext<CurrentAppValue | null>(null);

export function CurrentAppProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useApps();
  const apps = data ?? [];
  const [appId, setAppId] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");

  useEffect(() => {
    if (!appId) return;
    localStorage.setItem(STORAGE_KEY, appId);
  }, [appId]);

  // Seed a default app once the list loads, or correct a stale id.
  useEffect(() => {
    if (apps.length === 0) return;
    if (!appId || !apps.some((app) => app.id === appId)) {
      setAppId(apps[0]!.id);
    }
  }, [apps, appId]);

  const value = useMemo<CurrentAppValue>(() => {
    const currentApp = apps.find((app) => app.id === appId) ?? null;
    return { apps, currentApp, appId, setAppId, loading: isLoading };
  }, [apps, appId, isLoading]);

  return <CurrentAppContext.Provider value={value}>{children}</CurrentAppContext.Provider>;
}

export function useCurrentApp(): CurrentAppValue {
  const ctx = useContext(CurrentAppContext);
  if (!ctx) throw new Error("useCurrentApp must be used inside <CurrentAppProvider>");
  return ctx;
}
