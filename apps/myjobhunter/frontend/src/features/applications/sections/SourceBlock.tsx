import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

interface SourceBlockProps {
  source: ApplicationEvent["source"];
}

export default function SourceBlock({ source }: SourceBlockProps) {
  if (source === "manual") return null;
  return <p className="text-xs text-muted-foreground mt-1">via {source}</p>;
}
