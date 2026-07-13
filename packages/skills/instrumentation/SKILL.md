---
name: traceability-instrumentation
description: Use when the user asks to add instrumentation/monitoring/collection (埋点/监控/采集) to a feature or code path. Teaches how to call @traceability/core APIs at the right call sites.
---

# Instrumentation Skill

When the user says something like "在 XX 功能加埋点 / 加监控 / 加采集" or "add logging/tracing to X", follow this workflow.

## 1. Identify the call site

Find the function / handler / lifecycle method that bounds the feature the user named. Instrumentation belongs at:

- Function entry/exit (timing + errors)
- State transitions (before/after)
- Network call boundaries (before fetch, on success, on error)

## 2. Choose the API

Import from `@traceability/core` (or `@traceability/react` if in a React component):

```ts
import { report, setTag, addBreadcrumb, captureException } from "@traceability/core";
```

- `report({ type, payload, tags })` — custom event with a stable `type`
- `addBreadcrumb({ category, message, level, data })` — attaches context to the next error event
- `setTag(key, value)` — tags all subsequent events (e.g. `setTag('feature', 'message-send')`)
- `captureException(err)` — report a caught error with stacktrace

See `references/core-api.md` for the full signature, and `references/event-types.md` for naming conventions.

## 3. Instrument

Wrap the call site:

```ts
import { report, addBreadcrumb, captureException } from "@traceability/core";

async function sendMessage(msg: Message) {
  addBreadcrumb({ category: "message", message: "send start", data: { id: msg.id } });
  try {
    await api.post("/messages", msg);
    report({ type: "message-sent", payload: { id: msg.id }, tags: { feature: "message" } });
  } catch (err) {
    report({
      type: "message-send-failed",
      payload: { id: msg.id, error: String(err) },
      tags: { feature: "message" },
    });
    captureException(err);
    throw err;
  }
}
```

## 4. Verify

- Ensure `init({ dsn, appId, token })` is called once at app startup (usually in `main.ts`).
- Trigger the feature manually; check the Traceability Inbox (or `traceability issue list --appId <id>`) for the new event.
- Use a stable `type` string so events aggregate into one issue.

## 5. Commit

Commit the instrumentation with a `feat:` or `chore:` message referencing the feature.
