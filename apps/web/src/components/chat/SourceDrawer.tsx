import type { SearchSource } from "@qianwen-agent/shared";

export function SourceDrawer(props: {
  title: string;
  sources: SearchSource[];
  onClose: () => void;
  resolveUrl: (url: string) => string;
}) {
  return (
    <aside className="source-drawer" aria-label="Search sources">
      <div className="source-drawer-header">
        <strong>{props.title}</strong>
        <button type="button" onClick={props.onClose} aria-label="Close sources">
          ×
        </button>
      </div>
      <div className="source-list">
        {props.sources.map((source, index) => (
          <a
            className="source-item"
            href={props.resolveUrl(source.url)}
            key={`${source.url}-${index}`}
            rel="noreferrer"
            target="_blank"
          >
            <span className="source-index">{index + 1}</span>
            <span className="source-main">
              <strong>{source.title}</strong>
              <span>{source.siteName ?? source.url}</span>
              {source.snippet ? <p>{source.snippet}</p> : null}
            </span>
          </a>
        ))}
      </div>
    </aside>
  );
}
