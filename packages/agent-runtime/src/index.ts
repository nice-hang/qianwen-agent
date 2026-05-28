import type { AgentEvent, ChatMessage } from "@qianwen-agent/shared";

export interface AgentRunInput {
  conversationId: string;
  messages: ChatMessage[];
  mode?: "fast" | "deep";
  search?: "auto" | "off" | "force";
}

export interface AgentRuntime {
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
}

export function createAgentRuntime(): AgentRuntime {
  return {
    async *run(input) {
      yield { type: "phase", phase: "answering" };
      yield {
        type: "answer_delta",
        text: `Agent runtime placeholder for conversation ${input.conversationId}.`
      };
      yield {
        type: "done",
        runId: "stage0-run",
        messageId: "stage0-message"
      };
    }
  };
}
