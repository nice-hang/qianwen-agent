import { useMemo } from "react";
import type { ReactNode } from "react";
import type {
  AgentEvent,
  AgentRunSummary,
  AgentTraceEvent,
  ModelUsage
} from "@qianwen-agent/shared";
import { formatTime } from "../utils";
import "./DebugView.css";

interface DebugViewProps {
  activeRunId?: string;
  error?: string;
  events: AgentTraceEvent[];
  onRefresh: () => void;
  onSelectRun: (runId: string) => void;
  runs: AgentRunSummary[];
  usage?: ModelUsage;
}

export function DebugView(props: DebugViewProps) {
  const activeRun = props.runs.find((run) => run.id === props.activeRunId);

  return (
    <section className="debug-panel">
      <header className="chat-header">
        <div>
          <p>Stage 2</p>
          <h1>Run Trace</h1>
        </div>
        <button className="refresh" type="button" onClick={props.onRefresh}>
          Refresh
        </button>
      </header>

      <div className="debug-layout">
        <RunList
          activeRunId={props.activeRunId}
          onSelectRun={props.onSelectRun}
          runs={props.runs}
        />

        <div className="run-detail">
          {activeRun ? (
            <>
              <RunMetrics run={activeRun} />
              {props.usage ? <UsageSummary usage={props.usage} /> : null}
              <AgentTraceViewer events={props.events} />
              <Timeline events={props.events} />
            </>
          ) : (
            <div className="empty-state">
              <h2>No runs yet.</h2>
              <p>Send a message, then open Debug to inspect the trace.</p>
            </div>
          )}
        </div>
      </div>

      {props.error ? <div className="error">{props.error}</div> : null}
    </section>
  );
}

