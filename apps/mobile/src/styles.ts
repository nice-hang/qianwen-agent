import { Platform, StatusBar, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0
  },
  keyboard: {
    flex: 1
  },
  content: {
    flex: 1,
    backgroundColor: "#ffffff"
  },
  scroll: {
    flex: 1
  },
  topBar: {
    minHeight: 54,
    paddingHorizontal: 22,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  topIcon: {
    color: "#202124",
    fontSize: 28
  },
  topAction: {
    color: "#202124",
    fontSize: 30
  },
  topSpacer: {
    width: 30
  },
  title: {
    flex: 1,
    marginHorizontal: 16,
    color: "#202124",
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center"
  },
  emptyScroll: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 28,
    paddingTop: 210,
    paddingBottom: 28
  },
  chatScroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 28
  },
  home: {
    gap: 22
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2efff"
  },
  avatarText: {
    color: "#7567ca",
    fontSize: 18,
    fontWeight: "700"
  },
  heroTitle: {
    color: "#dedaf0",
    fontSize: 31,
    fontWeight: "700"
  },
  heroSubTitle: {
    marginTop: 8,
    color: "#9b9b9b",
    fontSize: 16,
    fontWeight: "600"
  },
  suggestionList: {
    alignItems: "flex-start",
    gap: 14
  },
  suggestion: {
    maxWidth: "100%",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#eeeeee",
    borderRadius: 14,
    backgroundColor: "#ffffff"
  },
  suggestionText: {
    color: "#202124",
    fontSize: 16,
    lineHeight: 22
  },
  userRow: {
    alignItems: "flex-end",
    marginBottom: 18
  },
  userBubble: {
    maxWidth: "82%",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: "#eef7ff"
  },
  userText: {
    color: "#202124",
    fontSize: 17,
    lineHeight: 24
  },
  messageImageGrid: {
    maxWidth: "82%",
    marginBottom: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8
  },
  messageImage: {
    width: 140,
    height: 140,
    borderRadius: 14,
    backgroundColor: "#f4f4f4"
  },
  assistantRow: {
    alignItems: "stretch",
    marginBottom: 18
  },
  thinkingCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: "#f6f6f6",
    gap: 10
  },
  thinkingPill: {
    alignSelf: "flex-start",
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: "#f4f4f4",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  thinkingPillText: {
    color: "#777777",
    fontSize: 16,
    fontWeight: "500"
  },
  thinkingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  thinkingTitle: {
    color: "#777777",
    fontSize: 16,
    fontWeight: "600"
  },
  thinkingArrow: {
    color: "#9a9a9a",
    fontSize: 18
  },
  dots: {
    color: "#9a9a9a",
    fontSize: 28,
    letterSpacing: 4
  },
  sourcesChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#ffffff"
  },
  sourcesChipText: {
    color: "#9a9a9a",
    fontSize: 14
  },
  answerBlock: {
    marginTop: 12
  },
  codeScroll: {
    marginBottom: 10
  },
  codeText: {
    minWidth: "100%",
    padding: 14,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f6f6f6",
    color: "#202124",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 14,
    lineHeight: 21
  },
  modeBarScroll: {
    flexGrow: 0,
    maxHeight: 62
  },
  modeBar: {
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 10
  },
  modeChip: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff"
  },
  modeChipActive: {
    borderColor: "#e0e0ff",
    backgroundColor: "#f3f3ff"
  },
  modeText: {
    color: "#202124",
    fontSize: 16
  },
  modeTextActive: {
    color: "#332ee6"
  },
  composerWrap: {
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === "android" ? 18 : 8
  },
  composer: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#eeeeee",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  voiceIcon: {
    color: "#202124",
    fontSize: 26
  },
  input: {
    flex: 1,
    maxHeight: 110,
    color: "#202124",
    fontSize: 17,
    lineHeight: 24,
    paddingVertical: 8
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#202124"
  },
  sendButtonDisabled: {
    backgroundColor: "#bdbdbd"
  },
  sendText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700"
  },
  disclaimer: {
    marginTop: 8,
    textAlign: "center",
    color: "#c7c7c7",
    fontSize: 12
  },
  errorText: {
    marginHorizontal: 28,
    marginBottom: 4,
    color: "#b42318",
    fontSize: 13
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.42)"
  },
  sidebar: {
    width: "80%",
    maxWidth: 340,
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 24,
    backgroundColor: "#ffffff"
  },
  sidebarBackdrop: {
    flex: 1
  },
  sidebarHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sidebarTitle: {
    color: "#202124",
    fontSize: 26,
    fontWeight: "700"
  },
  sidebarClose: {
    color: "#202124",
    fontSize: 30
  },
  newChatButton: {
    marginTop: 26,
    marginBottom: 26,
    minHeight: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8f8f8"
  },
  newChatText: {
    color: "#202124",
    fontSize: 18,
    fontWeight: "600"
  },
  sidebarSection: {
    marginBottom: 12,
    color: "#b0b0b0",
    fontSize: 14
  },
  conversationItem: {
    minHeight: 48,
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  conversationItemActive: {
    backgroundColor: "#f7f7f7"
  },
  conversationText: {
    color: "#202124",
    fontSize: 17
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.28)"
  },
  sheet: {
    maxHeight: "72%",
    padding: 22,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: "#ffffff"
  },
  sheetTitle: {
    marginBottom: 14,
    color: "#202124",
    fontSize: 20,
    fontWeight: "700"
  },
  sourceItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee"
  },
  sourceTitle: {
    color: "#202124",
    fontSize: 16,
    fontWeight: "600"
  },
  sourceMeta: {
    marginTop: 4,
    color: "#777777",
    fontSize: 13
  },
  sourceSnippet: {
    marginTop: 6,
    color: "#555555",
    fontSize: 14,
    lineHeight: 21
  }
});
