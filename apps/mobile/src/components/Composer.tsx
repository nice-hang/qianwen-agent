import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { ChatAttachment } from "@qianwen-agent/shared";
import { AttachmentChip } from "./AttachmentChip";
import { styles } from "../styles";

interface ComposerProps {
  attachments: ChatAttachment[];
  draft: string;
  isSending: boolean;
  onChangeDraft: (draft: string) => void;
  onPickFile: () => void;
  onPickImage: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSend: () => void;
  resolveAttachmentUrl: (url: string) => string;
}

export function Composer(props: ComposerProps) {
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const canSend = Boolean(props.draft.trim() || props.attachments.length > 0);
  const toggleUploadMenu = () => {
    if (!props.isSending) setIsUploadMenuOpen((current) => !current);
  };
  const pickImage = () => {
    setIsUploadMenuOpen(false);
    props.onPickImage();
  };
  const pickFile = () => {
    setIsUploadMenuOpen(false);
    props.onPickFile();
  };

  return (
    <View style={styles.composerWrap}>
      {props.attachments.length > 0 ? (
        <View style={styles.attachmentStrip}>
          {props.attachments.map((attachment) => (
            <AttachmentChip
              attachment={attachment}
              compact
              key={attachment.id}
              onRemove={props.onRemoveAttachment}
              resolveAttachmentUrl={props.resolveAttachmentUrl}
            />
          ))}
        </View>
      ) : null}
      {isUploadMenuOpen ? (
        <View style={styles.uploadMenu}>
          <Pressable
            accessibilityRole="button"
            disabled={props.isSending}
            onPress={pickImage}
            style={styles.uploadMenuItem}
          >
            <Text style={styles.uploadMenuIcon}>图</Text>
            <Text style={styles.uploadMenuText}>上传图片</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={props.isSending}
            onPress={pickFile}
            style={styles.uploadMenuItem}
          >
            <Text style={styles.uploadMenuIcon}>文</Text>
            <Text style={styles.uploadMenuText}>上传文件</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          disabled={props.isSending}
          onPress={toggleUploadMenu}
          style={styles.imagePickButton}
        >
          <Text style={styles.imagePickText}>+</Text>
        </Pressable>
        <TextInput
          multiline
          onChangeText={props.onChangeDraft}
          placeholder="发消息、图片或文件..."
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
