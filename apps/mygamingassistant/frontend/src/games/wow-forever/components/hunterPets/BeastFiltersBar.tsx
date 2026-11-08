import ChoiceSelect from "@/games/wow-forever/components/shared/ChoiceSelect";
import { BEAST_SORT_LABEL, DEFAULT_BEAST_SORT } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import type { BeastFilters } from "@/games/wow-forever/types/hunterPets/beastFilters";
import type { BeastSort } from "@/games/wow-forever/types/hunterPets/beastSort";
import type { HunterFamily } from "@/games/wow-forever/types/hunterPets/hunterFamily";

const FIELD =
  "min-h-[44px] w-full rounded-md border bg-card px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";
const OTHER_SORTS: readonly BeastSort[] = Object.keys(BEAST_SORT_LABEL).filter((s): s is BeastSort => s !== DEFAULT_BEAST_SORT);

interface BeastFiltersBarProps {
  families: readonly HunterFamily[];
  filters: BeastFilters;
  onChange: (patch: Partial<BeastFilters>) => void;
}

/** Search, family and sort for the beast list. */
export default function BeastFiltersBar({ families, filters, onChange }: BeastFiltersBarProps) {
  const slugs = families.map((f) => f.slug);
  const labels = Object.fromEntries(families.map((f) => [f.slug, f.name]));
  const family = filters.family === null ? undefined : slugs.find((s) => s === filters.family);
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-3 sm:p-4" data-testid="beast-filters">
      <div className="flex flex-col gap-1">
        <label htmlFor="beast-search" className="text-sm font-medium">
          Search
        </label>
        <input
          id="beast-search"
          type="search"
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="Beast, zone or ability"
          className={FIELD}
        />
      </div>
      <ChoiceSelect
        id="beast-family"
        label="Family"
        options={slugs}
        labels={labels}
        value={family}
        onChange={(slug) => onChange({ family: slug ?? null })}
        emptyLabel="Every family"
      />
      <ChoiceSelect
        id="beast-sort"
        label="Sort by"
        options={OTHER_SORTS}
        labels={BEAST_SORT_LABEL}
        value={filters.sort === DEFAULT_BEAST_SORT ? undefined : filters.sort}
        onChange={(sort) => onChange({ sort: sort ?? DEFAULT_BEAST_SORT })}
        emptyLabel={BEAST_SORT_LABEL[DEFAULT_BEAST_SORT]}
      />
    </div>
  );
}
