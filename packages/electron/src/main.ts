import * as SentryMain from '@sentry/electron/main'
import { createServerTransport, type InitOptions } from '@traceability/core'

export interface MainInitOptions extends InitOptions {}

/**
 * Initialize Sentry in the Electron main process.
 *
 * The main process has Node's global `fetch` available, so we reuse
 * `@traceability/core`'s transport, which serializes the Sentry v8 Envelope
 * tuple and POSTs it to our self-hosted ingest endpoint
 * (`${dsn}/api/ingest/envelope/${appId}`) as `application/octet-stream` with
 * an `Authorization: Bearer <token>` header. The dummy DSN satisfies Sentry's
 * init validation; our transport ignores it and posts to the real ingest URL.
 * `beforeSend` tags every event with `appId` so the server can route it.
 */
export function initMain(opts: MainInitOptions): void {
  const ingestUrl = `${opts.dsn.replace(/\/$/, '')}/api/ingest/envelope/${opts.appId}`
  SentryMain.init({
    dsn: `https://dummy@local/${opts.appId}`,
    release: opts.release,
    environment: opts.environment,
    // Sentry v8 expects a transport factory `(options) => Transport`.
    transport: () => makeElectronMainTransport(ingestUrl, opts.token),
    beforeSend(event) {
      event.tags = { ...(event.tags ?? {}), appId: opts.appId }
      return event
    },
  })
}

/**
 * Build a Sentry v8 Transport for the Electron main process. Reuses
 * `@traceability/core`'s `createServerTransport` (Node global fetch), which
 * serializes the Envelope and POSTs it with a bearer token. v1: no retry
 * queue — failures are dropped.
 */
function makeElectronMainTransport(url: string, token: string) {
  return createServerTransport({ url, token })
}
