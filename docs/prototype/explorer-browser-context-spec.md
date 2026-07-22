# Explorer Browser Artifact — Context-Attachment Interaction Spec

Status: Prototype-ready interaction contract
Last updated: 2026-07-22
Prototype: [explorer-browser-variants.html](./explorer-browser-variants.html)
Related PRD: [2026-07-21-explorer-mvp-prd.md](../product/2026-07-21-explorer-mvp-prd.md)

## 1. Purpose

This spec defines how Browser Artifact recording context appears in the Agent Panel without breaking the existing User Message / Assistant Message conversation model.

The core rule is:

> Recording activity is a neutral Explorer Context. It is not a User Message, not an Assistant Message, and not a pending chat message. A user-created analysis request may attach that context to a User Message; the Agent's judgment remains an Assistant Message.

## 2. Product decisions

### Browser boundary

The Browser region contains only:

- Tab strip.
- Browser toolbar: navigation, URL, element selection, page analysis, start/stop recording.
- Web page display surface.

Recording events, network evidence, Agent reasoning, and Issue actions are not rendered as a second timeline inside Browser.

### Agent message semantics

| Event | UI representation | Chat history |
| --- | --- | --- |
| Recording starts | Neutral `Explorer Context` card with LIVE status | No chat entry |
| User action or network response arrives | A grouped step inside the Context card | No chat entry |
| Candidate error is detected | Alert step inside the Context card | No Assistant answer yet |
| User clicks Analyze or submits a question with Context attached | Right-aligned User Message with a Context attachment | Persisted |
| Agent is reading the attachment | Temporary Assistant pending state | Ephemeral |
| Agent produces a summary or finding | Assistant Message with evidence references | Persisted |
| New events arrive while Agent is responding | Context version/delta indicator | No steering message by default |

The existing pending-message queue remains reserved for follow-up and steering prompts. It must not be used as the source of truth for recording state.

## 3. Prototype states

### 3.1 New Tab

When an Application has a configured entry, the New Tab screen shows the recommended entry card. When it has no configured entry, the address input becomes the primary action and the recommended entry card is hidden.

Opening a URL changes the Agent context to `浏览模式`; browsing alone does not create a recording context.

### 3.2 Browsing

The Agent Panel may show page understanding or element-analysis messages. The Browser remains unchanged. The user can explicitly start recording from the toolbar.

### 3.3 Recording

Starting recording opens a privacy/scope confirmation first. After confirmation:

- Browser toolbar shows the recording state and stop action.
- Agent subtitle becomes `Explorer Context 正在积累`.
- A neutral Context card appears with `LIVE`.
- The first Context step is `开始录制`.
- Every operation and related network response is grouped into a meaningful business step when possible.

The prototype groups `加入购物袋` with `POST /api/cart · 201`, rather than showing two unrelated log rows.

### 3.4 Candidate anomaly

The prototype's checkout simulation adds one alert step:

- User action: `提交结算`.
- Network evidence: `POST /api/orders · 422`.
- UI evidence: page still shows `准备支付`.

The Context card changes its subtitle to indicate that an anomaly is available but not yet analyzed. No Assistant Message is created automatically.

### 3.5 Analysis request

The user can:

- Click `分析当前录制` / `分析异常步骤`.
- Click `附加到提问`, edit the suggested question, and submit it.
- Submit any question through the Agent composer while a Context exists.

The prototype then renders this sequence:

1. A right-aligned User Message.
2. A compact `Explorer Context · session_01H7` attachment inside that message.
3. A temporary Assistant state: `正在读取录制附件与关联证据`.
4. An Assistant response containing a summary or candidate finding.

The attachment is a reference to a recording snapshot, not the raw rrweb or response payload.

### 3.6 Review and Issue

Stopping recording fixes the Context version and changes the card status to completed. The user may analyze the completed recording afterward.

The `生成 Issue 草稿` action is available only after an Assistant finding has been generated. The draft includes references to actions, network evidence, page snapshot, and replay.

## 4. Interaction flow

```text
New Tab
  → Open URL
  → Start recording
  → Confirm capture scope
  → Explorer Context: LIVE
  → User actions + network responses grouped into steps
  → Candidate anomaly appears in Context
  → User asks Agent to analyze
  → User Message + Context attachment
  → Assistant pending: reading attachment
  → Assistant summary/finding with evidence references
  → Optional Issue draft
  → Stop recording / replay
```

## 5. Context data contract

The production implementation should keep recording data separate from the chat transcript and persist only a stable reference in a chat message.

```ts
interface ExplorerContextAttachment {
  recordingId: string;
  artifactId: string;
  checkpointId: string;
  version: number;
  state: "live" | "completed";
  range: { from: number; to: number };
  summary: {
    actionCount: number;
    requestCount: number;
    candidateFindingCount: number;
  };
}

interface RecordingStep {
  id: string;
  sequence: number;
  kind: "action" | "success" | "candidate-finding" | "lifecycle";
  title: string;
  summary: string;
  evidenceRefs: Array<{
    id: string;
    kind: "action" | "network" | "snapshot" | "replay";
  }>;
  timestamp: number;
}
```

The Agent should resolve the attachment through an Explorer Context service/tool and fetch only the required, redacted evidence. The chat message should not contain the full recording payload.

## 6. Presentation variants

All variants keep the Browser layout identical. They only change the Context card inside Agent Panel:

1. **Narrative path** — connected steps with a clear business story; recommended default.
2. **Evidence stack** — each step is a separate evidence card; useful for product research.
3. **Diagnostic ledger** — compact technical rows with dense identifiers; useful for debugging.

The prototype's variant switcher changes only this presentation layer.

## 7. Prototype controls

The clickable prototype supports:

- New Tab, configured/unconfigured Application entry simulation.
- URL open and Browser toolbar interactions.
- Element selection and page analysis.
- Recording privacy confirmation.
- Add-to-bag success path.
- Checkout 422 candidate anomaly.
- Live Explorer Context updates.
- Context attachment to a user question.
- Assistant pending state and simulated response.
- Evidence focus and Issue draft generation.
- Recording stop and review state.

## 8. Acceptance criteria

- Browser contains no evidence dock or recording timeline outside the toolbar and page surface.
- Starting recording creates a neutral Context card and no User/Assistant chat entry.
- At least one operation and its related network response are shown as one grouped Context step.
- A candidate anomaly is visible in Context before Agent analysis.
- User analysis produces a User Message with a visible Context attachment.
- Agent loading is represented as a transient pending state, not as a fabricated user message.
- Agent analysis produces an Assistant Message with evidence references.
- Recording context remains separately identifiable by `recordingId`, `checkpointId`, and `version`.
- Issue creation is unavailable until an Assistant finding exists.
- All three presentation variants preserve the same flow and evidence semantics.

## 9. Out of scope for this prototype

- Real browser network interception.
- Real rrweb storage or replay playback.
- Real Agent model calls.
- Cross-session Context sharing.
- External Issue tracker submission.
- Multiple Browser Tabs in one recording session.
