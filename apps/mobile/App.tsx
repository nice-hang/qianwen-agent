import { useEffect, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { fetch as expoFetch } from "expo/fetch";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import {
  createApiClient,
  type AgentEvent,
  type ChatAttachment,
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
const MAX_UPLOAD_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_UPLOAD_FILE_BYTES = 12 * 1024 * 1024;
const SUPPORTED_FILE_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];
const UPLOAD_IMAGE_ATTEMPTS = [
  { maxEdge: 1600, quality: 0.72 },
  { maxEdge: 1280, quality: 0.62 },
  { maxEdge: 960, quality: 0.52 }
];

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [isSending, setIsSending] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<SearchSource[]>([]);
  const [error, setError] = useState<string>();
  const scrollRef = useRef<ScrollView>(null);

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
    setAttachments([]);
    setError(undefined);
    setIsSidebarOpen(false);
  }

  async function sendCurrentDraft() {
    const text = draft.trim();
    if ((!text && attachments.length === 0) || isSending) return;
    await sendMessage(text);
  }

  async function sendMessage(text: string) {
    const sentAttachments = attachments;
    const optimistic = createOptimisticMessages(
      text,
      activeConversationId,
      sentAttachments
    );
    const state: SendState = {
      conversationId: activeConversationId,
      assistantId: optimistic.assistant.id
    };

    setDraft("");
    setAttachments([]);
    setError(undefined);
    setIsSending(true);
    setMessages((current) => [...current, optimistic.user, optimistic.assistant]);

    try {
      await api.streamChat(
        {
          conversationId: activeConversationId,
          message: text,
          mode,
          attachmentIds: sentAttachments.map((attachment) => attachment.id)
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

  async function pickImage() {
    if (isSending) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("需要相册权限才能上传图片");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: Platform.OS === "ios",
        allowsMultipleSelection: false,
        base64: true,
        mediaTypes: ["images"],
        presentationStyle:
          Platform.OS === "ios"
            ? ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN
            : undefined,
        quality: 0.9
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        setError("图片读取失败，请重新选择");
        return;
      }

      const preparedImage = await prepareUploadImage(asset);
      const response = await api.uploadImage({
        fileName: asset.fileName ?? "image.jpg",
        mimeType: "image/jpeg",
        dataUrl: `data:image/jpeg;base64,${preparedImage.base64}`
      });

      setAttachments((current) => [...current, response.attachment]);
    } catch (cause) {
      setError(readError(cause));
    }
  }

  async function pickFile() {
    if (isSending) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: SUPPORTED_FILE_TYPES
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        setError("文件读取失败，请重新选择");
        return;
      }

      if (asset.size && asset.size > MAX_UPLOAD_FILE_BYTES) {
        setError("文件过大，请选择 12MB 以内的文件");
        return;
      }

      const fileName = asset.name || "document.txt";
      const mimeType = normalizeFileMimeType(fileName, asset.mimeType);
      if (!SUPPORTED_FILE_TYPES.includes(mimeType)) {
        setError("暂只支持 txt、md、csv、pdf、docx 文件");
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64
      });
      if (estimateBase64Bytes(base64) > MAX_UPLOAD_FILE_BYTES) {
        setError("文件过大，请选择 12MB 以内的文件");
        return;
      }

      const response = await api.uploadFile({
        conversationId: activeConversationId,
        fileName,
        mimeType,
        dataUrl: `data:${mimeType};base64,${base64}`
      });

      setAttachments((current) => [...current, response.attachment]);
    } catch (cause) {
      setError(readError(cause));
    }
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
              千问
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
            attachments={attachments}
            draft={draft}
            isSending={isSending}
            onChangeDraft={setDraft}
            onPickFile={() => void pickFile()}
            onPickImage={() => void pickImage()}
            onRemoveAttachment={(attachmentId) =>
              setAttachments((current) =>
                current.filter((attachment) => attachment.id !== attachmentId)
              )
            }
            onSend={() => void sendCurrentDraft()}
            resolveAttachmentUrl={resolveAttachmentUrl}
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

async function prepareUploadImage(asset: ImagePicker.ImagePickerAsset): Promise<{
  base64: string;
}> {
  for (const attempt of UPLOAD_IMAGE_ATTEMPTS) {
    const resize = buildResizeAction(asset.width, asset.height, attempt.maxEdge);
    const image = await manipulateAsync(asset.uri, resize ? [resize] : [], {
      base64: true,
      compress: attempt.quality,
      format: SaveFormat.JPEG
    });

    if (!image.base64) continue;
    if (estimateBase64Bytes(image.base64) <= MAX_UPLOAD_IMAGE_BYTES) {
      return {
        base64: image.base64
      };
    }
  }

  throw new Error("图片过大，请选择更小的图片");
}

function buildResizeAction(
  width: number | undefined,
  height: number | undefined,
  maxEdge: number
): { resize: { width?: number; height?: number } } | undefined {
  if (!width || !height) return { resize: { width: maxEdge } };
  if (width <= maxEdge && height <= maxEdge) return undefined;

  return width >= height
    ? { resize: { width: maxEdge } }
    : { resize: { height: maxEdge } };
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function normalizeFileMimeType(fileName: string, mimeType: string | undefined): string {
  if (mimeType && SUPPORTED_FILE_TYPES.includes(mimeType)) return mimeType;
  return mimeTypeFromFileName(fileName);
}

function mimeTypeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}
