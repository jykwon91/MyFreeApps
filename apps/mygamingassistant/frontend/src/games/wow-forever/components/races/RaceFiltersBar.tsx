import RaceFilterChip from "@/games/wow-forever/components/races/RaceFilterChip";
import ChoiceSelect from "@/games/wow-forever/components/shared/ChoiceSelect";
import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import {
  RACE_FACTION_LABEL,
  RACE_FACTION_ORDER,
  RACIAL_STATUS_LABEL,
  RACIAL_STATUS_ORDER,
} from "@/games/wow-forever/data/races/racesConfig";
import { isDefaultRaceFilters } from "@/games/wow-forever/lib/races/raceFilterParams";
import type { RaceFilterCounts } from "@/games/wow-forever/types/races/raceFilterCounts";
import type { RaceFilters } from "@/games/wow-forever/types/races/raceFilters";

interface RaceFiltersBarProps {
  filters: RaceFilters;
  counts: RaceFilterCounts;
  onChange: (patch: Partial<RaceFilters>) => void;
  onReset: () => void;
}

const CLASS_IDS: readonly WowClassId[] = WOW_CLASSES.map((c) => c.id);
const CLASS_LABELS = Object.fromEntries(WOW_CLASSES.map((c) => [c.id, c.name])) as Readonly<Record<WowClassId, string>>;

/** Faction and status chips (with counts), "Only changed", and a class picker ("which races can be a Warlock"). */
export default function RaceFiltersBar({ filters, counts, onChange, onReset }: RaceFiltersBarProps) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-testid="race-filters">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Faction">
        {RACE_FACTION_ORDER.map((id) => (
          <RaceFilterChip
            key={id}
            label={RACE_FACTION_LABEL[id]}
            count={counts.faction[id]}
            pressed={filters.faction === id}
            onClick={() => onChange({ faction: filters.faction === id ? null : id })}
            testId={`race-faction-${id}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Racial status">
        {RACIAL_STATUS_ORDER.map((id) => (
          <RaceFilterChip
            key={id}
            label={RACIAL_STATUS_LABEL[id]}
            count={counts.status[id]}
            pressed={filters.status === id}
            onClick={() => onChange({ status: filters.status === id ? null : id })}
            testId={`race-status-${id}`}
          />
        ))}
        <RaceFilterChip
          label="Only changed"
          count={counts.changed}
          pressed={filters.changedOnly}
          onClick={() => onChange({ changedOnly: !filters.changedOnly })}
          testId="race-changed-only"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <ChoiceSelect
          id="race-class"
          label="Can be a"
          options={CLASS_IDS}
          labels={CLASS_LABELS}
          value={filters.classId ?? undefined}
          onChange={(id) => onChange({ classId: id ?? null })}
          emptyLabel="Any class"
        />
        {!isDefaultRaceFilters(filters) ? (
          <button type="button" onClick={onReset} className="rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40">
            Reset filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
