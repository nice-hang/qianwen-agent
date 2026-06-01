// Stage 1 标题保持确定性：直接取首行，不额外调用模型生成。
export function normalizeConversationTitle(title: string): string {
  const firstLine = title.trim().split(/\r?\n/)[0] ?? "";
  const normalized = firstLine.replace(/\s+/g, " ").trim();

  if (!normalized) return "New chat";
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
}
