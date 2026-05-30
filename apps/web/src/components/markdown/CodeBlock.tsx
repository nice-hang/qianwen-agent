import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock(props: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const language = props.language || "text";

  async function copyCode() {
    if (!globalThis.navigator?.clipboard) return;

    await globalThis.navigator.clipboard.writeText(props.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <span>{language}</span>
        <button type="button" onClick={copyCode}>
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <div className="md-code-body">
        <SyntaxHighlighter
          language={language}
          style={oneLight}
          PreTag="div"
          showLineNumbers
          wrapLongLines={false}
          customStyle={{
            margin: 0,
            overflow: "auto",
            padding: "14px 16px",
            background: "rgba(17, 17, 51, 0.02)",
            fontSize: 13,
            lineHeight: 1.65
          }}
          codeTagProps={{
            style: {
              fontFamily:
                '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
            }
          }}
        >
          {props.code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
