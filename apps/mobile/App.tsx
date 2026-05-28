import { Text, View } from "react-native";
import type { ChatMessage } from "@qianwen-agent/shared";

const message: ChatMessage = {
  id: "stage0-mobile-message",
  conversationId: "stage0-mobile-conversation",
  role: "assistant",
  status: "completed",
  content: "Mobile shell can import shared protocol types.",
  createdAt: new Date().toISOString()
};

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 12 }}>
        Qianwen Agent
      </Text>
      <Text>{message.content}</Text>
    </View>
  );
}
