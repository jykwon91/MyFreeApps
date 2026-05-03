import type { PlaceholderProvenance } from "@/shared/types/lease/placeholder-provenance";

interface Props {
  provenance: PlaceholderProvenance;
}

const BADGE_CONFIG: Record<
  NonNullable<Exclude<PlaceholderProvenance, null>>,
  { label: string; className: string }
> = {
  applicant: {
    label: "from applicant",
    className: "bg-muted text-muted-foreground border border-border",
  },
  inquiry: {
    label: "from inquiry",
    className: "bg-purple-100 text-purple-700 border border-purple-200",
  },
  today: {
    label: "today's date",
    className: "bg-muted text-muted-foreground border border-border",
  },
  manual: {
    label: "manually edited",
    className: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  },
};

/**
 * Small inline badge indicating where a placeholder value came from.
 *
 * Renders nothing when ``provenance`` is ``null`` (no ``default_source`` on
 * the placeholder — manual entry only).
 */
export default function ProvenanceBadge({ provenance }: Props) {
  if (provenance === null) return null;

  const config = BADGE_CONFIG[provenance];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${config.className}`}
      data-testid={`provenance-badge-${provenance}`}
    >
      {config.label}
    </span>
  );
}
