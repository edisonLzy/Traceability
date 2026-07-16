import { init } from "@traceability/core";

export function initTraceability() {
  init({
    dsn: import.meta.env.VITE_TRACEABILITY_DSN,
    appId: import.meta.env.VITE_TRACEABILITY_APP_ID,
    token: import.meta.env.VITE_TRACEABILITY_TOKEN,
    environment: import.meta.env.MODE,
    // release: import.meta.env.VITE_APP_VERSION, // set if you version your builds
    replay: { enabled: true, maxDurationMs: 60_000 },
    whiteScreen: { rootSelector: "[data-monitor-root]" },
  });
}
