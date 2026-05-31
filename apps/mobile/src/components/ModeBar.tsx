import { Pressable, ScrollView, Text } from "react-native";
import { styles } from "../styles";

interface ModeBarProps {
  mode: "fast" | "deep";
  onModeChange: (mode: "fast" | "deep") => void;
}

export function ModeBar(props: ModeBarProps) {
  const isDeep = props.mode === "deep";

  return (
    <ScrollView
      horizontal
      style={styles.modeBarScroll}
      contentContainerStyle={styles.modeBar}
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
    >
      <Pressable
        style={[styles.modeChip, isDeep && styles.modeChipActive]}
        onPress={() => props.onModeChange(isDeep ? "fast" : "deep")}
      >
        <Text style={[styles.modeText, isDeep && styles.modeTextActive]}>✺ 思考</Text>
      </Pressable>
    </ScrollView>
  );
}
