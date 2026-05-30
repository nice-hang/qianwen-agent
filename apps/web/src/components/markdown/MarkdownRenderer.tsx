import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { TableBlock } from "./TableBlock";
import "./MarkdownRenderer.css";

interface MarkdownRendererProps {
  content: string;
}

const components = {
  a(props: ComponentPropsWithoutRef<"a">) {
    return <a {...props} rel="noreferrer" target="_blank" />;
  },
  code(props: ComponentPropsWithoutRef<"code">) {
    const { children, className, ...rest } = props;
    const match = /language-(\w+)/.exec(className ?? "");

    if (match) {
      return (
        <CodeBlock
          code={String(children).replace(/\n$/, "")}
          language={match[1]}
        />
      );
    }

    return (
      <code className={className ? `md-inline-code ${className}` : "md-inline-code"} {...rest}>
        {children}
      </code>
    );
  },
  table(props: ComponentPropsWithoutRef<"table">) {
    return (
      <TableBlock>
        <table {...props} />
      </TableBlock>
    );
  }
} satisfies Components;

export function MarkdownRenderer(props: MarkdownRendererProps) {
  return (
    <div className="markdown-renderer">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {props.content}
      </ReactMarkdown>
    </div>
  );
}
