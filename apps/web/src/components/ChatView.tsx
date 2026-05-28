import type { FormEvent } from "react";
import type { ChatMessage, Conversation } from "@qianwen-agent/shared";

interface ChatViewProps {
  activeConversation?: Conversation;
  draft: string;
  error?: string;
  isSending: boolean;
  messages: ChatMessage[];
  mode: "fast" | "deep";
  onDraftChange: (draft: string) => void;
  onModeChange: (mode: "fast" | "deep") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onThinkingBudgetChange: (budget: number) => void;
  thinkingBudget: number;
}

export function ChatView(props: ChatViewProps) {
  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div>
          <p>Stage 2</p>
          <h1>{props.activeConversation?.title ?? "New chat"}</h1>
        </div>
        <span>{props.isSending ? "Streaming" : "Ready"}</span>
      </header>

      <div className="messages" aria-live="polite">
        {props.messages.length === 0 ? (
          <div className="empty-state">
            <h2>Ask something to start a conversation.</h2>
            <p>
              Text chat, streaming output, local history, and run trace are
              wired end to end.
            </p>
          </div>
        ) : (
          props.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </div>

      {props.error ? <div className="error">{props.error}</div> : null}

      <form className="composer" onSubmit={props.onSubmit}>
        <div className="composer-controls">
          <div className="mode-switch" aria-label="Chat mode">
            <button
              className={props.mode === "fast" ? "active" : undefined}
              type="button"
              onClick={() => props.onModeChange("fast")}
            >
              Fast
            </button>
            <button
              className={props.mode === "deep" ? "active" : undefined}
              type="button"
              onClick={() => props.onModeChange("deep")}
            >
              Deep
            </button>
          </div>
          {props.mode === "deep" ? (
            <label className="thinking-budget">
              <span>Budget</span>
              <input
                min={1}
                step={50}
                type="number"
                value={props.thinkingBudget}
                onChange={(event) =>
                  props.onThinkingBudgetChange(Number(event.target.value))
                }
              />
            </label>
          ) : null}
        </div>
        <textarea
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.target.value)}
          placeholder="Message Qianwen Agent"
          rows={3}
        />
        <button type="submit" disabled={props.isSending || !props.draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

function MessageBubble(props: { message: ChatMessage }) {
  const { message } = props;

  return (
    <article className={`bubble ${message.role}`}>
      <span>{message.role}</span>
      {message.reasoningContent ? (
        <div className="thinking-block">
          <strong>Thinking</strong>
          <p>{message.reasoningContent}</p>
        </div>
      ) : null}
      <p>{message.content || (message.status === "streaming" ? "..." : "")}</p>
    </article>
  );
}
