import type { SearchSource } from "@qianwen-agent/shared";

export function dedupeSources(sources: SearchSource[]): SearchSource[] | undefined {
  const seen = new Set<string>();
  const deduped: SearchSource[] = [];

  for (const source of sources) {
    const key = source.url || source.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }

  return deduped.length > 0 ? deduped : undefined;
}
