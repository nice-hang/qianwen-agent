import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { styles } from "../styles";

interface ComposerProps {
  draft: string;
  isSending: boolean;
  onChangeDraft: (draft: string) => void;
  onSend: () => void;
}

export function Composer(props: ComposerProps) {
  return (
    <View style={styles.composerWrap}>
      <View style={styles.composer}>
        <Text style={styles.voiceIcon}>◉</Text>
        <TextInput
          multiline
          onChangeText={props.onChangeDraft}
          placeholder="发消息或按住说话..."
          placeholderTextColor="#a5a5a5"
          style={styles.input}
          value={props.draft}
        />
        <Pressable
          accessibilityRole="button"
          disabled={props.isSending || !props.draft.trim()}
          style={[styles.sendButton, (!props.draft.trim() || props.isSending) && styles.sendButtonDisabled]}
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

