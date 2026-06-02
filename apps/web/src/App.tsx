import {
  FormEvent,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  createApiClient,
  type AgentEvent,
  type AgentRunSummary,
  type AgentTraceEvent,
  type ChatAttachment,
  type ChatMessage,
  type Conversation,
  type ModelUsage,
  type SearchSource
} from "@qianwen-agent/shared";
import { ChatView } from "./components/ChatView";
import { DebugView } from "./components/DebugView";
import { readError } from "./utils";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001";
const MESSAGE_HISTORY_LIMIT = 120;
const api = createApiClient({
  baseUrl: API_BASE_URL
});

export function App() {
  const [view, setView] = useState<"chat" | "debug">("chat");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(
    getConversationIdFromLocation()
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [runEvents, setRunEvents] = useState<AgentTraceEvent[]>([]);
  const [runUsage, setRunUsage] = useState<ModelUsage>();
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string>();
  const activeConversationIdRef = useRef(activeConversationId);
  const messageCacheRef = useRef(new Map<string, ChatMessage[]>());

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId
      ),
    [activeConversationId, conversations]
  );

  useEffect(() => {
    // 首次加载恢复侧边栏；是否进入会话只由 URL query 决定。
    void loadConversations();
  }, []);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    function handlePopState() {
      setActiveConversationId(getConversationIdFromLocation());
      setView("chat");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    // 切换会话时重新拉服务端状态，避免使用过期本地消息。
    if (!activeConversationId) {
      setMessages([]);
      setIsLoadingMessages(false);
      return;
    }

    const cachedMessages = messageCacheRef.current.get(activeConversationId);
    setMessages(cachedMessages ?? []);
    setIsLoadingMessages(!cachedMessages);
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
  }

  async function loadMessages(conversationId: string) {
    const response = await withRequest(() =>
      api.listMessages(conversationId, { limit: MESSAGE_HISTORY_LIMIT })
    );
    if (!response) {
      if (activeConversationIdRef.current === conversationId) {
        setIsLoadingMessages(false);
      }
      return;
    }

    messageCacheRef.current.set(conversationId, response.messages);
    if (activeConversationIdRef.current === conversationId) {
      startTransition(() => setMessages(response.messages));
      setIsLoadingMessages(false);
    }
  }

  async function startNewChat() {
    selectConversation(undefined);
    setMessages([]);
    setAttachments([]);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>, draft: string) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && attachments.length === 0) || isSending) return;

    const optimistic = createOptimisticMessages(
      text,
      activeConversationId,
      attachments
    );
    beginSending(optimistic);

    const sent = await withRequest(() =>
      sendMessage(text, attachments, optimistic)
    );
    if (!sent) {
      updateMessage(optimistic.assistant.id, { status: "failed" });
    }

    setIsSending(false);
  }

  function beginSending(optimistic: OptimisticMessages) {
    setAttachments([]);
    setError(undefined);
    setIsSending(true);
    setMessages((current) => [
      ...current,
      optimistic.user,
      optimistic.assistant
    ]);
  }

  async function sendMessage(
    text: string,
    sentAttachments: ChatAttachment[],
    optimistic: OptimisticMessages
  ) {
    const state: SendState = {
      conversationId: activeConversationId,
      assistantId: optimistic.assistant.id
    };

    // 消费 shared AgentEvent 流，把增量内容合并进乐观 assistant 气泡。
    await api.streamChat(
      {
        conversationId: activeConversationId,
        message: text,
        mode,
        attachmentIds: sentAttachments.map((attachment) => attachment.id)
      },
      {
        onEvent: async (streamEvent) => {
          await applyStreamEvent(streamEvent, optimistic, state);
        }
      }
    );

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

    if (event.type === "search_results") {
      appendAssistantSources(optimistic.assistant.id, event.sources);
      return;
    }

    if (event.type === "tool_call_started") {
      updateMessage(optimistic.assistant.id, {
        activity:
          event.toolName === "web_fetch" ? "正在打开网页..." : "正在搜索..."
      });
      return;
    }

    if (event.type === "tool_call_done") {
      updateMessage(optimistic.assistant.id, { activity: undefined });
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
        selectConversation(event.conversationId, "replace");
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

  function appendAssistantSources(messageId: string, sources: SearchSource[]) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, sources: dedupeSources(message.sources, sources) }
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
            status: "completed",
            activity: undefined
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
      selectConversation(state.conversationId, "replace");
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

  function selectConversation(
    conversationId?: string,
    mode: "push" | "replace" = "push"
  ) {
    setActiveConversationId(conversationId);
    updateConversationQuery(conversationId, mode);
  }

  async function uploadImage(file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await withRequest(() =>
      api.uploadImage({
        fileName: file.name,
        mimeType: file.type,
        dataUrl
      })
    );

    if (!response) return;
    setAttachments((current) => [...current, response.attachment]);
  }

  async function uploadFile(file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await withRequest(() =>
      api.uploadFile({
        conversationId: activeConversationId,
        fileName: file.name,
        mimeType: file.type || mimeTypeFromFileName(file.name),
        dataUrl
      })
    );

    if (!response) return;
    setAttachments((current) => [...current, response.attachment]);
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
              onClick={() => selectConversation(conversation.id)}
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
          error={error}
          isLoadingMessages={isLoadingMessages}
          isSending={isSending}
          messages={messages}
          mode={mode}
          onFileSelected={(file) => void uploadFile(file)}
          onImageSelected={(file) => void uploadImage(file)}
          onModeChange={setMode}
          onRemoveAttachment={(attachmentId) =>
            setAttachments((current) =>
              current.filter((attachment) => attachment.id !== attachmentId)
            )
          }
          onSubmit={handleSubmit}
          resolveAttachmentUrl={resolveAttachmentUrl}
          selectedAttachments={attachments}
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
  conversationId?: string,
  attachments: ChatAttachment[] = []
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
      sources: undefined,
      attachments,
      activity: undefined,
      createdAt
    },
    assistant: {
      id: `local-assistant-${Date.now()}`,
      conversationId: conversationId ?? "local",
      role: "assistant",
      status: "streaming",
      content: "",
      reasoningContent: "",
      sources: undefined,
      activity: undefined,
      createdAt
    }
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Read file failed"));
    reader.readAsDataURL(file);
  });
}

function resolveAttachmentUrl(url: string): string {
  if (/^https?:\/\//u.test(url)) return url;
  return `${API_BASE_URL}${url}`;
}

function getConversationIdFromLocation(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  return params.get("conversationId") ?? undefined;
}

function updateConversationQuery(
  conversationId: string | undefined,
  mode: "push" | "replace"
) {
  const url = new URL(window.location.href);

  if (conversationId) {
    url.searchParams.set("conversationId", conversationId);
  } else {
    url.searchParams.delete("conversationId");
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (nextUrl === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    return;
  }

  window.history[mode === "replace" ? "replaceState" : "pushState"](
    null,
    "",
    nextUrl
  );
}

function mimeTypeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".json")) return "application/json";
  return "text/plain";
}

function dedupeSources(
  current: SearchSource[] | undefined,
  next: SearchSource[]
): SearchSource[] {
  const seen = new Set<string>();
  const merged: SearchSource[] = [];

  for (const source of [...(current ?? []), ...next]) {
    const key = source.url || source.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }

  return merged;
}
