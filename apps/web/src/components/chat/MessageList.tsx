import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ChatMessage,
  Conversation,
  SearchSource
} from "@qianwen-agent/shared";
import { MessageBubble } from "./MessageBubble";

export function MessageList(props: {
  activeConversation?: Conversation;
  messages: ChatMessage[];
  onOpenSources: (sources: SearchSource[]) => void;
  resolveAttachmentUrl: (url: string) => string;
}) {
  const isEmpty = props.messages.length === 0;
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const initiallyScrolledConversationRef = useRef<string | undefined>(undefined);
  const messageLayoutKey = useMemo(
    () =>
      props.messages
        .map(
          (message) =>
            [
              message.id,
              message.status,
              message.content.length,
              message.reasoningContent?.length ?? 0,
              message.attachments?.length ?? 0,
              message.sources?.length ?? 0,
              message.activity ?? ""
            ].join(":")
        )
        .join("|"),
    [props.messages]
  );
  const messageVirtualizer = useVirtualizer({
    count: props.messages.length,
    estimateSize: () => 180,
    getItemKey: (index) => props.messages[index]?.id ?? index,
    getScrollElement: () => messageScrollRef.current,
    overscan: 5
  });
  const virtualMessages = messageVirtualizer.getVirtualItems();
  const conversationScrollKey =
    props.activeConversation?.id ?? props.messages[0]?.conversationId ?? "local";

  useEffect(() => {
    if (isEmpty) return;
    messageVirtualizer.measure();
  }, [isEmpty, messageLayoutKey, messageVirtualizer]);

  useLayoutEffect(() => {
    if (isEmpty || initiallyScrolledConversationRef.current === conversationScrollKey) {
      return;
    }

    initiallyScrolledConversationRef.current = conversationScrollKey;
    messageVirtualizer.scrollToIndex(props.messages.length - 1, {
      align: "end",
      behavior: "auto"
    });
  }, [conversationScrollKey, isEmpty, messageVirtualizer, props.messages.length]);

  return (
    <div className="messages" ref={messageScrollRef} aria-live="polite">
      {isEmpty ? (
        <div className="empty-state">
          <h1>你好，我是千问</h1>
        </div>
      ) : (
        <div
          className="virtual-message-list"
          style={{ height: `${messageVirtualizer.getTotalSize()}px` }}
        >
          {virtualMessages.map((virtualMessage) => {
            const message = props.messages[virtualMessage.index];

            if (!message) return null;

            return (
              <div
                className="virtual-message-row"
                data-index={virtualMessage.index}
                key={virtualMessage.key}
                ref={messageVirtualizer.measureElement}
                style={{
                  transform: `translateY(${virtualMessage.start}px)`
                }}
              >
                <MessageBubble
                  message={message}
                  onOpenSources={props.onOpenSources}
                  resolveAttachmentUrl={props.resolveAttachmentUrl}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
