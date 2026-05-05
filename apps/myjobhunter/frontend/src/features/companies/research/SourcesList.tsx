import type { ResearchSource } from "@/types/research-source";

interface SourcesListProps {
  sources: ResearchSource[];
}

export default function SourcesList({ sources }: SourcesListProps) {
  return (
    <ul className="mt-2 space-y-1.5">
      {sources.map((source) => (
        <li key={source.id}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline break-all"
          >
            {source.title ?? source.url}
          </a>
          {source.snippet ? (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{source.snippet}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
