import {
  init as initFromSentry,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
  browserTracingIntegration,
  replayIntegration,
} from "@sentry/browser";
import type { BrowserOptions } from "@sentry/browser";
import type { Transport } from "@sentry/core";

import { corsDiagnosticIntegration } from "../integrations/corsDiagnostic.js";
import { whiteScreenIntegration } from "../integrations/whiteScreen.js";
import type { WhiteScreenOptions } from "../integrations/whiteScreen.js";

export function init(options: BrowserOptions): void {
  initFromSentry(options);
}

export type InitOptions = BrowserOptions;
export type { SeverityLevel, User, Breadcrumb, Scope } from "@sentry/browser";
export type { Transport };

export {
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
  browserTracingIntegration,
  replayIntegration,
  corsDiagnosticIntegration,
  whiteScreenIntegration,
};
export type { WhiteScreenOptions };
