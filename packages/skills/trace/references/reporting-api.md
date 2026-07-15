# Reporting API reference (for flow instrumentation)

How to use `@traceability/core`'s reporting methods when instrumenting a **user flow / 链路**. This is the doc the `trace` skill defers to for API usage.

> Prerequisite: `init({ dsn, appId, token })` must already be called once at app startup. If it isn't, run the `setup` skill first. This skill only adds reporting calls - it does not install or configure the SDK.

## Method quick reference

| Method | Signature | Use at which trace position |
|---|---|---|
| `setTag` | `setTag(key: string, value: string)` | Flow entry - `setTag("flow", "<name>")` groups every event in this flow. |
| `addBreadcrumb` | `addBreadcrumb({ category, message, level?, data? })` | Entry + each step - leaves a trail the next error event carries. |
| `report` | `report({ type, payload?, tags? })` | Each step's success (`<flow>-<step>`) and failure (`<flow>-<step>-failed`). |
| `captureException` | `captureException(err)` | Every error path - reports the error with stacktrace. |
| `captureMessage` | `captureMessage(msg, opts?)` | Rarely - only for a free-form message with no error object. Prefer `report`. |
| `setContext` | `setContext(key, obj)` | Attach structured state (e.g. the current request) to subsequent events. |
| `setApp` | `setApp(appName)` | Micro-frontend only - tag subsequent events with the current micro-app. |
| `reportPerformance` | `reportPerformance({ name, value, unit? })` | Flow exit - end-to-end timing. |

Import:

```ts
import { report, addBreadcrumb, captureException, setTag, setContext, reportPerformance } from "@traceability/core";
```

## The flow-instrumentation pattern

A flow is a chain of steps. Instrument every step the same way:

1. **Entry** - `setTag("flow", <name>)` + `addBreadcrumb(...)` with the inputs.
2. **Each step success** - `report({ type: "<flow>-<step>", payload: {...}, tags: { flow } })`.
3. **Each step failure** - `report({ type: "<flow>-<step>-failed", payload: {..., error}, tags: { flow } })` + `captureException(err)`.
4. **Exit (success)** - `report({ type: "<flow>-done", payload: {...}, tags: { flow } })` + `reportPerformance(...)` for timing.

The `flow` tag is what lets you filter the Inbox to one end-to-end trace. The `<flow>-<step>` `type` is what lets steps aggregate into issues.

## Event type naming

Use `kebab-case`, feature-prefixed, action-suffixed:

- `<feature>-<action>` for success: `message-sent`, `login-api-ok`
- `<feature>-<action>-failed` for failure: `message-send-failed`, `login-api-failed`
- `<feature>-<state>` for state: `agent-status-change`, `ws-disconnected`

Avoid generic types like `log` or `event` - they won't aggregate cleanly. For a flow, prefix every step's `type` with the flow name (e.g. `login-validate-failed`, `login-api-ok`) so all steps of one flow cluster together.

## Worked example: login flow

Flow: 表单提交 -> 校验 -> POST /login -> 存 token -> 跳转首页.

```ts
import { report, addBreadcrumb, captureException, setTag, reportPerformance } from "@traceability/core";

async function login(email: string, password: string) {
  setTag("flow", "login");
  addBreadcrumb({ category: "login", message: "submit start", data: { email } });
  const t0 = performance.now();

  // Step 1: client-side validation
  if (!email || !password) {
    report({ type: "login-validate-failed", payload: { email }, tags: { flow: "login" } });
    throw new Error("missing credentials");
  }

  // Step 2: API call
  try {
    const res = await api.post("/login", { email, password });
    report({ type: "login-api-ok", payload: { userId: res.id }, tags: { flow: "login" } });

    // Step 3: persist token
    localStorage.setItem("token", res.token);
    report({ type: "login-token-stored", payload: { userId: res.id }, tags: { flow: "login" } });

    // Step 4: exit (success)
    report({ type: "login-done", payload: { userId: res.id }, tags: { flow: "login" } });
    reportPerformance({ name: "login-total", value: performance.now() - t0, unit: "millisecond" });
    router.push("/home");
  } catch (err) {
    report({ type: "login-api-failed", payload: { email, error: String(err) }, tags: { flow: "login" } });
    captureException(err);
    throw err;
  }
}
```

Each `report` is one event in the Inbox; all share `flow: login`; the `login-*-failed` types aggregate into issues you can drill into.

## React components

Inside a React component, use the hooks from `@traceability/react` (which re-exports core):

```tsx
import { useMonitorReport, useMonitorTag, MonitorErrorBoundary } from "@traceability/react";

function LoginForm() {
  const report = useMonitorReport();
  const setTag = useMonitorTag();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTag("flow", "login");
    report({ type: "login-submit", payload: { email }, tags: { flow: "login" } });
    // …
  }
  // …
}

// Wrap a flow's root component to capture render errors as part of the trace:
<MonitorErrorBoundary appName="login" fallback={<ErrorUI />}>
  <LoginForm />
</MonitorErrorBoundary>
```

## Choosing `report` vs `captureException` vs `addBreadcrumb`

- **`addBreadcrumb`** - "what just happened" context that rides along on the *next* error. Cheap; use liberally at every step. Does not create an issue by itself.
- **`report`** - a discrete event you want to see/count in the Inbox (step reached, step failed). Creates an issue keyed by `type`.
- **`captureException`** - an actual error with a stacktrace. Always pair it with a `report(...-failed)` so the failure is also visible as a typed event, not only as an error issue.
