import * as Sentry from "@sentry/electron/main";

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
export const flush = Sentry.flush;

export { startResourceMonitor, sampleResources, getEnvironment } from "./environment.js";
export type {
  ElectronEnvironment,
  ElectronSystemSnapshot,
  ResourceMonitorOptions,
} from "./environment.js";
