import type {
  AgentRunSummary,
  AgentTraceEvent,
  ModelUsage
} from "@qianwen-agent/shared";
import { formatTime } from "../utils";

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
