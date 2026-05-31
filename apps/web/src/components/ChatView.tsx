import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react";
import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  SearchSource
} from "@qianwen-agent/shared";
import { MarkdownRenderer } from "./markdown/MarkdownRenderer";
import "./ChatView.css";

interface ChatViewProps {
  activeConversation?: Conversation;
  draft: string;
  error?: string;
  isSending: boolean;
  messages: ChatMessage[];
  mode: "fast" | "deep";
  selectedAttachments: ChatAttachment[];
  onDraftChange: (draft: string) => void;
  onImageSelected: (file: File) => void;
  onModeChange: (mode: "fast" | "deep") => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resolveAttachmentUrl: (url: string) => string;
}

export function ChatView(props: ChatViewProps) {
  const isEmpty = props.messages.length === 0;
  const [sourceDrawer, setSourceDrawer] = useState<{
    title: string;
    sources: SearchSource[];
  }>();

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
            <MessageBubble
              key={message.id}
              message={message}
              onOpenSources={(sources) =>
                setSourceDrawer({
                  title: `参考了 ${sources.length} 篇结果`,
                  sources
                })
              }
              resolveAttachmentUrl={props.resolveAttachmentUrl}
            />
          ))
        )}
      </div>

      {sourceDrawer ? (
        <SourceDrawer
          sources={sourceDrawer.sources}
          title={sourceDrawer.title}
          onClose={() => setSourceDrawer(undefined)}
        />
      ) : null}

      {props.error ? <div className="error">{props.error}</div> : null}

      <form className="composer" onSubmit={props.onSubmit}>
        {props.selectedAttachments.length > 0 ? (
          <AttachmentPreviewStrip
            attachments={props.selectedAttachments}
            onRemove={props.onRemoveAttachment}
            resolveAttachmentUrl={props.resolveAttachmentUrl}
          />
        ) : null}
        <textarea
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="向千问提问"
          rows={3}
        />
        <div className="composer-footer">
          <div className="composer-controls">
            <label className="image-upload-button" title="上传图片">
              <input
                accept="image/*"
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) props.onImageSelected(file);
                }}
              />
              <span aria-hidden="true">＋</span>
            </label>
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
            disabled={
              props.isSending ||
              (!props.draft.trim() && props.selectedAttachments.length === 0)
            }
            aria-label="Send message"
          >
            ↑
          </button>
        </div>
      </form>
    </section>
  );

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function MessageBubble(props: {
  message: ChatMessage;
  onOpenSources: (sources: SearchSource[]) => void;
  resolveAttachmentUrl: (url: string) => string;
}) {
  const { message } = props;
  const sources = message.sources ?? [];
  const hasReasoning = Boolean(message.reasoningContent);
  const placeholder =
    message.status === "streaming" && !hasReasoning
      ? message.activity ?? "正在生成..."
      : "";

  return (
    <article className={`bubble ${message.role}`}>
      {message.attachments?.length ? (
        <MessageAttachments
          attachments={message.attachments}
          resolveAttachmentUrl={props.resolveAttachmentUrl}
        />
      ) : null}
      {hasReasoning ? (
        <ThinkingBlock message={message} />
      ) : null}
      {message.content ? (
        <MarkdownRenderer content={message.content} />
      ) : placeholder ? (
        <p>{placeholder}</p>
      ) : null}
      {message.role === "assistant" && sources.length > 0 ? (
        <button
          className="source-chip"
          type="button"
          onClick={() => props.onOpenSources(sources)}
        >
          <span>参考了 {sources.length} 篇结果</span>
          <span aria-hidden="true">›</span>
        </button>
      ) : null}
    </article>
  );
}

function AttachmentPreviewStrip(props: {
  attachments: ChatAttachment[];
  onRemove: (attachmentId: string) => void;
  resolveAttachmentUrl: (url: string) => string;
}) {
  return (
    <div className="attachment-preview-strip">
      {props.attachments.map((attachment) => (
        <div className="attachment-preview" key={attachment.id}>
          <img
            alt={attachment.fileName}
            src={props.resolveAttachmentUrl(attachment.url)}
          />
          <button
            type="button"
            onClick={() => props.onRemove(attachment.id)}
            aria-label={`移除 ${attachment.fileName}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function MessageAttachments(props: {
  attachments: ChatAttachment[];
  resolveAttachmentUrl: (url: string) => string;
}) {
  return (
    <div className="message-attachments">
      {props.attachments.map((attachment) => (
        <img
          alt={attachment.fileName}
          key={attachment.id}
          src={props.resolveAttachmentUrl(attachment.url)}
        />
      ))}
    </div>
  );
}

function ThinkingBlock(props: { message: ChatMessage }) {
  const isStreaming = props.message.status === "streaming";
  const isAnswering = props.message.content.length > 0;
  const shouldAutoExpand = isStreaming && !isAnswering;
  const [isExpanded, setIsExpanded] = useState(shouldAutoExpand);
  const userToggledRef = useRef(false);

  useEffect(() => {
    if (userToggledRef.current) return;
    setIsExpanded(shouldAutoExpand);
  }, [shouldAutoExpand]);

  function toggleThinking() {
    userToggledRef.current = true;
    setIsExpanded((value) => !value);
  }

  return (
    <div className="thinking-block">
      <button
        className="thinking-toggle"
        type="button"
        aria-expanded={isExpanded}
        onClick={toggleThinking}
      >
        <span>{isStreaming ? "正在思考中" : "深度思考已完成"}</span>
        <span
          className={isExpanded ? "thinking-chevron expanded" : "thinking-chevron"}
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      <div
        className={isExpanded ? "thinking-content expanded" : "thinking-content"}
      >
        <div className="thinking-content-inner">
          <MarkdownRenderer content={props.message.reasoningContent ?? ""} />
        </div>
      </div>
    </div>
  );
}

function SourceDrawer(props: {
  title: string;
  sources: SearchSource[];
  onClose: () => void;
}) {
  return (
    <aside className="source-drawer" aria-label="Search sources">
      <div className="source-drawer-header">
        <strong>{props.title}</strong>
        <button type="button" onClick={props.onClose} aria-label="Close sources">
          ×
        </button>
      </div>
      <div className="source-list">
        {props.sources.map((source, index) => (
          <a
            className="source-item"
            href={source.url}
            key={`${source.url}-${index}`}
            rel="noreferrer"
            target="_blank"
          >
            <span className="source-index">{index + 1}</span>
            <span className="source-main">
              <strong>{source.title}</strong>
              <span>{source.siteName ?? source.url}</span>
              {source.snippet ? <p>{source.snippet}</p> : null}
            </span>
          </a>
        ))}
      </div>
    </aside>
  );
}
