import type { TraceabilityClient } from "@traceability/client";
import { createTraceabilityClient } from "@traceability/client";

import { getConfig } from "./config.js";

/**
 * Build a TraceabilityClient from the CLI's stored config. Reads config lazily
 * (on call, not at import) so `traceability config set` works before any config
 * exists yet.
 */
export function getClient(): TraceabilityClient {
  const { server, token } = getConfig();
  return createTraceabilityClient({ baseUrl: server, token });
}
