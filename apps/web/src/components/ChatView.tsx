import { useState, type FormEvent } from "react";
import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  SearchSource
} from "@qianwen-agent/shared";
import { Composer } from "./chat/Composer";
import { MessageList } from "./chat/MessageList";
import { SourceDrawer } from "./chat/SourceDrawer";
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
  const [sourceDrawer, setSourceDrawer] = useState<{
    title: string;
    sources: SearchSource[];
  }>();

  return (
    <section className={isEmpty ? "chat-panel empty" : "chat-panel"}>
      <header className="chat-header">
        <div className="model-select">Qwen3.6 - 千问</div>
      </header>

      <MessageList
        activeConversation={props.activeConversation}
        messages={props.messages}
        onOpenSources={(sources) =>
          setSourceDrawer({
            title: `参考了 ${sources.length} 篇结果`,
            sources
          })
        }
        resolveAttachmentUrl={props.resolveAttachmentUrl}
      />

      {sourceDrawer ? (
        <SourceDrawer
          sources={sourceDrawer.sources}
          title={sourceDrawer.title}
          onClose={() => setSourceDrawer(undefined)}
          resolveUrl={props.resolveAttachmentUrl}
        />
      ) : null}

      {props.error ? <div className="error">{props.error}</div> : null}

      <Composer
        draft={props.draft}
        isSending={props.isSending}
        mode={props.mode}
        onDraftChange={props.onDraftChange}
        onFileSelected={props.onFileSelected}
        onImageSelected={props.onImageSelected}
        onModeChange={props.onModeChange}
        onRemoveAttachment={props.onRemoveAttachment}
        onSubmit={props.onSubmit}
        resolveAttachmentUrl={props.resolveAttachmentUrl}
        selectedAttachments={props.selectedAttachments}
      />
    </section>
  );
}
