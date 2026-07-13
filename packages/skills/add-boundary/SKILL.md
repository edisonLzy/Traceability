---
name: traceability-add-boundary
description: Use when the user asks to add an error boundary to a React component (加错误边界). Teaches how to wrap with MonitorErrorBoundary from @traceability/react.
---

# Add Error Boundary Skill

When the user says "给 X 组件加错误边界" or "add an error boundary to X", follow this.

## 1. Import

```tsx
import { MonitorErrorBoundary } from "@traceability/react";
```

## 2. Wrap the target component

```tsx
<MonitorErrorBoundary appName="message-module" fallback={<ErrorUI />}>
  <MessageApp />
</MonitorErrorBoundary>
```

- `appName` tags captured errors with the owning module (useful in MF).
- `fallback` is rendered when the tree throws. It can be a node or a render-prop receiving `{ error, componentStack, resetError }`.

## 3. Recommended placement

- One boundary around each route-level component.
- One boundary around each MF micro-app root.
- Optionally one boundary around flaky subtrees (third-party widgets).

## 4. Verify

Throw inside the wrapped component in dev; confirm an error issue appears in the Traceability Inbox and the fallback UI renders.

## 5. Commit

Commit with `feat: add error boundary to <component>`.
