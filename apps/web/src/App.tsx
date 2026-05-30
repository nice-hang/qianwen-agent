import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createApiClient,
  type AgentEvent,
  type AgentRunSummary,
  type AgentTraceEvent,
  type ChatMessage,
  type Conversation,
  type ModelUsage
} from "@qianwen-agent/shared";
import { ChatView } from "./components/ChatView";
import { DebugView } from "./components/DebugView";
import { readError } from "./utils";
import "./App.css";

const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001"
});

export function App() {
  const [view, setView] = useState<"chat" | "debug">("chat");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [runEvents, setRunEvents] = useState<AgentTraceEvent[]>([]);
  const [runUsage, setRunUsage] = useState<ModelUsage>();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId
      ),
    [activeConversationId, conversations]
  );

  useEffect(() => {
    // 首次加载恢复侧边栏，并默认选中最近会话。
    void loadConversations();
  }, []);

  useEffect(() => {
    // 切换会话时重新拉服务端状态，避免使用过期本地消息。
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    if (view === "debug") {
      void loadRuns();
    }
  }, [view]);

  useEffect(() => {
    if (!activeRunId) {
      setRunEvents([]);
      setRunUsage(undefined);
      return;
    }

    void loadRun(activeRunId);
  }, [activeRunId]);

  async function withRequest<T>(task: () => Promise<T>): Promise<T | undefined> {
    try {
      return await task();
    } catch (cause) {
      setError(readError(cause));
      return undefined;
    }
  }

  async function loadConversations() {
    const response = await withRequest(() => api.listConversations());
    if (!response) return;

    setConversations(response.conversations);
    setActiveConversationId((current) => {
      if (current) return current;
      return response.conversations[0]?.id;
    });
  }

  async function loadMessages(conversationId: string) {
    const response = await withRequest(() => api.listMessages(conversationId));
    if (response) setMessages(response.messages);
  }

  async function startNewChat() {
    setActiveConversationId(undefined);
    setMessages([]);
    setError(undefined);
    setView("chat");
  }

  async function loadRuns() {
    const response = await withRequest(() => api.listRuns());
    if (!response) return;

    setRuns(response.runs);
    setActiveRunId((current) => current ?? response.runs[0]?.id);
  }

  async function loadRun(runId: string) {
    const response = await withRequest(() => api.getRun(runId));
    if (!response) return;

    setRunEvents(response.events);
    setRunUsage(response.usage);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;

    const optimistic = createOptimisticMessages(text, activeConversationId);
    beginSending(optimistic);

    const sent = await withRequest(() => sendMessage(text, optimistic));
    if (!sent) {
      updateMessage(optimistic.assistant.id, { status: "failed" });
    }

    setIsSending(false);
  }

  function beginSending(optimistic: OptimisticMessages) {
    setDraft("");
    setError(undefined);
    setIsSending(true);
    setMessages((current) => [
      ...current,
      optimistic.user,
      optimistic.assistant
    ]);
  }

  async function sendMessage(text: string, optimistic: OptimisticMessages) {
    const state: SendState = {
      conversationId: activeConversationId,
      assistantId: optimistic.assistant.id
    };

    // 消费 shared AgentEvent 流，把增量内容合并进乐观 assistant 气泡。
    for await (const streamEvent of api.streamChat({
      conversationId: activeConversationId,
      message: text,
      mode
    })) {
      await applyStreamEvent(streamEvent, optimistic, state);
    }

    await finalizeConversation(state);
    return true;
  }

  async function applyStreamEvent(
    event: AgentEvent,
    optimistic: OptimisticMessages,
    state: SendState
  ) {
    if (event.type === "answer_delta") {
      appendAssistantText(optimistic.assistant.id, event.text);
      return;
    }

    if (event.type === "reasoning_delta") {
      appendAssistantReasoning(optimistic.assistant.id, event.text);
      return;
    }

    if (event.type === "done") {
      state.conversationId = event.conversationId ?? state.conversationId;
      state.assistantId = event.messageId ?? state.assistantId;
      applyDoneMessageIds(event, optimistic, state);
      return;
    }

    if (event.type === "error") {
      // provider 失败前，服务端可能已经保存了用户消息。
      if (event.conversationId) {
        state.conversationId = event.conversationId;
        await loadConversations();
        setActiveConversationId(event.conversationId);
        await loadMessages(event.conversationId);
      }
      throw new Error(event.message);
    }
  }

  function appendAssistantText(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, content: message.content + text }
          : message
      )
    );
  }

  function appendAssistantReasoning(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              reasoningContent: `${message.reasoningContent ?? ""}${text}`
            }
          : message
      )
    );
  }

  function applyDoneMessageIds(
    event: Extract<AgentEvent, { type: "done" }>,
    optimistic: OptimisticMessages,
    state: SendState
  ) {
    setMessages((current) =>
      current.map((message) => {
        if (message.id === optimistic.assistant.id) {
          return {
            ...message,
            id: event.messageId ?? message.id,
            conversationId: state.conversationId ?? message.conversationId,
            status: "completed"
          };
        }

        if (message.id === optimistic.user.id) {
          return {
            ...message,
            conversationId: state.conversationId ?? message.conversationId
          };
        }

        return message;
      })
    );
  }

  async function finalizeConversation(state: SendState) {
    await loadConversations();

    if (state.conversationId) {
      setActiveConversationId(state.conversationId);
      await loadMessages(state.conversationId);
      return;
    }

    updateMessage(state.assistantId, { status: "completed" });
  }

  function updateMessage(messageId: string, patch: Partial<ChatMessage>) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, ...patch } : message
      )
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <button
            className="brand"
            type="button"
            onClick={() => setView("chat")}
            aria-label="Back to chat"
          >
            千问
          </button>
        </div>
        <button className="new-chat" type="button" onClick={startNewChat}>
          新建对话
        </button>
        <nav className="conversation-list" aria-label="Conversations">
          <span className="nav-label">最近对话</span>
          {conversations.map((conversation) => (
            <button
              className={
                conversation.id === activeConversationId ? "active" : undefined
              }
              key={conversation.id}
              type="button"
              onClick={() => setActiveConversationId(conversation.id)}
            >
              {conversation.title}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className={view === "debug" ? "debug-link active" : "debug-link"}
            type="button"
            onClick={() => setView(view === "debug" ? "chat" : "debug")}
          >
            Run Trace
          </button>
          <span>Qianwen Agent</span>
        </div>
      </aside>

      {view === "chat" ? (
        <ChatView
          activeConversation={activeConversation}
          draft={draft}
          error={error}
          isSending={isSending}
          messages={messages}
          mode={mode}
          onDraftChange={setDraft}
          onModeChange={setMode}
          onSubmit={handleSubmit}
        />
      ) : (
        <DebugView
          activeRunId={activeRunId}
          error={error}
          events={runEvents}
          onRefresh={loadRuns}
          onSelectRun={setActiveRunId}
          runs={runs}
          usage={runUsage}
        />
      )}
    </main>
  );
}

interface OptimisticMessages {
  user: ChatMessage;
  assistant: ChatMessage;
}

interface SendState {
  conversationId?: string;
  assistantId: string;
}

function createOptimisticMessages(
  text: string,
  conversationId?: string
): OptimisticMessages {
  const createdAt = new Date().toISOString();

  return {
    user: {
      id: `local-user-${Date.now()}`,
      conversationId: conversationId ?? "local",
      role: "user",
      status: "completed",
      content: text,
      reasoningContent: null,
      createdAt
    },
    assistant: {
      id: `local-assistant-${Date.now()}`,
      conversationId: conversationId ?? "local",
      role: "assistant",
      status: "streaming",
      content: "",
      reasoningContent: "",
      createdAt
    }
  };
}
