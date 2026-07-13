import { Button } from "@renderer/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { Textarea } from "@renderer/components/ui/textarea";
import { useApps } from "@renderer/hooks/use-apps";
import { cn } from "@renderer/lib/utils";
import type {
  AgentEntry,
  AgentPromptInput,
  AgentSessionDetail,
  AgentSessionSummary,
  AvailableModel,
} from "@shared/ipc";
import { type FormEvent, useEffect, useState } from "react";
import { Streamdown } from "streamdown";

export function AgentPanel() {
  const { data: applications, error: appsError } = useApps();
  const [appId, setAppId] = useState("");
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<AgentSessionDetail | null>(null);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [context, setContext] = useState<AgentPromptInput["context"] | null>(null);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (appsError) setError(toError(appsError));
  }, [appsError]);

  useEffect(() => {
    if (applications && applications.length && !appId) setAppId(applications[0]!.id);
  }, [applications, appId]);

  useEffect(() => {
    void window.traceability.agent.listModels().then((items) => {
      setModels(items);
      setSelectedModel(items[0] ? modelKey(items[0]) : "");
    });
  }, []);

  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<AgentPromptInput["context"]>).detail;
      if (!detail?.appId) return;
      setAppId(detail.appId);
      setContext(detail);
    };
    window.addEventListener("traceability:agent-context", onContext);
    return () => window.removeEventListener("traceability:agent-context", onContext);
  }, []);

  useEffect(() => {
    if (!appId) {
      setSessions([]);
      setSessionId("");
      setSession(null);
      return;
    }
    void window.traceability.sessions
      .list(appId)
      .then((items) => {
        setSessions(items);
        setSessionId(items[0]?.id ?? "");
      })
      .catch((cause) => setError(toError(cause)));
  }, [appId]);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    void loadSession(sessionId, setSession, setError);
  }, [sessionId]);

  useEffect(() => {
    return window.traceability.agent.onEvent((event) => {
      if (event.sessionId !== sessionId) return;
      if (event.type === "agent_start" || event.type === "run_started") setRunning(true);
      if (event.type === "agent_end" || event.type === "run_failed") {
        setRunning(false);
        void loadSession(event.sessionId, setSession, setError);
        if (appId) void window.traceability.sessions.list(appId).then(setSessions);
      }
    });
  }, [sessionId, appId]);

  const createSession = async () => {
    if (!appId) return;
    try {
      const created = await window.traceability.sessions.create(appId);
      setSessions((items) => [created, ...items]);
      setSessionId(created.id);
    } catch (cause) {
      setError(toError(cause));
    }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!appId || !sessionId || !text.trim() || running) return;
    const model = models.find((item) => modelKey(item) === selectedModel);
    if (!model) {
      setError("No compatible model is configured in ~/.pi/agent/models.json");
      return;
    }
    try {
      setError("");
      setRunning(true);
      await window.traceability.agent.prompt({
        sessionId,
        text,
        model: { providerId: model.providerId, modelId: model.modelId },
        context: context?.appId === appId ? context : { appId, source: "general" },
      });
      setText("");
      void loadSession(sessionId, setSession, setError);
    } catch (cause) {
      setRunning(false);
      setError(toError(cause));
    }
  };

  const appItems: Record<string, string> = {
    "": "Select an application",
    ...Object.fromEntries((applications ?? []).map((a) => [a.id, a.name])),
  };
  const sessionItems: Record<string, string> = {
    "": sessions.length ? "Select a conversation" : "Create a conversation",
    ...Object.fromEntries(sessions.map((s) => [s.id, s.title || "New conversation"])),
  };
  const modelItems: Record<string, string> = {
    "": "Select model",
    ...Object.fromEntries(models.map((m) => [modelKey(m), `${m.providerName} / ${m.modelName}`])),
  };

  return (
    <aside
      className="hidden desktop:flex h-screen min-w-0 flex-col border-l border-hairline bg-[#0b0c0f] text-xs wide:text-sm"
      aria-label="Traceability Agent"
    >
      <header className="flex min-h-14 items-center justify-between gap-2.5 border-b border-hairline px-3.5">
        <div>
          <strong className="block text-[13px]">Traceability Agent</strong>
          <small className="mt-0.5 block text-[10px] text-tertiary">
            Read-only monitoring analysis
          </small>
        </div>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md border border-hairline bg-surface-2 text-lg text-muted disabled:opacity-50"
          onClick={() => void createSession()}
          disabled={!appId}
        >
          +
        </button>
      </header>
      <div className="grid gap-1.5 border-b border-hairline p-2.5">
        <Select
          value={appId || null}
          onValueChange={(v) => {
            const next = v ?? "";
            setAppId(next);
            setContext(next ? { appId: next, source: "general" } : null);
          }}
          items={appItems}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Select an application" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Select an application</SelectItem>
            {(applications ?? []).map((application) => (
              <SelectItem key={application.id} value={application.id}>
                {application.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sessionId || null}
          onValueChange={(v) => setSessionId(v ?? "")}
          items={sessionItems}
          disabled={!appId}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Select a conversation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">
              {sessions.length ? "Select a conversation" : "Create a conversation"}
            </SelectItem>
            {sessions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title || "New conversation"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <section className="min-h-0 flex-1 overflow-auto p-3">
        {!appId && (
          <div className="px-3 py-7 text-center text-xs text-tertiary">
            Select an application to start a scoped monitoring conversation.
          </div>
        )}
        {appId && !sessionId && (
          <div className="px-3 py-7 text-center text-xs text-tertiary">
            Create a conversation to analyze this application.
          </div>
        )}
        {session?.entries
          .filter((entry) => entry.type === "message")
          .map((entry) => (
            <Message key={entry.id} entry={entry} />
          ))}
        {running && <div className="my-2 text-xs text-[#aeb7ff]">Analyzing monitoring data…</div>}
      </section>
      <form className="border-t border-hairline p-2.5" onSubmit={send}>
        {context && context.source !== "general" && (
          <div className="mb-2 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-[10px] text-[#b8c1ff]">
            {formatContext(context)}
          </div>
        )}
        <Select
          value={selectedModel || null}
          onValueChange={(v) => setSelectedModel(v ?? "")}
          items={modelItems}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Select model</SelectItem>
            {models.map((model) => (
              <SelectItem key={modelKey(model)} value={modelKey(model)}>
                {model.providerName} / {model.modelName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          className="mt-2 min-h-17"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask about the current application…"
          disabled={!sessionId || running || models.length === 0}
          rows={3}
        />
        {error && <div className="mt-2.5 text-xs text-[#e38a8a]">{error}</div>}
        <div className="mt-2 flex justify-end">
          {running ? (
            <Button
              type="button"
              size="sm"
              className="rounded-md bg-surface-2"
              onClick={() => void window.traceability.agent.abort(sessionId)}
            >
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              variant="primary"
              className="rounded-md"
              disabled={!sessionId || !text.trim() || models.length === 0}
            >
              Send
            </Button>
          )}
        </div>
      </form>
    </aside>
  );
}

function Message({ entry }: { entry: AgentEntry }) {
  const role = entry.data.role;
  const content = entry.data.content;
  const blocks = Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
  const text =
    typeof content === "string"
      ? content
      : blocks
          .filter((block) => block.type === "text" && typeof block.text === "string")
          .map((block) => String(block.text))
          .join("\n");
  const tools = blocks.filter((block) => block.type === "toolCall");

  return (
    <article
      className={cn(
        "mb-3.5 rounded-lg p-2.5 text-xs leading-relaxed [&_p]:m-0 [&_p+p]:mt-1.5 [&_pre]:mt-1.5 [&_pre]:overflow-auto [&_pre]:text-[10px]",
        role === "user" ? "ml-7.5 bg-[#1c1f30]" : "mr-3 border border-hairline bg-surface-1",
      )}
    >
      <div className="mb-1.5 text-[10px] font-semibold uppercase text-tertiary">
        {role === "user" ? "You" : role === "toolResult" ? "Tool result" : "Agent"}
      </div>
      {text && <Streamdown>{text}</Streamdown>}
      {tools.map((tool, index) => (
        <details
          className="mt-2 rounded-md border border-hairline p-1.5"
          key={String(tool.id ?? index)}
        >
          <summary className="cursor-pointer text-[#aeb7ff]">
            {String(tool.name ?? "monitor tool")}
          </summary>
          <pre>{JSON.stringify(tool.arguments ?? {}, null, 2)}</pre>
        </details>
      ))}
      {!text && tools.length === 0 && <pre>{JSON.stringify(entry.data, null, 2)}</pre>}
    </article>
  );
}

async function loadSession(
  sessionId: string,
  setSession: (session: AgentSessionDetail | null) => void,
  setError: (message: string) => void,
): Promise<void> {
  try {
    setSession(await window.traceability.sessions.get(sessionId));
  } catch (cause) {
    setError(toError(cause));
  }
}

function modelKey(model: AvailableModel): string {
  return `${model.providerId}/${model.modelId}`;
}

function toError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function formatContext(context: AgentPromptInput["context"]): string {
  if (context.issueId) return `Issue: ${context.issueId}`;
  if (context.metricName) return `Metric: ${context.metricName}`;
  if (context.source === "performance") return `Performance: last ${context.hours ?? 24}h`;
  return "Application overview";
}
