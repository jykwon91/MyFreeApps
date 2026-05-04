import { ExternalLink } from "lucide-react";

export interface OpenInNewTabLinkProps {
  url: string;
}

export default function OpenInNewTabLink({ url }: OpenInNewTabLinkProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
      data-testid="document-open-in-new-tab"
    >
      <ExternalLink size={12} />
      Open in new tab
    </a>
  );
}
