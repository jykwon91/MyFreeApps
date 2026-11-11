import type { ResearchSource } from "@myjobhunter/api-client/types/research-source";
import { researchSourceUrl } from "@myjobhunter/api-client/utils/researchSourceUrl";

interface SourcesListProps {
  sources: ResearchSource[];
}

/** The pages the research came from. Only an http or https address is a link; anything else is plain text. */
export default function SourcesList({ sources }: SourcesListProps) {
  return (
    <ul className="mt-2 space-y-1.5">
      {sources.map((source) => {
        const url = researchSourceUrl(source);
        const name = source.title ?? source.url;
        return (
          <li key={source.id}>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline break-all"
              >
                {name}
              </a>
            ) : (
              <span className="text-xs break-all">{name}</span>
            )}
            {source.snippet ? (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{source.snippet}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
