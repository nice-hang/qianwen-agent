import type {
  AgentRunSummary,
  AgentTraceEvent,
  ModelUsage,
  TokenUsage
} from "@qianwen-agent/shared";
import type {
  AgentEvent as DbAgentEvent,
  AgentRun,
  ModelUsage as DbModelUsage,
  PrismaClient
} from "@prisma/client";

export type TraceRepository = ReturnType<typeof createTraceRepository>;

export function createTraceRepository(db: PrismaClient) {
  async function createRun(input: {
    conversationId?: string;
  }): Promise<AgentRunSummary> {
    const run = await db.agentRun.create({
      data: {
        conversationId: input.conversationId,
        status: "running"
      }
    });

    return toRunSummary(run);
  }

  async function updateRunConversation(input: {
    runId: string;
    conversationId: string;
  }): Promise<void> {
    await db.agentRun.update({
      where: { id: input.runId },
      data: { conversationId: input.conversationId }
    });
  }

  async function recordEvent(input: {
    runId: string;
    type: string;
    startedAt: string;
    message?: string;
    data?: unknown;
  }): Promise<AgentTraceEvent> {
    const at = new Date();
    const event = await db.agentEvent.create({
      data: {
        runId: input.runId,
        type: input.type,
        at,
        offsetMs: at.getTime() - new Date(input.startedAt).getTime(),
        message: input.message,
        dataJson: input.data ? JSON.stringify(input.data) : undefined
      }
    });

    return toTraceEvent(event);
  }

  async function completeRun(input: {
    runId: string;
    ttfeMs?: number;
    ttfaMs?: number;
    ttcMs: number;
    providerMs?: number;
  }): Promise<void> {
    await db.agentRun.update({
      where: { id: input.runId },
      data: {
        status: "completed",
        completedAt: new Date(),
        ttfeMs: input.ttfeMs,
        ttfaMs: input.ttfaMs,
        ttcMs: input.ttcMs,
        providerMs: input.providerMs
      }
    });
  }

  async function failRun(input: {
    runId: string;
    errorMessage: string;
    ttfeMs?: number;
    ttfaMs?: number;
    ttcMs: number;
    providerMs?: number;
  }): Promise<void> {
    await db.agentRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        failedAt: new Date(),
        errorMessage: input.errorMessage,
        ttfeMs: input.ttfeMs,
        ttfaMs: input.ttfaMs,
        ttcMs: input.ttcMs,
        providerMs: input.providerMs
      }
    });
  }

  async function saveUsage(input: {
    runId: string;
    usage: TokenUsage;
  }): Promise<void> {
    await db.modelUsage.upsert({
      where: { runId: input.runId },
      create: {
        runId: input.runId,
        provider: input.usage.provider,
        model: input.usage.model,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        reasoningTokens: input.usage.reasoningTokens,
        totalTokens: input.usage.totalTokens,
        rawJson: input.usage.raw ? JSON.stringify(input.usage.raw) : undefined
      },
      update: {
        provider: input.usage.provider,
        model: input.usage.model,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        reasoningTokens: input.usage.reasoningTokens,
        totalTokens: input.usage.totalTokens,
        rawJson: input.usage.raw ? JSON.stringify(input.usage.raw) : undefined
      }
    });
  }

  async function listRuns(): Promise<AgentRunSummary[]> {
    const runs = await db.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50
    });

    return runs.map(toRunSummary);
  }

  async function getRunDetail(runId: string): Promise<{
    run: AgentRunSummary;
    events: AgentTraceEvent[];
    usage?: ModelUsage;
  } | null> {
    const run = await db.agentRun.findUnique({
      where: { id: runId },
      include: {
        events: { orderBy: { at: "asc" } },
        usage: true
      }
    });

    if (!run) return null;

    return {
      run: toRunSummary(run),
      events: run.events.map(toTraceEvent),
      usage: run.usage ? toModelUsage(run.usage) : undefined
    };
  }

  return {
    createRun,
    updateRunConversation,
    recordEvent,
    completeRun,
    failRun,
    saveUsage,
    listRuns,
    getRunDetail
  };
}

function toRunSummary(run: AgentRun): AgentRunSummary {
  return {
    id: run.id,
    conversationId: run.conversationId,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    errorMessage: run.errorMessage,
    ttfeMs: run.ttfeMs,
    ttfaMs: run.ttfaMs,
    ttcMs: run.ttcMs,
    providerMs: run.providerMs
  };
}

function toTraceEvent(event: DbAgentEvent): AgentTraceEvent {
  return {
    id: event.id,
    runId: event.runId,
    type: event.type,
    at: event.at.toISOString(),
    offsetMs: event.offsetMs,
    message: event.message,
    data: event.dataJson ? JSON.parse(event.dataJson) : undefined
  };
}

function toModelUsage(usage: DbModelUsage): ModelUsage {
  return {
    id: usage.id,
    runId: usage.runId,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
    raw: usage.rawJson ? JSON.parse(usage.rawJson) : undefined
  };
}
