import ChoiceSelect from "@/games/wow-forever/components/shared/ChoiceSelect";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import {
  CHANGE_CATEGORIES,
  CHANGE_CATEGORY_LABEL,
  CLASS_TAGGED_CATEGORIES,
} from "@/games/wow-forever/data/changes/changeCategories";
import { CHANGE_CLASS_IDS, CHANGE_CLASS_LABELS } from "@/games/wow-forever/data/changes/changeClassOptions";
import { CHANGE_INDEX } from "@/games/wow-forever/data/changes/changeFiles";
import type { ChangeFilters } from "@/games/wow-forever/types/changes/changeFilters";

const CATEGORY_OPTIONS = CHANGE_CATEGORIES.map((id) => {
  const { changed, new: added } = CHANGE_INDEX.counts[id];
  return { id, label: `${CHANGE_CATEGORY_LABEL[id]} (${(changed + added).toLocaleString()})` };
});
const FIELD = "min-h-[44px] w-full rounded-md border bg-card px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

interface ChangeFiltersBarProps {
  filters: ChangeFilters;
  onChange: (patch: Partial<ChangeFilters>) => void;
}

/** Category, class (where rows have one), search and "since last build" (once a second refresh has run). */
export default function ChangeFiltersBar({ filters, onChange }: ChangeFiltersBarProps) {
  const sinceAvailable = CHANGE_INDEX.previousBuild !== null;
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-testid="change-filters">
      <SegmentedToggle
        label="Category"
        options={CATEGORY_OPTIONS}
        value={filters.category}
        onChange={(category) => onChange({ category })}
        className="flex-wrap"
      />
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div className="flex flex-col gap-1">
          <label htmlFor="change-search" className="text-sm font-medium">
            Search
          </label>
          <input
            id="change-search"
            type="search"
            placeholder="Name, or a word from the change"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            className={FIELD}
          />
        </div>
        {CLASS_TAGGED_CATEGORIES.has(filters.category) ? (
          <ChoiceSelect
            id="change-class"
            label="Class"
            options={CHANGE_CLASS_IDS}
            labels={CHANGE_CLASS_LABELS}
            value={filters.classId ?? undefined}
            onChange={(classId) => onChange({ classId: classId ?? null })}
            emptyLabel="Every class"
          />
        ) : null}
      </div>
      {sinceAvailable ? (
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.sinceLastBuild}
            onChange={(e) => onChange({ sinceLastBuild: e.target.checked })}
            className="h-5 w-5"
          />
          Only what changed since build {CHANGE_INDEX.previousBuild}
        </label>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="change-since-note">
          "Only what changed since the last build" appears after the next game-data refresh — this is the first build compared.
        </p>
      )}
    </div>
  );
}
