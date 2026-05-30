import { useState, type FormEvent } from "react";
import type { ChatMessage, Conversation } from "@qianwen-agent/shared";
import { MarkdownRenderer } from "./markdown/MarkdownRenderer";
import "./ChatView.css";

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
}

export function ChatView(props: ChatViewProps) {
  const isEmpty = props.messages.length === 0;

  return (
    <section className={isEmpty ? "chat-panel empty" : "chat-panel"}>
      <header className="chat-header">
        <div className="model-select">Qwen3.6 - 千问</div>
        <span className={props.isSending ? "status streaming" : "status"}>
          {props.isSending ? "正在回答" : "就绪"}
        </span>
      </header>

      <div className="messages" aria-live="polite">
        {props.messages.length === 0 ? (
          <div className="empty-state">
            <h1>有什么可以帮忙的？</h1>
            <p>支持多轮对话、流式回答和深度思考。</p>
          </div>
        ) : (
          props.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </div>

      {props.error ? <div className="error">{props.error}</div> : null}

      <form className="composer" onSubmit={props.onSubmit}>
        <textarea
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.target.value)}
          placeholder="向千问提问"
          rows={3}
        />
        <div className="composer-footer">
          <div className="composer-controls">
            <div className="mode-switch" aria-label="Chat mode">
              <button
                className={props.mode === "fast" ? "active" : undefined}
                type="button"
                onClick={() => props.onModeChange("fast")}
              >
                快速
              </button>
              <button
                className={props.mode === "deep" ? "active" : undefined}
                type="button"
                onClick={() => props.onModeChange("deep")}
              >
                思考
              </button>
            </div>
          </div>
          <button
            className="send-button"
            type="submit"
            disabled={props.isSending || !props.draft.trim()}
            aria-label="Send message"
          >
            ↑
          </button>
        </div>
      </form>
    </section>
  );
}

function MessageBubble(props: { message: ChatMessage }) {
  const { message } = props;

  return (
    <article className={`bubble ${message.role}`}>
      {message.reasoningContent ? (
        <ThinkingBlock message={message} />
      ) : null}
      {message.content ? (
        <MarkdownRenderer content={message.content} />
      ) : (
        <p>{message.status === "streaming" ? "正在生成..." : ""}</p>
      )}
    </article>
  );
}

function ThinkingBlock(props: { message: ChatMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isStreaming = props.message.status === "streaming";

  return (
    <div className="thinking-block">
      <button
        className="thinking-toggle"
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((value) => !value)}
      >
        <span>{isStreaming ? "正在深度思考" : "深度思考已完成"}</span>
        <span
          className={isExpanded ? "thinking-chevron expanded" : "thinking-chevron"}
          aria-hidden="true"
        >
          {isExpanded ? "⌄" : "›"}
        </span>
      </button>

      {isExpanded ? (
        <div className="thinking-content">
          <MarkdownRenderer content={props.message.reasoningContent ?? ""} />
        </div>
      ) : null}
    </div>
  );
}
