import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { SearchSource } from "@qianwen-agent/shared";
import { styles } from "../styles";

interface SourcesSheetProps {
  sources: SearchSource[];
  onClose: () => void;
}

export function SourcesSheet(props: SourcesSheetProps) {
  return (
    <Modal animationType="slide" transparent visible={props.sources.length > 0} onRequestClose={props.onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={props.onClose}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>参考资料</Text>
          <ScrollView>
            {props.sources.map((source) => (
              <View key={source.id} style={styles.sourceItem}>
                <Text style={styles.sourceTitle}>{source.title}</Text>
                <Text style={styles.sourceMeta}>{source.siteName ?? source.url}</Text>
                {source.snippet ? <Text style={styles.sourceSnippet}>{source.snippet}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

