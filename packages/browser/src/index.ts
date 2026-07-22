import * as Sentry from "@sentry/browser";

export function init(opts: Sentry.BrowserOptions): void {
  Sentry.init(opts);
}
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
export const setUser = Sentry.setUser;
export const setTag = Sentry.setTag;
export const setContext = Sentry.setContext;
export const addBreadcrumb = Sentry.addBreadcrumb;
export const withScope = Sentry.withScope;

export const browserTracingIntegration: typeof Sentry.browserTracingIntegration =
  Sentry.browserTracingIntegration;
export const replayIntegration: typeof Sentry.replayIntegration = Sentry.replayIntegration;

export { corsDiagnosticIntegration } from "./integrations/corsDiagnostic.js";
export { whiteScreenIntegration } from "./integrations/whiteScreen.js";
export type { WhiteScreenOptions } from "./integrations/whiteScreen.js";
export { createBearerTransport } from "@traceability/shared";

export type {
  BrowserOptions as InitOptions,
  SeverityLevel,
  User,
  Breadcrumb,
  Scope,
} from "@sentry/browser";
export type { Transport } from "@sentry/core";
