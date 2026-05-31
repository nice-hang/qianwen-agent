import { useEffect, useMemo, useRef, useState } from "react";
import { fetch as expoFetch } from "expo/fetch";
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import {
  createApiClient,
  type AgentEvent,
  type ChatMessage,
  type Conversation,
  type SearchSource
} from "@qianwen-agent/shared";
import { Composer } from "./src/components/Composer";
import { HomeSuggestions } from "./src/components/HomeSuggestions";
import { MessageBubble } from "./src/components/MessageBubble";
import { ModeBar } from "./src/components/ModeBar";
import { Sidebar } from "./src/components/Sidebar";
import { SourcesSheet } from "./src/components/SourcesSheet";
import { styles } from "./src/styles";
import {
  createOptimisticMessages,
  dedupeSources,
  readError,
  type OptimisticMessages,
  type SendState
} from "./src/utils/chat";

const api = createApiClient({
  baseUrl: getApiBaseUrl(),
  fetchImpl: expoFetch as typeof fetch
});

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [isSending, setIsSending] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<SearchSource[]>([]);
  const [error, setError] = useState<string>();
  const scrollRef = useRef<ScrollView>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [activeConversationId, conversations]
  );

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  async function loadConversations() {
    try {
      const response = await api.listConversations();
      setConversations(response.conversations);
      setActiveConversationId((current) => current ?? response.conversations[0]?.id);
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

  function startNewChat() {
    setActiveConversationId(undefined);
    setMessages([]);
    setError(undefined);
    setIsSidebarOpen(false);
  }

  async function sendCurrentDraft() {
    const text = draft.trim();
    if (!text || isSending) return;
    await sendMessage(text);
  }

  async function sendMessage(text: string) {
    const optimistic = createOptimisticMessages(text, activeConversationId);
    const state: SendState = {
      conversationId: activeConversationId,
      assistantId: optimistic.assistant.id
    };

    setDraft("");
    setError(undefined);
    setIsSending(true);
    setMessages((current) => [...current, optimistic.user, optimistic.assistant]);

    try {
      await api.streamChat(
        {
          conversationId: activeConversationId,
          message: text,
          mode
        },
        {
          onEvent: async (event) => {
            await applyStreamEvent(event, optimistic, state);
          }
        }
      );

      await loadConversations();
      if (state.conversationId) {
        setActiveConversationId(state.conversationId);
        await loadMessages(state.conversationId);
      }
    } catch (cause) {
      setError(readError(cause));
      updateMessage(optimistic.assistant.id, { status: "failed", activity: undefined });
    } finally {
      setIsSending(false);
    }
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
        activity: event.toolName === "web_fetch" ? "正在打开网页" : "搜索中"
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
      return;
    }

    if (event.type === "error") {
      if (event.conversationId) {
        state.conversationId = event.conversationId;
      }
      throw new Error(event.message);
    }
  }

  function appendAssistantText(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, content: message.content + text, activity: undefined }
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
              reasoningContent: `${message.reasoningContent ?? ""}${text}`,
              activity: message.activity ?? "问题分析中"
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

  function updateMessage(messageId: string, patch: Partial<ChatMessage>) {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, ...patch } : message))
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" onPress={() => setIsSidebarOpen(true)}>
              <Text style={styles.topIcon}>☰</Text>
            </Pressable>
            <Text numberOfLines={1} style={styles.title}>
              {activeConversation?.title ?? "千问"}
            </Text>
            <View style={styles.topSpacer} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={messages.length === 0 ? styles.emptyScroll : styles.chatScroll}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <HomeSuggestions onPick={(text) => void sendMessage(text)} />
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onOpenSources={setActiveSources}
                  resolveAttachmentUrl={resolveAttachmentUrl}
                />
              ))
            )}
          </ScrollView>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <ModeBar mode={mode} onModeChange={setMode} />
          <Composer
            draft={draft}
            isSending={isSending}
            onChangeDraft={setDraft}
            onSend={() => void sendCurrentDraft()}
          />
        </View>

        <Sidebar
          activeConversationId={activeConversationId}
          conversations={conversations}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onNewChat={startNewChat}
          onSelect={(conversationId) => {
            setActiveConversationId(conversationId);
            setIsSidebarOpen(false);
          }}
        />

        <SourcesSheet sources={activeSources} onClose={() => setActiveSources([])} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getApiBaseUrl(): string {
  return Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://localhost:3001";
}

function resolveAttachmentUrl(url: string): string {
  if (/^https?:\/\//u.test(url)) return url;
  return `${getApiBaseUrl()}${url}`;
}