function AgentTraceViewer(props: { events: AgentTraceEvent[] }) {
  const trace = useMemo(() => buildAgentTrace(props.events), [props.events]);

  if (trace.requests.length === 0 && trace.tools.length === 0) {
    return null;
  }

  return (
    <section className="agent-trace">
      <div className="trace-section-title">
        <span>Agent Trace</span>
        <small>
          {trace.requests.length} requests / {trace.tools.length} tools
        </small>
      </div>

      <div className="trace-grid">
        <div className="trace-column">
          <h3>Provider Requests</h3>
          {trace.requests.map((request, index) => (
            <article className="trace-request" key={request.event.id}>
              <div className="trace-card-head">
                <strong>#{request.data.iteration + 1}</strong>
                <span>{request.data.model}</span>
                <small>{request.data.mode}</small>
              </div>
              <div className="trace-metadata">
                <span>{request.data.messages.length} messages</span>
                <span>{request.data.tools.length} tools</span>
                <span>{request.response?.data.durationMs ?? "-"} ms</span>
                <span>{request.response?.data.finishReason ?? "-"}</span>
              </div>

              <TraceDetails title="Messages">
                <MessageList messages={request.data.messages} />
              </TraceDetails>
              <TraceDetails title="Tools">
                <ToolList tools={request.data.tools} />
              </TraceDetails>
              <TraceDetails title="Diff">
                <RequestDiff
                  current={request.data}
                  previous={trace.requests[index - 1]?.data}
                />
              </TraceDetails>
              <TraceDetails title="Raw JSON">
                <JsonBlock value={{ request: request.data, response: request.response?.data }} />
              </TraceDetails>
            </article>
          ))}
        </div>

        <div className="trace-column">
          <h3>Tool Calls</h3>
          {trace.tools.length > 0 ? (
            trace.tools.map((tool) => (
              <article className="trace-tool" key={tool.start.event.id}>
                <div className="trace-card-head">
                  <strong>{tool.start.data.toolName}</strong>
                  <span>{tool.start.data.toolCallId}</span>
                  <small>{tool.durationMs ?? "-"} ms</small>
                </div>
                <TraceDetails title="Input">
                  <JsonBlock value={tool.start.data.input ?? {}} />
                </TraceDetails>
                <TraceDetails title="Output">
                  <JsonBlock value={tool.done?.data.output ?? { pending: true }} />
                </TraceDetails>
              </article>
            ))
          ) : (
            <p className="trace-empty">No tool calls in this run.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function TraceDetails(props: { children: ReactNode; title: string }) {
  return (
    <details className="trace-details">
      <summary>{props.title}</summary>
      {props.children}
    </details>
  );
}

function MessageList(props: { messages: unknown[] }) {
  return (
    <div className="message-inspector">
      {props.messages.map((message, index) => {
        const record = asRecord(message);
        return (
          <div className="inspector-row" key={index}>
            <span>{String(record.role ?? `#${index + 1}`)}</span>
            <pre>{formatMessageContent(record)}</pre>
          </div>
        );
      })}
    </div>
  );
}

function ToolList(props: { tools: unknown[] }) {
  return (
    <div className="message-inspector">
      {props.tools.map((tool, index) => {
        const definition = asRecord(asRecord(tool).function);
        return (
          <div className="inspector-row" key={index}>
            <span>{String(definition.name ?? `tool-${index + 1}`)}</span>
            <pre>{formatJson(definition)}</pre>
          </div>
        );
      })}
    </div>
  );
}

function RequestDiff(props: {
  current: ProviderRequestData;
  previous?: ProviderRequestData;
}) {
  if (!props.previous) {
    return <p className="trace-empty">First provider request.</p>;
  }

  const addedMessages = props.current.messages.slice(props.previous.messages.length);
  const addedTools = props.current.tools.slice(props.previous.tools.length);

  return (
    <div className="message-inspector">
      <div className="inspector-row">
        <span>Messages</span>
        <pre>
          {`${props.previous.messages.length} -> ${props.current.messages.length}`}
          {addedMessages.length ? `\n\nAdded:\n${formatJson(addedMessages)}` : ""}
        </pre>
      </div>
      <div className="inspector-row">
        <span>Tools</span>
        <pre>
          {`${props.previous.tools.length} -> ${props.current.tools.length}`}
          {addedTools.length ? `\n\nAdded:\n${formatJson(addedTools)}` : ""}
        </pre>
      </div>
    </div>
  );
}

function JsonBlock(props: { value: unknown }) {
  return <pre className="json-block">{formatJson(props.value)}</pre>;
}

function RunList(props: {
  activeRunId?: string;
  onSelectRun: (runId: string) => void;
  runs: AgentRunSummary[];
}) {
  return (
    <div className="run-list">
      {props.runs.map((run) => (
        <button
          className={run.id === props.activeRunId ? "active" : undefined}
          key={run.id}
          type="button"
          onClick={() => props.onSelectRun(run.id)}
        >
          <strong>{run.status}</strong>
          <span>{formatTime(run.startedAt)}</span>
          <small>{run.ttcMs ?? "-"} ms</small>
        </button>
      ))}
    </div>
  );
}

function RunMetrics(props: { run: AgentRunSummary }) {
  return (
    <div className="metrics">
      <Metric label="TTFE" value={props.run.ttfeMs} />
      <Metric label="TTFR" value={props.run.ttfrMs} />
      <Metric label="TTFA" value={props.run.ttfaMs} />
      <Metric label="TTC" value={props.run.ttcMs} />
      <Metric label="Provider" value={props.run.providerMs} />
    </div>
  );
}

function Metric(props: { label: string; value?: number | null }) {
  return (
    <div>
      <span>{props.label}</span>
      <strong>{props.value ?? "-"} ms</strong>
    </div>
  );
}

function UsageSummary(props: { usage: ModelUsage }) {
  return (
    <div className="usage">
      <span>model: {props.usage.model}</span>
      <span>input: {props.usage.inputTokens ?? "-"}</span>
      <span>reasoning: {props.usage.reasoningTokens ?? "-"}</span>
      <span>output: {props.usage.outputTokens ?? "-"}</span>
      <span>total: {props.usage.totalTokens ?? "-"}</span>
    </div>
  );
}

function Timeline(props: { events: AgentTraceEvent[] }) {
  return (
    <ol className="timeline">
      {props.events.map((event) => (
        <li key={event.id}>
          <time>+{event.offsetMs} ms</time>
          <strong>{event.type}</strong>
          {event.message ? <span>{event.message}</span> : null}
        </li>
      ))}
    </ol>
  );
}

type ProviderRequestEvent = Extract<AgentEvent, { type: "provider_request" }>;
type ProviderResponseEvent = Extract<AgentEvent, { type: "provider_response" }>;
type ToolStartedEvent = Extract<AgentEvent, { type: "tool_call_started" }>;
type ToolDoneEvent = Extract<AgentEvent, { type: "tool_call_done" }>;

type ProviderRequestData = ProviderRequestEvent;

interface TraceRequest {
  event: AgentTraceEvent;
  data: ProviderRequestEvent;
  response?: {
    event: AgentTraceEvent;
    data: ProviderResponseEvent;
  };
}

interface TraceToolCall {
  start: {
    event: AgentTraceEvent;
    data: ToolStartedEvent;
  };
  done?: {
    event: AgentTraceEvent;
    data: ToolDoneEvent;
  };
  durationMs?: number;
}

function buildAgentTrace(events: AgentTraceEvent[]): {
  requests: TraceRequest[];
  tools: TraceToolCall[];
} {
  const responses = new Map<string, { event: AgentTraceEvent; data: ProviderResponseEvent }>();
  const toolDone = new Map<string, { event: AgentTraceEvent; data: ToolDoneEvent }>();

  for (const event of events) {
    if (isProviderResponse(event.data)) {
      responses.set(event.data.requestId, { event, data: event.data });
    }
    if (isToolDone(event.data)) {
      toolDone.set(event.data.toolCallId, { event, data: event.data });
    }
  }

  return {
    requests: events.flatMap((event) => {
      if (!isProviderRequest(event.data)) return [];
      return [
        {
          event,
          data: event.data,
          response: responses.get(event.data.requestId)
        }
      ];
    }),
    tools: events.flatMap((event) => {
      if (!isToolStarted(event.data)) return [];
      const done = toolDone.get(event.data.toolCallId);
      return [
        {
          start: { event, data: event.data },
          done,
          durationMs: done ? done.event.offsetMs - event.offsetMs : undefined
        }
      ];
    })
  };
}

function isProviderRequest(input: unknown): input is ProviderRequestEvent {
  return asRecord(input).type === "provider_request";
}

function isProviderResponse(input: unknown): input is ProviderResponseEvent {
  return asRecord(input).type === "provider_response";
}

function isToolStarted(input: unknown): input is ToolStartedEvent {
  return asRecord(input).type === "tool_call_started";
}

function isToolDone(input: unknown): input is ToolDoneEvent {
  return asRecord(input).type === "tool_call_done";
}

function asRecord(input: unknown): Record<string, any> {
  return typeof input === "object" && input !== null ? (input as Record<string, any>) : {};
}

function formatMessageContent(message: Record<string, any>): string {
  if ("content" in message) return formatJson(message.content);
  return formatJson(message);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
