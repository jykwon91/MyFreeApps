import { ExternalLink } from "lucide-react";
import { DISCOVERY_DETAIL_COPY } from "@myrecipes/api-client/constants/discoveryDetailCopy";

interface Props {
  url: string;
}

/**
 * The page a result came from, in a new tab. The URL came off the open web, so the link carries
 * rel="noopener noreferrer", and the reader keeps their place in Discover either way.
 */
export default function DiscoveryOriginalLink({ url }: Props) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary underline underline-offset-2"
    >
      {DISCOVERY_DETAIL_COPY.viewOriginal}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}
