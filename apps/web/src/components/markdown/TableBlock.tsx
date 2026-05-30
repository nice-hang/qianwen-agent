import type { ReactNode } from "react";

interface TableBlockProps {
  children: ReactNode;
}

export function TableBlock(props: TableBlockProps) {
  return <div className="md-table-block">{props.children}</div>;
}
