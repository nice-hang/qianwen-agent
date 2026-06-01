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
  onFileSelected: (file: File) => void;
  onImageSelected: (file: File) => void;
  onModeChange: (mode: "fast" | "deep") => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resolveAttachmentUrl: (url: string) => string;
}

export function ChatView(props: ChatViewProps) {
  const isEmpty = props.messages.length === 0;
  const [isUploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [sourceDrawer, setSourceDrawer] = useState<{
    title: string;
    sources: SearchSource[];
  }>();

  return (
    <section className={isEmpty ? "chat-panel empty" : "chat-panel"}>
      <header className="chat-header">
        <div className="model-select">Qwen3.6 - 千问</div>
      </header>

      <div className="messages" aria-live="polite">
        {props.messages.length === 0 ? (
          <div className="empty-state">
            <h1>你好，我是千问</h1>
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
          resolveUrl={props.resolveAttachmentUrl}
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
            <div className="upload-menu-wrap">
              {isUploadMenuOpen ? (
                <div className="upload-menu" role="menu">
                  <label className="upload-menu-item" role="menuitem">
                    <input
                      accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      type="file"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        setUploadMenuOpen(false);
                        if (file) props.onFileSelected(file);
                      }}
                    />
                    <DocumentUploadIcon />
                    <span>上传文档</span>
                  </label>
                  <label className="upload-menu-item" role="menuitem">
                    <input
                      accept="image/*"
                      type="file"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        setUploadMenuOpen(false);
                        if (file) props.onImageSelected(file);
                      }}
                    />
                    <ImageUploadIcon />
                    <span>上传图片</span>
                  </label>
                </div>
              ) : null}
              <button
                className={isUploadMenuOpen ? "upload-trigger active" : "upload-trigger"}
                type="button"
                aria-label="打开上传菜单"
                aria-expanded={isUploadMenuOpen}
                onClick={() => setUploadMenuOpen((value) => !value)}
              >
                {isUploadMenuOpen ? <CloseIcon /> : <PlusIcon />}
              </button>
            </div>
            <button
              className={props.mode === "deep" ? "thinking-mode active" : "thinking-mode"}
              type="button"
              aria-pressed={props.mode === "deep"}
              onClick={() =>
                props.onModeChange(props.mode === "deep" ? "fast" : "deep")
              }
            >
              <ThinkingModeIcon />
              <span>思考</span>
            </button>
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
          {attachment.mimeType.startsWith("image/") ? (
            <img
              alt={attachment.fileName}
              src={props.resolveAttachmentUrl(attachment.url)}
            />
          ) : (
            <FileAttachmentChip attachment={attachment} />
          )}
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
        <div className="message-attachment" key={attachment.id}>
          {attachment.mimeType.startsWith("image/") ? (
            <img
              alt={attachment.fileName}
              src={props.resolveAttachmentUrl(attachment.url)}
            />
          ) : (
            <FileAttachmentChip attachment={attachment} />
          )}
        </div>
      ))}
    </div>
  );
}

function FileAttachmentChip(props: { attachment: ChatAttachment }) {
  const statusText =
    props.attachment.parseStatus === "error"
      ? "解析失败"
      : props.attachment.parseStatus === "parsing"
        ? "解析中"
        : props.attachment.parseStatus === "ready"
          ? `${props.attachment.chunkCount ?? 0} 段`
          : "待解析";

  return (
    <div className="file-attachment-chip">
      <span className="file-icon" aria-hidden="true">
        文
      </span>
      <span className="file-main">
        <strong>{props.attachment.fileName}</strong>
        <span>{statusText}</span>
      </span>
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

function PlusIcon() {
  return (
    <svg className="upload-trigger-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 4.5v11M4.5 10h11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="upload-trigger-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="m5.75 5.75 8.5 8.5m0-8.5-8.5 8.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DocumentUploadIcon() {
  return (
    <svg
      className="upload-menu-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.75 2.75h5.1l3.4 3.4v3.35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M10.75 2.75v3.4h3.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M8.4 16.75H5.75a1.6 1.6 0 0 1-1.6-1.6V4.35a1.6 1.6 0 0 1 1.6-1.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M14.75 17.25v-6.5m0 0 2.35 2.35m-2.35-2.35-2.35 2.35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ImageUploadIcon() {
  return (
    <svg
      className="upload-menu-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.25 13.65V5.3A2.05 2.05 0 0 1 5.3 3.25h7.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M3.45 13.15 7.1 9.55a1.25 1.25 0 0 1 1.75 0l1.35 1.35.7-.7a1.25 1.25 0 0 1 1.75 0l2 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M8.6 16.75H5.3a2.05 2.05 0 0 1-2.05-2.05"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M14.75 8.65v-5.9m0 0 2.1 2.1m-2.1-2.1-2.1 2.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ThinkingModeIcon() {
  return (
    <svg
      className="thinking-mode-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9.7 2.9 8.15 7.2 3.85 8.75l4.3 1.55 1.55 4.3 1.55-4.3 4.3-1.55-4.3-1.55L9.7 2.9Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="m15.45 12.2-.55 1.5-1.5.55 1.5.55.55 1.5.55-1.5 1.5-.55-1.5-.55-.55-1.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function SourceDrawer(props: {
  title: string;
  sources: SearchSource[];
  onClose: () => void;
  resolveUrl: (url: string) => string;
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
            href={props.resolveUrl(source.url)}
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
