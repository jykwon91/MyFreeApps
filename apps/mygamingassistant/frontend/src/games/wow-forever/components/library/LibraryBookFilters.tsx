import clsx from "clsx";
import { isDefaultLibraryFilters } from "@/games/wow-forever/lib/library/libraryFilterParams";
import type { LibraryFilters } from "@/games/wow-forever/types/library/libraryFilters";

interface LibraryBookFiltersProps {
  filters: LibraryFilters;
  levels: readonly { itemLevel: number; count: number }[];
  onChange: (patch: Partial<LibraryFilters>) => void;
  onReset: () => void;
}

const CHIP = "rounded-full border px-3 text-sm min-h-[44px]";
const CHIP_ON = "border-primary bg-primary text-primary-foreground";

/** Search, item-level chips (each with its count) and "Hide found". */
export default function LibraryBookFilters({ filters, levels, onChange, onReset }: LibraryBookFiltersProps) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-testid="library-filters">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Search books</span>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="Name or description, e.g. gnome"
          className="min-h-[44px] w-full rounded-md border bg-background px-3"
          data-testid="library-search"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Item level">
        <button
          type="button"
          aria-pressed={filters.itemLevel === null}
          onClick={() => onChange({ itemLevel: null })}
          className={clsx(CHIP, filters.itemLevel === null ? CHIP_ON : "hover:bg-muted/40")}
        >
          Every level
        </button>
        {levels.map(({ itemLevel, count }) => {
          const on = filters.itemLevel === itemLevel;
          return (
            <button
              key={itemLevel}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ itemLevel: on ? null : itemLevel })}
              className={clsx(CHIP, on ? CHIP_ON : "hover:bg-muted/40")}
              data-testid="library-level-chip"
            >
              Item level {itemLevel} ({count})
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          aria-pressed={filters.hideFound}
          onClick={() => onChange({ hideFound: !filters.hideFound })}
          className={clsx(CHIP, filters.hideFound ? CHIP_ON : "hover:bg-muted/40")}
          data-testid="library-hide-found"
        >
          Hide found
        </button>
        {!isDefaultLibraryFilters(filters) ? (
          <button type="button" onClick={onReset} className="rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40">
            Reset filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
