import { useEffect, useRef, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock(props: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [shouldHighlight, setShouldHighlight] = useState(false);
  const codeBlockRef = useRef<HTMLDivElement>(null);
  const language = props.language || "text";

  useEffect(() => {
    const codeBlock = codeBlockRef.current;
    if (!codeBlock || shouldHighlight) return;

    if (!("IntersectionObserver" in window)) {
      setShouldHighlight(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        setShouldHighlight(true);
        observer.disconnect();
      },
      { root: null, rootMargin: "160px 0px" }
    );
    observer.observe(codeBlock);

    return () => observer.disconnect();
  }, [shouldHighlight]);

  async function copyCode() {
    if (!globalThis.navigator?.clipboard) return;

    await globalThis.navigator.clipboard.writeText(props.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="md-code-block" ref={codeBlockRef}>
      <div className="md-code-header">
        <span>{language}</span>
        <button type="button" onClick={copyCode}>
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <div className="md-code-body">
        {shouldHighlight ? (
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
        ) : (
          <pre className="md-code-plain">
            <code>{props.code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
