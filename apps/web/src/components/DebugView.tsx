import { useMemo, useState } from "react";
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
  const trace = useMemo(() => buildAgentTrace(props.events), [props.events]);

  return (
    <section className="debug-panel">
      <header className="debug-header">
        <div>
          <p>Stage 11</p>
          <h1>Agent Trace</h1>
        </div>
        <button className="refresh" type="button" onClick={props.onRefresh}>
          刷新
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
              <RunOverview run={activeRun} usage={props.usage} />
              <TraceWorkbench trace={trace} />
              <RawTimeline events={props.events} />
            </>
          ) : (
            <div className="empty-state">
              <h2>暂无 Run</h2>
              <p>发送一条消息后，可以在这里审计每轮模型请求。</p>
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
    <aside className="run-list">
      <div className="run-list-title">
        <span>最近运行</span>
        <small>{props.runs.length}</small>
      </div>
      {props.runs.map((run) => (
        <button
          className={run.id === props.activeRunId ? "active" : undefined}
          key={run.id}
          type="button"
          onClick={() => props.onSelectRun(run.id)}
        >
          <span className={run.status === "failed" ? "run-badge failed" : "run-badge"}>
            {statusLabel(run.status)}
          </span>
          <strong>{formatTime(run.startedAt)}</strong>
          <small>
            总耗时 {formatMs(run.ttcMs)} · 首字 {formatMs(run.ttfaMs)}
          </small>
        </button>
      ))}
    </aside>
  );
}

function RunOverview(props: {
  run: AgentRunSummary;
  usage?: ModelUsage;
}) {
  return (
    <section className="trace-overview">
      <div className="run-title-row">
        <div>
          <span className={props.run.status === "failed" ? "run-badge failed" : "run-badge"}>
            {statusLabel(props.run.status)}
          </span>
          <h2>Run 总览</h2>
        </div>
        <p>
          {formatTime(props.run.startedAt)}
          {props.run.completedAt ? ` -> ${formatTime(props.run.completedAt)}` : ""}
        </p>
      </div>

      {props.run.errorMessage ? (
        <div className="trace-warning">失败原因：{props.run.errorMessage}</div>
      ) : null}

      <div className="metric-grid">
        <MetricCard
          label="总完成耗时"
          shortLabel="TTC"
          value={formatMs(props.run.ttcMs)}
          help="端到端"
        />
        <MetricCard
          label="首字耗时"
          shortLabel="TTFA"
          value={formatMs(props.run.ttfaMs)}
          help="流式体感"
        />
        <MetricCard
          label="模型请求耗时"
          shortLabel="Provider"
          value={formatMs(props.run.providerMs)}
          help="模型侧"
        />
        <MetricCard
          label="总 Token"
          shortLabel="Total"
          value={formatNumber(props.usage?.totalTokens)}
          help="成本"
        />
      </div>
    </section>
  );
}

function MetricCard(props: {
  help: string;
  label: string;
  shortLabel: string;
  value: string;
}) {
  return (
    <div className="metric-card" title={props.help}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>
        {props.shortLabel} · {props.help}
      </small>
    </div>
  );
}

