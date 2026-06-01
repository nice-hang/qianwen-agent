import { Image, Pressable, Text, View } from "react-native";
import type { ChatAttachment } from "@qianwen-agent/shared";
import { styles } from "../styles";

interface AttachmentChipProps {
  attachment: ChatAttachment;
  compact?: boolean;
  onRemove?: (attachmentId: string) => void;
  resolveAttachmentUrl: (url: string) => string;
}

export function AttachmentChip(props: AttachmentChipProps) {
  if (isImageAttachment(props.attachment)) {
    return (
      <View style={props.compact ? styles.attachmentPreview : undefined}>
        <Image
          source={{ uri: props.resolveAttachmentUrl(props.attachment.url) }}
          style={props.compact ? styles.attachmentPreviewImage : styles.messageImage}
        />
        {props.onRemove ? (
          <RemoveButton
            attachmentId={props.attachment.id}
            onRemove={props.onRemove}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={props.compact ? styles.filePreviewChip : styles.messageFileChip}>
      <View style={styles.fileIcon}>
        <Text style={styles.fileIconText}>文</Text>
      </View>
      <View style={styles.fileTextBlock}>
        <Text numberOfLines={1} style={styles.fileName}>
          {props.attachment.fileName}
        </Text>
        <Text numberOfLines={1} style={styles.fileMeta}>
          {fileStatusText(props.attachment)}
        </Text>
      </View>
      {props.onRemove ? (
        <RemoveButton attachmentId={props.attachment.id} onRemove={props.onRemove} />
      ) : null}
    </View>
  );
}

function RemoveButton(props: {
  attachmentId: string;
  onRemove: (attachmentId: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => props.onRemove(props.attachmentId)}
      style={styles.attachmentRemoveButton}
    >
      <Text style={styles.attachmentRemoveText}>x</Text>
    </Pressable>
  );
}

function isImageAttachment(attachment: ChatAttachment): boolean {
  return attachment.kind === "image" || attachment.mimeType.startsWith("image/");
}

function fileStatusText(attachment: ChatAttachment): string {
  if (attachment.parseStatus === "error") return "解析失败";
  if (attachment.parseStatus === "parsing") return "解析中";
  if (attachment.parseStatus === "ready") return `${attachment.chunkCount ?? 0} 段`;
  return "待解析";
}
