import {
  memo,
  useLayoutEffect,
  useRef
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Virtualizer } from "@tanstack/react-virtual";
import type {
  ChatMessage,
  Conversation,
  SearchSource
} from "@qianwen-agent/shared";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  activeConversation?: Conversation;
  isLoading: boolean;
  messages: ChatMessage[];
  onOpenSources: (sources: SearchSource[]) => void;
  resolveAttachmentUrl: (url: string) => string;
}

interface VirtualMessageListProps {
  conversationKey: string;
  messages: ChatMessage[];
  onOpenSources: (sources: SearchSource[]) => void;
  resolveAttachmentUrl: (url: string) => string;
}

export const MessageList = memo(function MessageList(props: MessageListProps) {
  const conversationKey =
    props.activeConversation?.id ?? props.messages[0]?.conversationId ?? "local";

  if (props.isLoading && props.messages.length === 0) {
    return (
      <div className="messages" aria-live="polite">
        <div className="message-loading">正在打开会话...</div>
      </div>
    );
  }

  if (props.messages.length === 0) {
    return (
      <div className="messages" aria-live="polite">
        <div className="empty-state">
          <h1>你好，我是千问</h1>
        </div>
      </div>
    );
  }

  return (
    <VirtualMessageList
      key={conversationKey}
      conversationKey={conversationKey}
      messages={props.messages}
      onOpenSources={props.onOpenSources}
      resolveAttachmentUrl={props.resolveAttachmentUrl}
    />
  );
});

function VirtualMessageList(props: VirtualMessageListProps) {
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const previousConversationKeyRef = useRef("");
  const previousMessageCountRef = useRef(0);
  const previousTailLayoutKeyRef = useRef("");
  const isNearBottomRef = useRef(true);
  const lastMessage = props.messages[props.messages.length - 1];
  const tailLayoutKey = lastMessage
    ? [
        lastMessage.id,
        lastMessage.status,
        lastMessage.content.length,
        lastMessage.reasoningContent?.length ?? 0,
        lastMessage.activity ?? ""
      ].join(":")
    : "";
  const messageVirtualizer = useVirtualizer({
    count: props.messages.length,
    estimateSize: () => 180,
    getItemKey: (index) => props.messages[index]?.id ?? index,
    getScrollElement: () => messageScrollRef.current,
    overscan: 8,
    initialOffset: () => Number.MAX_SAFE_INTEGER,
    useAnimationFrameWithResizeObserver: true,
    anchorTo: "end",
    followOnAppend: "auto",
    scrollEndThreshold: 120
  });
  const virtualMessages = messageVirtualizer.getVirtualItems();
  const totalSize = messageVirtualizer.getTotalSize();

  useLayoutEffect(() => {
    const scroller = messageScrollRef.current;
    if (!scroller) return;

    const openedConversation =
      props.conversationKey !== previousConversationKeyRef.current;
    const shouldScrollToBottom =
      openedConversation ||
      props.messages.length > previousMessageCountRef.current ||
      (tailLayoutKey !== previousTailLayoutKeyRef.current &&
        isNearBottomRef.current);

    if (!shouldScrollToBottom) {
      previousConversationKeyRef.current = props.conversationKey;
      previousMessageCountRef.current = props.messages.length;
      previousTailLayoutKeyRef.current = tailLayoutKey;
      return;
    }

    const cleanupScroll = scrollToEndAfterMeasurement(
      messageVirtualizer,
      props.messages.length - 1
    );
    const markDone = window.setTimeout(() => {
      previousConversationKeyRef.current = props.conversationKey;
      previousMessageCountRef.current = props.messages.length;
      previousTailLayoutKeyRef.current = tailLayoutKey;
    }, 420);

    return () => {
      cleanupScroll();
      window.clearTimeout(markDone);
    };
  }, [
    props.conversationKey,
    messageVirtualizer,
    props.messages.length,
    tailLayoutKey
  ]);

  function handleScroll() {
    const scroller = messageScrollRef.current;
    if (!scroller) return;

    isNearBottomRef.current =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  }

  return (
    <div
      className="messages"
      ref={messageScrollRef}
      aria-live="polite"
      onScroll={handleScroll}
    >
      <div
        className="virtual-message-list"
        style={{ height: `${totalSize}px` }}
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
    </div>
  );
}

function scrollToEndAfterMeasurement(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  lastIndex: number
) {
  const scrollToLastMessage = () => {
    virtualizer.scrollToIndex(lastIndex, {
      align: "end",
      behavior: "auto"
    });
  };

  scrollToLastMessage();

  const frame = requestAnimationFrame(() => {
    scrollToLastMessage();
    requestAnimationFrame(scrollToLastMessage);
  });
  const timeouts = [80, 180, 360].map((delay) =>
    window.setTimeout(scrollToLastMessage, delay)
  );

  return () => {
    cancelAnimationFrame(frame);
    for (const timeout of timeouts) window.clearTimeout(timeout);
  };
}
