# Event type naming

Use `kebab-case`, feature-prefixed, action-suffixed:

- `<feature>-<action>` for success: `message-sent`, `call-connected`
- `<feature>-<action>-failed` for failure: `message-send-failed`, `call-signaling-failed`
- `<feature>-<state>` for state: `agent-status-change`, `ws-disconnected`

Avoid generic types like `log` or `event` — they won't aggregate cleanly.
