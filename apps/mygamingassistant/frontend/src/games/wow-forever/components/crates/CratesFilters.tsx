import { Button } from "@platform/ui";
import ProfessionSortSelect from "@/games/wow-forever/components/professionTiers/ProfessionSortSelect";
import ProfessionTierFilter from "@/games/wow-forever/components/professionTiers/ProfessionTierFilter";
import { CRATE_SORT_CHOICES } from "@/games/wow-forever/data/professions/crates/crateSortOptions";
import { CRATE_TIER_LABEL, CRATE_TIERS } from "@/games/wow-forever/data/professions/crates/crateTiers";
import { crateTierCounts } from "@/games/wow-forever/lib/crates/crateFacets";
import type { CrateFilters } from "@/games/wow-forever/types/crates/crateFilters";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";
import type { CrateSort } from "@/games/wow-forever/types/crates/crateSort";

interface CratesFiltersProps {
  /** Every crate, unfiltered: the counts are worked out from these. */
  rows: readonly CrateRow[];
  shown: number;
  filters: CrateFilters;
  sort: CrateSort;
  onFilters: (patch: Partial<CrateFilters>) => void;
  onSort: (sort: CrateSort) => void;
  onClear: () => void;
}

/** Tier, the phone's sort, and "Showing N of M" with a way to clear the filter. */
export default function CratesFilters({ rows, shown, filters, sort, onFilters, onSort, onClear }: CratesFiltersProps) {
  return (
    <section aria-label="Filters" className="space-y-3">
      <ProfessionTierFilter
        tiers={CRATE_TIERS}
        labels={CRATE_TIER_LABEL}
        value={filters.tier}
        counts={crateTierCounts(rows, filters)}
        onChange={(tier) => onFilters({ tier })}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,20rem)]">
        <ProfessionSortSelect id="crate-sort" choices={CRATE_SORT_CHOICES} value={sort} onChange={onSort} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground" data-testid="crates-count">
          Showing {shown} of {rows.length}
        </p>
        {filters.tier !== null ? (
          <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </section>
  );
}
