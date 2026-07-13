# @traceability/core API reference

## init(opts)

```ts
init({
  dsn: string       // server base URL
  appId: string     // from Traceability app creation
  token: string     // API token
  release?: string
  environment?: string
  user?: { id: string }
})
```

Call once at app startup.

## report(data)

```ts
report({ type: string, payload?: Record<string, unknown>, tags?: Record<string, string> })
```

Custom event. `type` must be a stable string for aggregation.

## captureException(err)

Report an error with its stacktrace.

## captureMessage(msg, opts?)

Report a free-form message.

## setTag(key, value) / setContext(key, obj) / addBreadcrumb(crumb)

Attach context to subsequent events.

## setApp(appName) (MF only)

Tag subsequent events with the current micro-app name.

## installGlobalProxy() (MF host only)

Call once in the host app to install shared proxies.
