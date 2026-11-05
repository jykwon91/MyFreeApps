import { Button } from "@platform/ui";

interface ItemSearchNoResultsProps {
  query: string;
  /** Matches hidden by the filters; 0 when only the name didn't match. */
  hiddenCount: number;
  filtersActive: boolean;
  onClearFilters: () => void;
}

/** Nothing matched: a spelling hint, and a way out when filters are hiding matches. */
export default function ItemSearchNoResults({ query, hiddenCount, filtersActive, onClearFilters }: ItemSearchNoResultsProps) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        No items match “{query}”. Check the spelling, or type fewer words — the start of one word is enough.
      </p>
      {filtersActive ? (
        <Button variant="secondary" size="sm" onClick={onClearFilters}>
          {hiddenCount > 0 ? `Clear filters (${hiddenCount} hidden)` : "Clear filters"}
        </Button>
      ) : null}
    </div>
  );
}
