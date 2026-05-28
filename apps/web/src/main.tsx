import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createApiClient,
  type ChatMessage,
  type Conversation
} from "@qianwen-agent/shared";
import "./styles.css";

const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001"
});

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
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

  async function loadConversations() {
    try {
      const response = await api.listConversations();
      setConversations(response.conversations);
      setActiveConversationId((current) => {
        if (current) return current;
        return response.conversations[0]?.id;
      });
    } catch (cause) {
      setError(readError(cause));
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const response = await api.listMessages(conversationId);
      setMessages(response.messages);
    } catch (cause) {
      setError(readError(cause));
    }
  }

  async function startNewChat() {
    setActiveConversationId(undefined);
    setMessages([]);
    setError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;

    // 先乐观展示用户消息，真实记录由服务端创建并保存。
    const optimisticUser: ChatMessage = {
      id: `local-user-${Date.now()}`,
      conversationId: activeConversationId ?? "local",
      role: "user",
      status: "completed",
      content: text,
      createdAt: new Date().toISOString()
    };
    const optimisticAssistant: ChatMessage = {
      id: `local-assistant-${Date.now()}`,
      conversationId: activeConversationId ?? "local",
      role: "assistant",
      status: "streaming",
      content: "",
      createdAt: new Date().toISOString()
    };

    setDraft("");
    setError(undefined);
    setIsSending(true);
    setMessages((current) => [...current, optimisticUser, optimisticAssistant]);

    try {
      let nextConversationId = activeConversationId;
      let finalAssistantId = optimisticAssistant.id;

      // 消费 shared AgentEvent 流，把增量内容合并进乐观 assistant 气泡。
      for await (const streamEvent of api.streamChat({
        conversationId: activeConversationId,
        message: text
      })) {
        if (streamEvent.type === "answer_delta") {
          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticAssistant.id
                ? { ...message, content: message.content + streamEvent.text }
                : message
            )
          );
        }

        if (streamEvent.type === "done") {
          // 用服务端持久化后的 assistant message id 替换本地临时 id。
          nextConversationId = streamEvent.conversationId ?? nextConversationId;
          finalAssistantId = streamEvent.messageId ?? finalAssistantId;
          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticAssistant.id
                ? {
                    ...message,
                    id: streamEvent.messageId ?? message.id,
                    conversationId: nextConversationId ?? message.conversationId,
                    status: "completed"
                  }
                : message.id === optimisticUser.id
                  ? {
                      ...message,
                      conversationId: nextConversationId ?? message.conversationId
                    }
                  : message
            )
          );
        }

        if (streamEvent.type === "error") {
          // provider 失败前，服务端可能已经保存了用户消息。
          if (streamEvent.conversationId) {
            nextConversationId = streamEvent.conversationId;
            await loadConversations();
            setActiveConversationId(streamEvent.conversationId);
            await loadMessages(streamEvent.conversationId);
          }
          throw new Error(streamEvent.message);
        }
      }

      await loadConversations();
      if (nextConversationId) {
        setActiveConversationId(nextConversationId);
        await loadMessages(nextConversationId);
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === finalAssistantId
              ? { ...message, status: "completed" }
              : message
          )
        );
      }
    } catch (cause) {
      setError(readError(cause));
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticAssistant.id
            ? { ...message, status: "failed" }
            : message
        )
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>Qianwen</span>
          <strong>Chatbox</strong>
        </div>
        <button className="new-chat" type="button" onClick={startNewChat}>
          New chat
        </button>
        <nav className="conversation-list" aria-label="Conversations">
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
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <p>Stage 1</p>
            <h1>{activeConversation?.title ?? "New chat"}</h1>
          </div>
          <span>{isSending ? "Streaming" : "Ready"}</span>
        </header>

        <div className="messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <h2>Ask something to start a conversation.</h2>
              <p>Text chat, streaming output, and local history are wired end to end.</p>
            </div>
          ) : (
            messages.map((message) => (
              <article className={`bubble ${message.role}`} key={message.id}>
                <span>{message.role}</span>
                <p>{message.content || (message.status === "streaming" ? "..." : "")}</p>
              </article>
            ))
          )}
        </div>

        {error ? <div className="error">{error}</div> : null}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Message Qianwen Agent"
            rows={3}
          />
          <button type="submit" disabled={isSending || !draft.trim()}>
            Send
          </button>
        </form>
      </section>
    </main>
  );
}

function readError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Something went wrong.";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