function TraceWorkbench(props: { trace: AgentTrace }) {
  const [selectedRequestId, setSelectedRequestId] = useState<string>();
  const selectedRound =
    props.trace.rounds.find((round) => round.request.data.requestId === selectedRequestId) ??
    props.trace.rounds[0];

  if (props.trace.rounds.length === 0 && props.trace.tools.length === 0) {
    return null;
  }

  return (
    <section className="trace-workbench">
      <SectionTitle
        title="逐轮模型审计"
        note="看清每轮模型输入、可用工具、模型响应和工具返回值"
      />

      <div className="round-layout">
        <nav className="round-list" aria-label="Provider requests">
          {props.trace.rounds.map((round) => (
            <button
              className={round === selectedRound ? "active" : undefined}
              key={round.request.data.requestId}
              type="button"
              onClick={() => setSelectedRequestId(round.request.data.requestId)}
            >
              <strong>模型请求 #{round.request.data.iteration + 1}</strong>
              <span>{round.request.data.model}</span>
              <small>
                {round.request.data.messages.length} messages ·{" "}
                {round.request.data.tools.length} tools
              </small>
              <small>
                输出 {round.response?.data.usage?.outputTokens ?? "-"} ·{" "}
                {formatMs(round.response?.data.durationMs)}
              </small>
            </button>
          ))}
        </nav>

        {selectedRound ? (
          <RoundDetail round={selectedRound} previous={previousRound(props.trace, selectedRound)} />
        ) : (
          <div className="round-empty">本轮没有 provider request。</div>
        )}
      </div>

      <ToolAudit tools={props.trace.tools} />
      <RagAudit rag={props.trace.rag} indexEvents={props.trace.indexEvents} />
    </section>
  );
}

function RoundDetail(props: { previous?: TraceRound; round: TraceRound }) {
  const request = props.round.request.data;
  const response = props.round.response?.data;

  return (
    <article className="round-detail">
      <div className="round-head">
        <div>
          <span className="eyebrow">模型请求 #{request.iteration + 1}</span>
          <h3>{request.model}</h3>
        </div>
        <div className="round-stats">
          <span>模式：{request.mode === "deep" ? "深度思考" : "快速"}</span>
          <span>完成原因：{response?.finishReason ?? "-"}</span>
          <span>耗时：{formatMs(response?.durationMs)}</span>
        </div>
      </div>

      <div className="action-row">
        <TraceDetails title="请求 JSON">
          <JsonBlock value={providerRequestPayload(request)} />
        </TraceDetails>
        <TraceDetails title="cURL">
          <pre className="json-block">{formatCurl(request)}</pre>
        </TraceDetails>
        <TraceDetails title="对比上次">
          <RequestDiff current={request} previous={props.previous?.request.data} />
        </TraceDetails>
        <TraceDetails title="完整 JSON">
          <JsonBlock
            value={{
              request,
              response,
              events: props.round.events.map((event) => ({
                type: event.type,
                offsetMs: event.offsetMs,
                data: event.data
              }))
            }}
          />
        </TraceDetails>
      </div>

      <TraceDetails title={`消息 messages（${request.messages.length} 条）`} open>
        <MessageList messages={request.messages} />
      </TraceDetails>

      <TraceDetails title={`工具 tools（${request.tools.length} 个）`}>
        <ToolDefinitionList tools={request.tools} />
      </TraceDetails>

      <TraceDetails title="模型响应 response" open>
        <ResponsePanel round={props.round} />
      </TraceDetails>

      <TraceDetails title={`SSE / Agent 事件（${props.round.events.length} 个）`}>
        <EventList events={props.round.events} />
      </TraceDetails>
    </article>
  );
}

function MessageList(props: { messages: unknown[] }) {
  return (
    <div className="message-list">
      {props.messages.map((message, index) => {
        const record = asRecord(message);
        const role = String(record.role ?? `#${index + 1}`);
        return (
          <article className="message-card" key={index}>
            <div>
              <span className={`role-badge role-${role}`}>{role}</span>
              {"tool_call_id" in record ? (
                <small>tool_call_id: {String(record.tool_call_id)}</small>
              ) : null}
            </div>
            <pre>{formatMessageContent(record)}</pre>
          </article>
        );
      })}
    </div>
  );
}

function ToolDefinitionList(props: { tools: unknown[] }) {
  if (props.tools.length === 0) {
    return <p className="trace-empty">本轮没有可用工具。</p>;
  }

  return (
    <div className="tool-definition-list">
      {props.tools.map((tool, index) => {
        const definition = asRecord(asRecord(tool).function);
        return (
          <article className="tool-definition" key={index}>
            <div>
              <strong>{String(definition.name ?? `tool-${index + 1}`)}</strong>
              <small>{String(definition.description ?? "")}</small>
            </div>
            <JsonBlock value={definition.parameters ?? definition} />
          </article>
        );
      })}
    </div>
  );
}

