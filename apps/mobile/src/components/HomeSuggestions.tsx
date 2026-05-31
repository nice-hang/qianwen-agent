import { Pressable, Text, View } from "react-native";
import { styles } from "../styles";

const suggestions = [
  "今年高考穿什么颜色的衣服有好运势？",
  "AI能看穿谎言吗？",
  "给我制定一个月瘦20斤的健康计划"
];

interface HomeSuggestionsProps {
  onPick: (text: string) => void;
}

export function HomeSuggestions(props: HomeSuggestionsProps) {
  return (
    <View style={styles.home}>
      <View style={styles.brandRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>千</Text>
        </View>
        <View>
          <Text style={styles.heroTitle}>我是千问</Text>
          <Text style={styles.heroSubTitle}>为你答疑 办事 创作，随时找我聊天</Text>
        </View>
      </View>
      <View style={styles.suggestionList}>
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion}
            style={styles.suggestion}
            onPress={() => props.onPick(suggestion)}
          >
            <Text style={styles.suggestionText}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

