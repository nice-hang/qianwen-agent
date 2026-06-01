import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import type { ChatAttachment } from "@qianwen-agent/shared";
import { styles } from "../styles";

interface ComposerProps {
  attachments: ChatAttachment[];
  draft: string;
  isSending: boolean;
  onChangeDraft: (draft: string) => void;
  onPickImage: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSend: () => void;
  resolveAttachmentUrl: (url: string) => string;
}

export function Composer(props: ComposerProps) {
  const canSend = Boolean(props.draft.trim() || props.attachments.length > 0);

  return (
    <View style={styles.composerWrap}>
      {props.attachments.length > 0 ? (
        <View style={styles.attachmentStrip}>
          {props.attachments.map((attachment) => (
            <View key={attachment.id} style={styles.attachmentPreview}>
              <Image
                source={{ uri: props.resolveAttachmentUrl(attachment.url) }}
                style={styles.attachmentPreviewImage}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => props.onRemoveAttachment(attachment.id)}
                style={styles.attachmentRemoveButton}
              >
                <Text style={styles.attachmentRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          disabled={props.isSending}
          onPress={props.onPickImage}
          style={styles.imagePickButton}
        >
          <Text style={styles.imagePickText}>＋</Text>
        </Pressable>
        <TextInput
          multiline
          onChangeText={props.onChangeDraft}
          placeholder="发消息或选择图片..."
          placeholderTextColor="#a5a5a5"
          style={styles.input}
          value={props.draft}
        />
        <Pressable
          accessibilityRole="button"
          disabled={props.isSending || !canSend}
          style={[styles.sendButton, (!canSend || props.isSending) && styles.sendButtonDisabled]}
          onPress={props.onSend}
        >
          {props.isSending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.sendText}>↑</Text>
          )}
        </Pressable>
      </View>
      <Text style={styles.disclaimer}>内容由 AI 生成</Text>
    </View>
  );
}