function ResponsePanel(props: { round: TraceRound }) {
  const response = props.round.response?.data;
  return (
    <div className="response-panel">
      <div className="response-summary">
        <span>finish：{response?.finishReason ?? "-"}</span>
        <span>耗时：{formatMs(response?.durationMs)}</span>
        <span>输入：{response?.usage?.inputTokens ?? "-"}</span>
        <span>输出：{response?.usage?.outputTokens ?? "-"}</span>
        <span>思考：{response?.usage?.reasoningTokens ?? "-"}</span>
      </div>

      {props.round.reasoningText ? (
        <div>
          <h4>思考 reasoning</h4>
          <pre>{props.round.reasoningText}</pre>
        </div>
      ) : null}

      {props.round.answerText ? (
        <div>
          <h4>回答 answer</h4>
          <pre>{props.round.answerText}</pre>
        </div>
      ) : null}

      {props.round.toolCalls.length > 0 ? (
        <div>
          <h4>模型发起的工具调用</h4>
          <div className="mini-tool-list">
            {props.round.toolCalls.map((tool) => (
              <span key={tool.start.data.toolCallId}>
                {tool.start.data.toolName} · {formatMs(tool.durationMs)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!props.round.reasoningText && !props.round.answerText && props.round.toolCalls.length === 0 ? (
        <p className="trace-empty">本轮没有回答文本，可能只返回了工具调用。</p>
      ) : null}
    </div>
  );
}

function EventList(props: { events: AgentTraceEvent[] }) {
  return (
    <ol className="event-list">
      {props.events.map((event) => (
        <li key={event.id}>
          <time>+{event.offsetMs}ms</time>
          <strong>{event.type}</strong>
          <span>{eventSummary(event)}</span>
        </li>
      ))}
    </ol>
  );
}

function ToolAudit(props: { tools: TraceToolCall[] }) {
  return (
    <section className="audit-section">
      <SectionTitle title="工具调用返回值" note="入参、原始返回、摘要、来源和耗时" />
      {props.tools.length === 0 ? (
        <p className="trace-empty">本轮没有工具调用。</p>
      ) : (
        <div className="tool-audit-list">
          {props.tools.map((tool) => (
            <article className="tool-audit-card" key={tool.start.data.toolCallId}>
              <div className="tool-audit-head">
                <div>
                  <strong>{tool.start.data.toolName}</strong>
                  <small>{tool.start.data.toolCallId}</small>
                </div>
                <span>{formatMs(tool.durationMs)}</span>
              </div>

              <TraceDetails title="调用入参 arguments" open>
                <JsonBlock value={tool.start.data.input ?? {}} />
              </TraceDetails>
              <TraceDetails title="工具原始返回 raw output">
                <JsonBlock value={tool.done?.data.rawOutput ?? tool.rawToolMessage ?? { pending: true }} />
              </TraceDetails>
              <TraceDetails title="工具摘要 summary" open>
                <JsonBlock value={tool.done?.data.output ?? { pending: true }} />
              </TraceDetails>
              <TraceDetails title="来源 sources">
                <JsonBlock value={tool.sources} />
              </TraceDetails>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RagAudit(props: {
  indexEvents: AgentTraceEvent[];
  rag?: RagRetrievalSummary;
}) {
  return (
    <section className="audit-section">
      <SectionTitle title="文件 RAG 命中" note="检索 query、命中 chunk、注入字符数和耗时" />
      {!props.rag && props.indexEvents.length === 0 ? (
        <p className="trace-empty">本轮没有文件 RAG。</p>
      ) : (
        <div className="rag-grid">
          <div className="rag-card">
            <span>检索 query</span>
            <strong>{props.rag?.query ?? "-"}</strong>
          </div>
          <div className="rag-card">
            <span>命中片段</span>
            <strong>{props.rag?.chunkCount ?? 0} 段</strong>
          </div>
          <div className="rag-card">
            <span>注入字符数</span>
            <strong>{props.rag?.injectedChars ?? 0}</strong>
          </div>
          <div className="rag-card">
            <span>Embedding 耗时</span>
            <strong>{formatMs(props.rag?.embeddingMs)}</strong>
          </div>
          <div className="rag-card">
            <span>检索耗时</span>
            <strong>{formatMs(props.rag?.durationMs)}</strong>
          </div>
          <div className="rag-card">
            <span>索引事件</span>
            <strong>{props.indexEvents.length} 个</strong>
          </div>
        </div>
      )}

      {props.rag?.chunks.length ? (
        <div className="chunk-list">
          {props.rag.chunks.map((chunk) => (
            <article key={chunk.id ?? `${chunk.fileName}-${chunk.chunkIndex}`}>
              <div>
                <strong>{chunk.fileName}</strong>
                <span>
                  chunk {chunk.chunkIndex + 1}
                  {chunk.pageNumber ? ` · 第 ${chunk.pageNumber} 页` : ""} · score{" "}
                  {chunk.score ?? "-"}
                </span>
              </div>
              <p>{chunk.preview}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RawTimeline(props: { events: AgentTraceEvent[] }) {
  return (
    <section className="raw-timeline">
      <TraceDetails title={`原始事件日志（${props.events.length} 个）`}>
        <ol className="timeline">
          {props.events.map((event) => (
            <li key={event.id}>
              <time>+{event.offsetMs} ms</time>
              <strong>{event.type}</strong>
              {event.message ? <span>{event.message}</span> : null}
            </li>
          ))}
        </ol>
      </TraceDetails>
    </section>
  );
}

function TraceDetails(props: {
  children: ReactNode;
  open?: boolean;
  title: string;
}) {
  return (
    <details className="trace-details" open={props.open}>
      <summary>{props.title}</summary>
      {props.children}
    </details>
  );
}

function SectionTitle(props: { note?: string; title: string }) {
  return (
    <div className="trace-section-title">
      <span>{props.title}</span>
      {props.note ? <small>{props.note}</small> : null}
    </div>
  );
}

function RequestDiff(props: {
  current: ProviderRequestData;
  previous?: ProviderRequestData;
}) {
  if (!props.previous) {
    return <p className="trace-empty">这是第一轮模型请求。</p>;
  }

  const addedMessages = props.current.messages.slice(props.previous.messages.length);
  const addedTools = props.current.tools.slice(props.previous.tools.length);

  return (
    <div className="diff-grid">
      <div>
        <strong>Messages</strong>
        <span>
          {props.previous.messages.length} {"->"} {props.current.messages.length}
        </span>
        {addedMessages.length ? <JsonBlock value={addedMessages} /> : null}
      </div>
      <div>
        <strong>Tools</strong>
        <span>
          {props.previous.tools.length} {"->"} {props.current.tools.length}
        </span>
        {addedTools.length ? <JsonBlock value={addedTools} /> : null}
      </div>
    </div>
  );
}

function JsonBlock(props: { value: unknown }) {
  return <pre className="json-block">{formatJson(props.value)}</pre>;
}

type ProviderRequestEvent = Extract<AgentEvent, { type: "provider_request" }>;
type ProviderResponseEvent = Extract<AgentEvent, { type: "provider_response" }>;
type ToolStartedEvent = Extract<AgentEvent, { type: "tool_call_started" }>;
type ToolDoneEvent = Extract<AgentEvent, { type: "tool_call_done" }>;
type SearchResultsEvent = Extract<AgentEvent, { type: "search_results" }>;

type ProviderRequestData = ProviderRequestEvent;

interface TraceRequest {
  event: AgentTraceEvent;
  data: ProviderRequestEvent;
  response?: {
    event: AgentTraceEvent;
    data: ProviderResponseEvent;
  };
}

interface TraceRound {
  answerText: string;
  events: AgentTraceEvent[];
  reasoningText: string;
  request: TraceRequest;
  response?: TraceRequest["response"];
  toolCalls: TraceToolCall[];
}

interface TraceToolCall {
  done?: {
    event: AgentTraceEvent;
    data: ToolDoneEvent;
  };
  durationMs?: number;
  rawToolMessage?: unknown;
  sources: unknown[];
  start: {
    event: AgentTraceEvent;
    data: ToolStartedEvent;
  };
}

interface RagRetrievalSummary {
  chunkCount: number;
  chunks: Array<{
    attachmentId?: string;
    chunkIndex: number;
    fileName: string;
    id?: string;
    pageNumber?: number;
    preview?: string;
    score?: number;
  }>;
  durationMs?: number;
  embeddingMs?: number;
  injectedChars: number;
  query: string;
  sourcesCount: number;
}

interface AgentTrace {
  indexEvents: AgentTraceEvent[];
  rag?: RagRetrievalSummary;
  requests: TraceRequest[];
  rounds: TraceRound[];
  tools: TraceToolCall[];
}

function buildAgentTrace(events: AgentTraceEvent[]): AgentTrace {
  const responses = new Map<string, { event: AgentTraceEvent; data: ProviderResponseEvent }>();
  const toolDone = new Map<string, { event: AgentTraceEvent; data: ToolDoneEvent }>();
  const searchResults = new Map<string, SearchResultsEvent[]>();

  for (const event of events) {
    if (isProviderResponse(event.data)) {
      responses.set(event.data.requestId, { event, data: event.data });
    }
    if (isToolDone(event.data)) {
      toolDone.set(event.data.toolCallId, { event, data: event.data });
    }
    if (isSearchResults(event.data)) {
      const current = searchResults.get(event.data.toolCallId) ?? [];
      current.push(event.data);
      searchResults.set(event.data.toolCallId, current);
    }
  }

  const requests = events.flatMap((event) => {
    if (!isProviderRequest(event.data)) return [];
    return [
      {
        event,
        data: event.data,
        response: responses.get(event.data.requestId)
      }
    ];
  });

  const tools = events.flatMap((event) => {
    if (!isToolStarted(event.data)) return [];
    const done = toolDone.get(event.data.toolCallId);
    return [
      {
        start: { event, data: event.data },
        done,
        durationMs: done ? done.event.offsetMs - event.offsetMs : undefined,
        rawToolMessage: findToolResultMessage(requests, event.data.toolCallId),
        sources: searchResults.get(event.data.toolCallId)?.flatMap((item) => item.sources) ?? []
      }
    ];
  });

  const rounds = requests.map((request, index) => {
    const nextRequest = requests[index + 1];
    const eventsInRound = events.filter(
      (event) =>
        event.offsetMs >= request.event.offsetMs &&
        (!nextRequest || event.offsetMs < nextRequest.event.offsetMs)
    );
    const roundTools = tools.filter(
      (tool) =>
        tool.start.event.offsetMs >= request.event.offsetMs &&
        (!nextRequest || tool.start.event.offsetMs < nextRequest.event.offsetMs)
    );

    return {
      request,
      response: request.response,
      events: eventsInRound,
      reasoningText: eventsInRound.flatMap(reasoningTextFromEvent).join(""),
      answerText: eventsInRound.flatMap(answerTextFromEvent).join(""),
      toolCalls: roundTools
    };
  });

  return {
    requests,
    rounds,
    tools,
    rag: findLatestRagRetrieval(events),
    indexEvents: events.filter((event) => event.type.startsWith("file_index_"))
  };
}

function previousRound(trace: AgentTrace, round: TraceRound): TraceRound | undefined {
  const index = trace.rounds.indexOf(round);
  return index > 0 ? trace.rounds[index - 1] : undefined;
}

function findToolResultMessage(requests: TraceRequest[], toolCallId: string): unknown {
  for (const request of requests) {
    for (const message of request.data.messages) {
      const record = asRecord(message);
      if (record.role === "tool" && record.tool_call_id === toolCallId) {
        return parseMaybeJson(record.content);
      }
    }
  }
  return undefined;
}

function findLatestRagRetrieval(events: AgentTraceEvent[]): RagRetrievalSummary | undefined {
  const event = [...events]
    .reverse()
    .find((item) => item.type === "rag_retrieval_done");
  const data = asRecord(event?.data);
  if (!event || Object.keys(data).length === 0) return undefined;

  return {
    query: String(data.query ?? ""),
    chunkCount: Number(data.chunkCount ?? 0),
    sourcesCount: Number(data.sourcesCount ?? 0),
    injectedChars: Number(data.injectedChars ?? 0),
    embeddingMs: numberOrUndefined(data.embeddingMs),
    durationMs: numberOrUndefined(data.durationMs),
    chunks: Array.isArray(data.chunks)
      ? data.chunks.map((chunk) => {
          const record = asRecord(chunk);
          return {
            id: typeof record.id === "string" ? record.id : undefined,
            attachmentId:
              typeof record.attachmentId === "string" ? record.attachmentId : undefined,
            fileName: String(record.fileName ?? "-"),
            chunkIndex: Number(record.chunkIndex ?? 0),
            pageNumber: numberOrUndefined(record.pageNumber),
            score: numberOrUndefined(record.score),
            preview: typeof record.preview === "string" ? record.preview : undefined
          };
        })
      : []
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

function isSearchResults(input: unknown): input is SearchResultsEvent {
  return asRecord(input).type === "search_results";
}

function reasoningTextFromEvent(event: AgentTraceEvent): string[] {
  const data = asRecord(event.data);
  return data.type === "reasoning_delta" && typeof data.text === "string" ? [data.text] : [];
}

function answerTextFromEvent(event: AgentTraceEvent): string[] {
  const data = asRecord(event.data);
  return data.type === "answer_delta" && typeof data.text === "string" ? [data.text] : [];
}

function asRecord(input: unknown): Record<string, any> {
  return typeof input === "object" && input !== null ? (input as Record<string, any>) : {};
}

function formatMessageContent(message: Record<string, any>): string {
  if ("content" in message) return formatValue(message.content);
  return formatJson(message);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    const parsed = parseMaybeJson(value);
    return parsed === value ? value : formatJson(parsed);
  }
  return formatJson(value);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function providerRequestPayload(request: ProviderRequestData): unknown {
  return {
    model: request.model,
    mode: request.mode,
    messages: request.messages,
    tools: request.tools
  };
}

function formatCurl(request: ProviderRequestData): string {
  return [
    "curl -X POST \"$QWEN_BASE_URL/chat/completions\" \\",
    "  -H \"Authorization: Bearer $QWEN_API_KEY\" \\",
    "  -H \"Content-Type: application/json\" \\",
    `  -d '${JSON.stringify(providerRequestPayload(request), null, 2).replace(/'/g, "'\\''")}'`
  ].join("\n");
}

function eventSummary(event: AgentTraceEvent): string {
  const data = asRecord(event.data);
  if (typeof data.text === "string") return data.text.slice(0, 90);
  if (typeof data.toolName === "string") return data.toolName;
  if (typeof data.query === "string") return data.query;
  if (typeof data.message === "string") return data.message;
  return event.message ?? "";
}

function statusLabel(status: AgentRunSummary["status"]): string {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "运行中";
}

function formatMs(value?: number | null): string {
  return typeof value === "number" ? `${value.toLocaleString()} ms` : "-";
}

function formatNumber(value?: number | null): string {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function lastOffset(events: Array<AgentTraceEvent | undefined>): number | undefined {
  return events.flatMap((event) => (event ? [event.offsetMs] : [])).at(-1);
}
