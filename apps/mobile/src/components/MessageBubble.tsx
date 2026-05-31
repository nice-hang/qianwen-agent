import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { ChatMessage, SearchSource } from "@qianwen-agent/shared";
import { MarkdownText } from "../markdown/MarkdownText";
import { styles } from "../styles";

interface MessageBubbleProps {
  message: ChatMessage;
  onOpenSources: (sources: SearchSource[]) => void;
  resolveAttachmentUrl: (url: string) => string;
}

export function MessageBubble(props: MessageBubbleProps) {
  const isUser = props.message.role === "user";
  const isAnswering = Boolean(props.message.content);
  const hasReasoningContent = Boolean(props.message.reasoningContent);
  const hasSources = Boolean(props.message.sources?.length);
  const [isThinkingOpen, setIsThinkingOpen] = useState(!isAnswering);

  useEffect(() => {
    setIsThinkingOpen(!isAnswering);
  }, [isAnswering]);

  if (isUser) {
    return (
      <View style={styles.userRow}>
        {props.message.attachments?.length ? (
          <View style={styles.messageImageGrid}>
            {props.message.attachments.map((attachment) => (
              <Image
                key={attachment.id}
                source={{ uri: props.resolveAttachmentUrl(attachment.url) }}
                style={styles.messageImage}
              />
            ))}
          </View>
        ) : null}
        {props.message.content ? (
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{props.message.content}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      {props.message.attachments?.length ? (
        <View style={styles.messageImageGrid}>
          {props.message.attachments.map((attachment) => (
            <Image
              key={attachment.id}
              source={{ uri: props.resolveAttachmentUrl(attachment.url) }}
              style={styles.messageImage}
            />
          ))}
        </View>
      ) : null}

      {props.message.activity && !hasReasoningContent && !hasSources ? (
        <View style={styles.thinkingPill}>
          <Text style={styles.dots}>•••</Text>
          <Text style={styles.thinkingPillText}>
            {props.message.activity === "正在生成" ? "问题分析中" : props.message.activity}
          </Text>
        </View>
      ) : null}

      {props.message.activity || props.message.reasoningContent ? (
        hasReasoningContent || hasSources ? (
        <View style={styles.thinkingCard}>
          <Pressable
            accessibilityRole="button"
            disabled={!props.message.reasoningContent}
            onPress={() => setIsThinkingOpen((current) => !current)}
            style={styles.thinkingTitleRow}
          >
            <Text style={styles.thinkingTitle}>
              {props.message.activity ?? (props.message.content ? "深度思考已完成" : "问题分析中")}
            </Text>
            {hasReasoningContent ? (
              <Text style={styles.thinkingArrow}>{isThinkingOpen ? "⌄" : "›"}</Text>
            ) : null}
          </Pressable>
          {hasReasoningContent ? (
            isThinkingOpen ? (
              <MarkdownText content={props.message.reasoningContent ?? ""} variant="thinking" />
            ) : null
          ) : (
            <Text style={styles.dots}>•••</Text>
          )}
          {props.message.sources?.length ? (
            <Pressable
              style={styles.sourcesChip}
              onPress={() => props.onOpenSources(props.message.sources ?? [])}
            >
              <Text style={styles.sourcesChipText}>参考了 {props.message.sources.length} 篇资料 ›</Text>
            </Pressable>
          ) : null}
        </View>
        ) : null
      ) : null}

      {props.message.content ? (
        <View style={styles.answerBlock}>
          <MarkdownText content={props.message.content} variant="answer" />
        </View>
      ) : null}
    </View>
  );
}
