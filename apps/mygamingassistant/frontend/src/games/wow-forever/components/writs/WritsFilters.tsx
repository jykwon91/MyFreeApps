import { Button } from "@platform/ui";
import WritsLocationSelect from "@/games/wow-forever/components/writs/WritsLocationSelect";
import WritsSortSelect from "@/games/wow-forever/components/writs/WritsSortSelect";
import WritsTierFilter from "@/games/wow-forever/components/writs/WritsTierFilter";
import { locationOptions, tierCounts } from "@/games/wow-forever/lib/writs/writFacets";
import type { WritFilters } from "@/games/wow-forever/types/writs/writFilters";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";

interface WritsFiltersProps {
  /** Every writ, unfiltered: the counts are worked out from these. */
  rows: readonly WritRow[];
  shown: number;
  filters: WritFilters;
  sort: WritSort;
  onFilters: (patch: Partial<WritFilters>) => void;
  onSort: (sort: WritSort) => void;
  onClear: () => void;
}

/** Tier, turn-in location, "Only deals", the phone's sort, and "Showing N of M" with a way to clear the filters. */
export default function WritsFilters({ rows, shown, filters, sort, onFilters, onSort, onClear }: WritsFiltersProps) {
  const active = filters.tier !== null || filters.location !== null || filters.dealsOnly;
  return (
    <section aria-label="Filters" className="space-y-3">
      <WritsTierFilter value={filters.tier} counts={tierCounts(rows, filters)} onChange={(tier) => onFilters({ tier })} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,20rem)]">
        <WritsLocationSelect
          value={filters.location}
          options={locationOptions(rows, filters)}
          onChange={(location) => onFilters({ location })}
        />
        <WritsSortSelect value={sort} onChange={onSort} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.dealsOnly}
            onChange={(e) => onFilters({ dealsOnly: e.target.checked })}
            className="h-5 w-5"
          />
          Only deals
        </label>
        <p className="text-sm text-muted-foreground" data-testid="writs-count">
          Showing {shown} of {rows.length}
        </p>
        {active ? (
          <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </section>
  );
}
