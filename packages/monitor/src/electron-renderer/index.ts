import {
  init as initFromSentry,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
} from "@sentry/electron/renderer";

import {
  corsDiagnosticIntegration,
  whiteScreenIntegration,
  replayIntegration,
  browserTracingIntegration,
} from "../browser/index.js";
import type { WhiteScreenOptions } from "../browser/index.js";

export function init(options: any): void {
  initFromSentry(options);
}

export type { WhiteScreenOptions };

export {
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
  corsDiagnosticIntegration,
  whiteScreenIntegration,
  replayIntegration,
  browserTracingIntegration,
};
