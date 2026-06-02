import { memo, useEffect, useRef, useState } from "react";
import type {
  ChatAttachment,
  ChatMessage,
  SearchSource
} from "@qianwen-agent/shared";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer";

interface MessageBubbleProps {
  message: ChatMessage;
  onOpenSources: (sources: SearchSource[]) => void;
  resolveAttachmentUrl: (url: string) => string;
}

export const MessageBubble = memo(function MessageBubble(props: MessageBubbleProps) {
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
      {hasReasoning ? <ThinkingBlock message={message} /> : null}
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
});

export function FileAttachmentChip(props: { attachment: ChatAttachment }) {
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
