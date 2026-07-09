// The renderer reuses @traceability/core, which uses @sentry/browser under the hood.
export { init as initRenderer, captureException, captureMessage, report, setTag, setContext, addBreadcrumb } from '@traceability/core'
