import NumberField from "@/games/wow-forever/components/shared/NumberField";
import SpellbookFilterChip from "@/games/wow-forever/components/spellbook/SpellbookFilterChip";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import { isDefaultSpellbookFilters, toSpellbookLevel } from "@/games/wow-forever/lib/spellbook/spellbookFilterParams";
import type { SpellbookFilterResult } from "@/games/wow-forever/types/spellbook/spellbookFilterResult";
import type { SpellbookFilters } from "@/games/wow-forever/types/spellbook/spellbookFilters";
import type { SpellbookTab } from "@/games/wow-forever/types/spellbook/spellbookTab";

const FIELD = "min-h-[44px] w-full rounded-md border bg-card px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

interface SpellbookFiltersBarProps {
  tabs: readonly SpellbookTab[];
  filters: SpellbookFilters;
  result: SpellbookFilterResult;
  onChange: (patch: Partial<SpellbookFilters>) => void;
  onReset: () => void;
}

/** Search, "learnable by level", the spell tabs and "Only different from Classic", each chip with its count. */
export default function SpellbookFiltersBar({ tabs, filters, result, onChange, onReset }: SpellbookFiltersBarProps) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-testid="spellbook-filters">
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div className="flex flex-col gap-1">
          <label htmlFor="spellbook-search" className="text-sm font-medium">
            Search
          </label>
          <input
            id="spellbook-search"
            type="search"
            placeholder="Spell name, or a word from its tooltip"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            className={FIELD}
          />
        </div>
        <NumberField
          label="Your level"
          value={filters.level}
          onChange={(v) => onChange({ level: toSpellbookLevel(v) })}
          min={1}
          max={MAX_LEVEL}
        />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Spell tab">
        <SpellbookFilterChip
          label="All tabs"
          count={result.allTabsCount}
          pressed={filters.tab === null}
          onClick={() => onChange({ tab: null })}
          testId="spellbook-tab-all"
        />
        {tabs.map((tab) => (
          <SpellbookFilterChip
            key={tab.id}
            label={tab.name}
            count={result.tabCounts.get(tab.id) ?? 0}
            pressed={filters.tab === tab.id}
            onClick={() => onChange({ tab: filters.tab === tab.id ? null : tab.id })}
            testId={`spellbook-tab-${tab.id}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SpellbookFilterChip
          label="Only different from Classic"
          count={result.differentCount}
          pressed={filters.differentOnly}
          onClick={() => onChange({ differentOnly: !filters.differentOnly })}
          testId="spellbook-different-chip"
        />
        {!isDefaultSpellbookFilters(filters) ? (
          <button type="button" onClick={onReset} className="rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40">
            Reset filters
          </button>
        ) : null}
      </div>
      {filters.level !== null ? (
        <p className="text-xs text-muted-foreground">Showing spells with a rank you can learn by level {filters.level}. Talent spells open in the talent tree, so they're left out.</p>
      ) : null}
    </div>
  );
}
