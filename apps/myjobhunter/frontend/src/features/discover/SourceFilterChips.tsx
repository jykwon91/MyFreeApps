import type { DiscoverySource } from "@/types/discovery/discovery-source";

interface SourceFilterChipsProps {
  sources: DiscoverySource[];
  activeSourceId: string | null;
  onSelect: (sourceId: string | null) => void;
}

/**
 * Horizontal filter-chip strip for filtering the discover inbox by saved search.
 * "All" chip is selected by default (activeSourceId === null).
 * On narrow viewports the strip is horizontally scrollable rather than wrapping.
 */
export default function SourceFilterChips({
  sources,
  activeSourceId,
  onSelect,
}: SourceFilterChipsProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      role="group"
      aria-label="Filter by saved search"
    >
      <Chip
        label="All"
        isActive={activeSourceId === null}
        onClick={() => onSelect(null)}
        testId="source-chip-all"
      />
      {sources.map((source) => (
        <Chip
          key={source.id}
          label={source.name || source.source}
          isActive={activeSourceId === source.id}
          onClick={() => onSelect(source.id)}
          testId={`source-chip-${source.id}`}
        />
      ))}
    </div>
  );
}

interface ChipProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  testId: string;
}

function Chip({ label, isActive, onClick, testId }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={isActive}
      className={[
        "shrink-0 px-3 py-1 text-sm rounded-full border transition-colors",
        "whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-foreground border-border hover:bg-muted",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
