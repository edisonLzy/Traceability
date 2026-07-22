import * as Sentry from "@sentry/electron/renderer";

export function init(opts: any): void {
  Sentry.init(opts);
}
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
export const setUser = Sentry.setUser;
export const setTag = Sentry.setTag;
export const setContext = Sentry.setContext;
export const addBreadcrumb = Sentry.addBreadcrumb;
export const withScope = Sentry.withScope;

export {
  corsDiagnosticIntegration,
  whiteScreenIntegration,
  replayIntegration,
  browserTracingIntegration,
} from "@traceability/browser";
export type { WhiteScreenOptions } from "@traceability/browser";
