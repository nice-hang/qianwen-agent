import Markdown, { type RenderRules } from "react-native-markdown-display";
import { Linking, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { styles } from "../styles";

interface MarkdownTextProps {
  content: string;
  variant: "answer" | "thinking";
}

export function MarkdownText(props: MarkdownTextProps) {
  return (
    <Markdown
      onLinkPress={(url) => {
        void Linking.openURL(url);
        return false;
      }}
      rules={markdownRules}
      style={props.variant === "thinking" ? thinkingMarkdownStyles : answerMarkdownStyles}
    >
      {props.content}
    </Markdown>
  );
}

const markdownRules: RenderRules = {
  code_block: (node, _children, _parent, _markdownStyles, inheritedStyles = {}) =>
    renderCodeBlock(node.key, node.content, inheritedStyles),
  fence: (node, _children, _parent, _markdownStyles, inheritedStyles = {}) =>
    renderCodeBlock(node.key, node.content, inheritedStyles)
};

function renderCodeBlock(key: string, content: string, inheritedStyles: object) {
  return (
    <ScrollView
      key={key}
      horizontal
      style={styles.codeScroll}
      showsHorizontalScrollIndicator={false}
    >
      <Text style={[inheritedStyles, styles.codeText]}>{trimTrailingNewline(content)}</Text>
    </ScrollView>
  );
}

function trimTrailingNewline(content: string) {
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}

function createMarkdownStyles(color: string, fontSize: number, lineHeight: number) {
  return StyleSheet.create({
    body: {
      color,
      fontSize,
      lineHeight
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 10
    },
    text: {
      color,
      fontSize,
      lineHeight
    },
    textgroup: {
      color,
      fontSize,
      lineHeight
    },
    heading1: {
      color: "#202124",
      fontSize: 22,
      fontWeight: "700",
      lineHeight: 32,
      marginTop: 4,
      marginBottom: 10
    },
    heading2: {
      color: "#202124",
      fontSize: 20,
      fontWeight: "700",
      lineHeight: 30,
      marginTop: 4,
      marginBottom: 10
    },
    heading3: {
      color: "#202124",
      fontSize: 18,
      fontWeight: "700",
      lineHeight: 28,
      marginTop: 4,
      marginBottom: 8
    },
    heading4: {
      color: "#202124",
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 26,
      marginTop: 4,
      marginBottom: 8
    },
    strong: {
      fontWeight: "700"
    },
    em: {
      fontStyle: "italic"
    },
    s: {
      textDecorationLine: "line-through"
    },
    bullet_list: {
      marginBottom: 10
    },
    ordered_list: {
      marginBottom: 10
    },
    list_item: {
      marginBottom: 4
    },
    bullet_list_icon: {
      color,
      fontSize,
      lineHeight,
      width: 22
    },
    ordered_list_icon: {
      color,
      fontSize,
      lineHeight,
      width: 30
    },
    bullet_list_content: {
      flex: 1
    },
    ordered_list_content: {
      flex: 1
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: "#dedede",
      paddingLeft: 12,
      marginBottom: 10
    },
    code_inline: {
      color: "#4b4b4b",
      backgroundColor: "#f2f2f2",
      borderRadius: 4,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      fontSize: Math.max(13, fontSize - 2)
    },
    fence: {
      color: "#202124",
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      fontSize: 14,
      lineHeight: 21
    },
    code_block: {
      color: "#202124",
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      fontSize: 14,
      lineHeight: 21
    },
    link: {
      color: "#2f5bea",
      textDecorationLine: "underline"
    },
    hr: {
      backgroundColor: "#e8e8e8",
      height: 1,
      marginVertical: 12
    },
    table: {
      borderWidth: 1,
      borderColor: "#e6e6e6",
      borderRadius: 8,
      marginBottom: 10,
      overflow: "hidden"
    },
    thead: {
      backgroundColor: "#f7f7f7"
    },
    tr: {
      flexDirection: "row"
    },
    th: {
      flex: 1,
      borderRightWidth: 1,
      borderRightColor: "#e6e6e6",
      padding: 8
    },
    td: {
      flex: 1,
      borderTopWidth: 1,
      borderRightWidth: 1,
      borderColor: "#e6e6e6",
      padding: 8
    }
  });
}

const answerMarkdownStyles = createMarkdownStyles("#202124", 17, 28);
const thinkingMarkdownStyles = createMarkdownStyles("#9a9a9a", 15, 24);

