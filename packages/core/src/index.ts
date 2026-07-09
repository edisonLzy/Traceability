import * as Sentry from '@sentry/browser'
import type { ErrorEvent } from '@sentry/browser'
import { corsDiagnosticIntegration } from './integrations/corsDiagnostic.js'
import { whiteScreenIntegration } from './integrations/whiteScreen.js'
import { createServerTransport } from './transport/serverTransport.js'
import type { InitOptions, ReportData } from './types.js'

let initialized = false
let currentAppName: string | undefined

export function init(opts: InitOptions): void {
  if (initialized) return
  initialized = true

  const ingestUrl = `${opts.dsn.replace(/\/$/, '')}/api/ingest/envelope/${opts.appId}`

  Sentry.init({
    dsn: 'https://dummy@local/12345', // unused by our transport, but required by Sentry init (projectId must be numeric)
    release: opts.release,
    environment: opts.environment,
    // Sentry expects a transport factory (transportOptions) => Transport.
    // We ignore its options and build our own bearer-tokened POST transport.
    transport: () => createServerTransport({ url: ingestUrl, token: opts.token }),
    beforeSend(event: ErrorEvent): ErrorEvent | null {
      event.tags = { ...(event.tags ?? {}), appId: opts.appId }
      if (currentAppName) {
        event.tags.appName = currentAppName
      }
      // opts.beforeSend is typed against the base Event; the runtime event is
      // an ErrorEvent (a subtype), so the downcast on the return is sound.
      return opts.beforeSend ? (opts.beforeSend(event) as ErrorEvent | null) : event
    },
    integrations: (defaults) => {
      const list = [...defaults, corsDiagnosticIntegration()]
      if (opts.whiteScreen) {
        list.push(whiteScreenIntegration(opts.whiteScreen))
      }
      return list
    },
  })

  if (opts.user) {
    Sentry.setUser(opts.user as Parameters<typeof Sentry.setUser>[0])
  }
}

export function setApp(appName: string): void {
  currentAppName = appName
  Sentry.setTag('appName', appName)
}

export function installGlobalProxy(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __MONITOR_PROXY_INSTALLED__?: boolean }
  if (w.__MONITOR_PROXY_INSTALLED__) return
  w.__MONITOR_PROXY_INSTALLED__ = true
  // Sentry installs its own XHR/fetch proxies via BrowserTracing; the guard
  // prevents consumers from re-init. No additional monkey-patch needed in v1.
}

export const captureException = Sentry.captureException
export const captureMessage = Sentry.captureMessage
export const setTag = Sentry.setTag
export const setContext = Sentry.setContext
export const addBreadcrumb = Sentry.addBreadcrumb

export function report(data: ReportData): void {
  Sentry.captureMessage(data.type, {
    tags: { ...(data.tags ?? {}), event_type: data.type },
    extra: data.payload,
  })
}

export { createServerTransport } from './transport/serverTransport.js'
export type { InitOptions, ReportData } from './types.js'
export type { ServerTransportOptions } from './transport/serverTransport.js'

export { corsDiagnosticIntegration }
export { whiteScreenIntegration }
export type { WhiteScreenOptions } from './integrations/whiteScreen.js'
