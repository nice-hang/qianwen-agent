import type { FastifyInstance } from "fastify";
import type { TraceRepository } from "../storage/trace-repository";

export function registerDebugRoutes(
  app: FastifyInstance,
  traces: TraceRepository
) {
  app.get("/debug/runs", async () => ({
    runs: await traces.listRuns()
  }));

  app.get<{
    Params: { runId: string };
  }>("/debug/runs/:runId", async (request, reply) => {
    const detail = await traces.getRunDetail(request.params.runId);

    if (!detail) {
      reply.code(404);
      return { error: "Run not found" };
    }

    return detail;
  });
}
