import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { Conversation } from "@qianwen-agent/shared";
import { styles } from "../styles";

interface SidebarProps {
  activeConversationId?: string;
  conversations: Conversation[];
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (conversationId: string) => void;
}

export function Sidebar(props: SidebarProps) {
  return (
    <Modal animationType="slide" transparent visible={props.isOpen} onRequestClose={props.onClose}>
      <View style={styles.sidebarOverlay}>
        <View style={styles.sidebar}>
          <View style={styles.sidebarHead}>
            <Text style={styles.sidebarTitle}>千问</Text>
            <Pressable onPress={props.onClose}>
              <Text style={styles.sidebarClose}>×</Text>
            </Pressable>
          </View>
          <Pressable style={styles.newChatButton} onPress={props.onNewChat}>
            <Text style={styles.newChatText}>⌗ 新建对话</Text>
          </Pressable>
          <Text style={styles.sidebarSection}>今天</Text>
          <ScrollView>
            {props.conversations.map((conversation) => (
              <Pressable
                key={conversation.id}
                style={[
                  styles.conversationItem,
                  conversation.id === props.activeConversationId && styles.conversationItemActive
                ]}
                onPress={() => props.onSelect(conversation.id)}
              >
                <Text style={styles.conversationText} numberOfLines={1}>
                  {conversation.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <Pressable style={styles.sidebarBackdrop} onPress={props.onClose} />
      </View>
    </Modal>
  );
}

